"""Generate two tiny demo lease DOCX files for local smoke testing."""
from docx import Document
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "demo-docs")
os.makedirs(OUT_DIR, exist_ok=True)

BASE_PARAGRAPHS = [
    "COMMERCIAL LEASE AGREEMENT",
    "1. Premises. Landlord leases to Tenant the premises located at 100 Demo Street, Toronto, ON, comprising approximately 18,000 rentable square feet.",
    "2. Term. The term of this Lease shall be five (5) years commencing on January 1, 2026.",
    "3. Base Rent. Tenant shall pay base rent of $34.00 per rentable square foot per year.",
    "4. Operating Costs. Tenant shall pay its proportionate share of Operating Costs. Operating Costs shall be capped at 5% annual increase.",
    "5. Free Rent. Tenant shall receive two (2) months of free base rent at the commencement of the term.",
    "6. Assignment. Tenant may not assign this Lease without Landlord's prior written consent, which shall not be unreasonably withheld.",
    "7. Renewal. Tenant shall have one (1) option to renew for an additional five (5) year term at fair market rent.",
    "8. Indemnity. Tenant shall indemnify Landlord against claims arising from Tenant's negligence.",
]

REDLINE_PARAGRAPHS = [
    "COMMERCIAL LEASE AGREEMENT",
    "1. Premises. Landlord leases to Tenant the premises located at 100 Demo Street, Toronto, ON, comprising approximately 18,000 rentable square feet.",
    "2. Term. The term of this Lease shall be seven (7) years commencing on January 1, 2026.",
    "3. Base Rent. Tenant shall pay base rent of $36.50 per rentable square foot per year.",
    "4. Operating Costs. Tenant shall pay its proportionate share of Operating Costs. Operating Costs shall be capped at 8% annual increase.",
    "5. Free Rent. Tenant shall receive one (1) month of free base rent at the commencement of the term.",
    "6. Assignment. Tenant may not assign this Lease without Landlord's prior written consent, which may be withheld in Landlord's sole discretion.",
    "7. Renewal. Tenant shall have one (1) option to renew for an additional three (3) year term at then-prevailing market rent plus 5%.",
    "8. Indemnity. Tenant shall indemnify and hold harmless Landlord against any and all claims, including those arising from Landlord's negligence except gross negligence.",
]


def write_doc(path: str, paragraphs: list[str]) -> None:
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    doc.save(path)


write_doc(os.path.join(OUT_DIR, "base-lease.docx"), BASE_PARAGRAPHS)
write_doc(os.path.join(OUT_DIR, "redline-lease.docx"), REDLINE_PARAGRAPHS)
print("Wrote demo docs to", os.path.abspath(OUT_DIR))
