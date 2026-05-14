from __future__ import annotations

import xml.etree.ElementTree as ET
from difflib import SequenceMatcher
from io import BytesIO
from zipfile import ZipFile

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def _extract_runs_from_node(node: ET.Element) -> list[str]:
    texts: list[str] = []
    for t in node.findall(".//w:t", NS):
        if t.text:
            texts.append(t.text.strip())
    return [x for x in texts if x]


def paired_tracked_changes_from_document_root(root: ET.Element) -> list[dict[str, str]]:
    """One change per w:p: aggregate all w:ins and w:del in that paragraph."""
    changes: list[dict[str, str]] = []
    for paragraph in root.findall(".//w:p", NS):
        del_nodes = paragraph.findall(".//w:del", NS)
        ins_nodes = paragraph.findall(".//w:ins", NS)
        deleted_parts = [" ".join(_extract_runs_from_node(d)) for d in del_nodes]
        inserted_parts = [" ".join(_extract_runs_from_node(ins)) for ins in ins_nodes]
        deleted_text = " ".join(p for p in deleted_parts if p).strip()
        inserted_text = " ".join(p for p in inserted_parts if p).strip()
        if not inserted_text and not deleted_text:
            continue
        if inserted_text and deleted_text:
            change_type = "modification"
        elif inserted_text:
            change_type = "addition"
        else:
            change_type = "deletion"
        changes.append(
            {
                "change_type": change_type,
                "inserted_text": inserted_text,
                "deleted_text": deleted_text,
            }
        )
    return changes


def extract_paired_tracked_changes_from_docx(raw_docx: bytes) -> list[dict[str, str]]:
    with ZipFile(BytesIO(raw_docx), "r") as archive:
        document_xml = archive.read("word/document.xml")
    root = ET.fromstring(document_xml)
    return paired_tracked_changes_from_document_root(root)


def _context_paragraphs(items: list[str], start: int, end: int, radius: int = 2) -> tuple[str, str]:
    """Return ±radius paragraphs of context around a slice [start, end) for PRD §7.2."""
    before_start = max(0, start - radius)
    before = "\n\n".join(items[before_start:start]).strip()
    after_end = min(len(items), end + radius)
    after = "\n\n".join(items[end:after_end]).strip()
    return before, after


def changes_from_sequences(base: list[str], redline: list[str]) -> list[dict[str, str]]:
    """Paragraph-level diff with ±2 paragraphs of surrounding context per change.

    Note: this is still a structural diff and not "semantic" in the embedding
    sense (PRD §7 / Audit L1). It is the substrate for the AI classifier, which
    supplies the semantics. Real semantic clustering belongs in the Next.js
    classification step.
    """
    matcher = SequenceMatcher(None, base, redline)
    out: list[dict[str, str]] = []
    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op == "equal":
            continue
        inserted = " ".join(redline[j1:j2]).strip()
        deleted = " ".join(base[i1:i2]).strip()
        if not inserted and not deleted:
            continue
        before_text, _ = _context_paragraphs(base, i1, i2, radius=2)
        _, after_text = _context_paragraphs(redline, j1, j2, radius=2)
        out.append(
            {
                "change_type": op,
                "inserted_text": inserted,
                "deleted_text": deleted,
                "before_text": before_text,
                "after_text": after_text,
            }
        )
    return out
