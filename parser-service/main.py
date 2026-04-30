from fastapi import FastAPI, File, UploadFile
from typing import Any
from io import BytesIO
from zipfile import ZipFile
import xml.etree.ElementTree as ET
import fitz
from docx import Document
from parser_utils import changes_from_sequences

app = FastAPI(title="ClauseIQ Parser Service", version="0.1.0")
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def _extract_runs(node: ET.Element) -> list[str]:
    texts: list[str] = []
    for t in node.findall(".//w:t", NS):
        if t.text:
            texts.append(t.text.strip())
    return [x for x in texts if x]


def extract_tracked_changes_from_docx(raw_docx: bytes) -> list[dict[str, str]]:
    with ZipFile(BytesIO(raw_docx), "r") as archive:
        document_xml = archive.read("word/document.xml")
    root = ET.fromstring(document_xml)

    changes: list[dict[str, str]] = []
    for paragraph in root.findall(".//w:p", NS):
        ins_nodes = paragraph.findall(".//w:ins", NS)
        del_nodes = paragraph.findall(".//w:del", NS)
        for ins in ins_nodes:
            inserted = " ".join(_extract_runs(ins))
            if inserted:
                changes.append(
                    {
                        "change_type": "addition",
                        "inserted_text": inserted,
                        "deleted_text": "",
                    }
                )
        for delete in del_nodes:
            deleted = " ".join(_extract_runs(delete))
            if deleted:
                changes.append(
                    {
                        "change_type": "deletion",
                        "inserted_text": "",
                        "deleted_text": deleted,
                    }
                )
    return changes


def _paragraphs_from_docx(raw_docx: bytes) -> list[str]:
    document = Document(BytesIO(raw_docx))
    return [p.text.strip() for p in document.paragraphs if p.text and p.text.strip()]


def _paragraphs_from_pdf(raw_pdf: bytes) -> list[str]:
    pdf = fitz.open(stream=raw_pdf, filetype="pdf")
    paragraphs: list[str] = []
    for page in pdf:
        blocks = page.get_text("blocks")
        for block in blocks:
            text = block[4].strip()
            if text:
                paragraphs.append(text)
    pdf.close()
    return paragraphs


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract/docx-tracked")
async def extract_docx_tracked(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    document = Document(BytesIO(data))
    paragraphs = [p.text.strip() for p in document.paragraphs if p.text.strip()]
    tracked_changes = extract_tracked_changes_from_docx(data)
    return {
        "path": "docx-tracked",
        "confidence": "high",
        "changes_detected": tracked_changes,
        "tracked_change_count": len(tracked_changes),
        "paragraph_count": len(paragraphs),
        "preview": paragraphs[:12],
    }


@app.post("/extract/docx-diff")
async def extract_docx_diff(base_file: UploadFile = File(...), redline_file: UploadFile = File(...)) -> dict[str, Any]:
    base_data = await base_file.read()
    redline_data = await redline_file.read()
    base_paragraphs = _paragraphs_from_docx(base_data)
    redline_paragraphs = _paragraphs_from_docx(redline_data)
    changes = changes_from_sequences(base_paragraphs, redline_paragraphs)
    return {
        "path": "docx-diff",
        "confidence": "medium",
        "changes_detected": changes,
        "paragraph_count": len(base_paragraphs) + len(redline_paragraphs),
    }


@app.post("/extract/pdf-diff")
async def extract_pdf_diff(base_file: UploadFile = File(...), redline_file: UploadFile = File(...)) -> dict[str, Any]:
    base_data = await base_file.read()
    redline_data = await redline_file.read()
    base_paragraphs = _paragraphs_from_pdf(base_data)
    redline_paragraphs = _paragraphs_from_pdf(redline_data)
    changes = changes_from_sequences(base_paragraphs, redline_paragraphs)
    return {
        "path": "pdf-diff",
        "confidence": "low",
        "changes_detected": changes,
        "paragraph_count": len(base_paragraphs) + len(redline_paragraphs),
    }
