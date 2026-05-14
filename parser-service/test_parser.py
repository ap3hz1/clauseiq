import unittest
import xml.etree.ElementTree as ET

from parser_utils import changes_from_sequences, paired_tracked_changes_from_document_root


class ParserDiffTests(unittest.TestCase):
    def test_sequence_changes_detect_insert_and_delete(self):
        base = ["Rent is payable monthly.", "CAM is uncapped."]
        redline = ["Rent is payable monthly.", "CAM is capped at 3%."]
        changes = changes_from_sequences(base, redline)
        self.assertTrue(len(changes) >= 1)
        first = changes[0]
        self.assertIn("CAM", first["inserted_text"] + first["deleted_text"])


class PairedTrackedChangesTests(unittest.TestCase):
    def test_one_modification_per_paragraph_ins_and_del(self):
        xml = """<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:del><w:r><w:t>OldText</w:t></w:r></w:del>
      <w:ins><w:r><w:t>NewText</w:t></w:r></w:ins>
    </w:p>
  </w:body>
</w:document>"""
        root = ET.fromstring(xml)
        changes = paired_tracked_changes_from_document_root(root)
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["change_type"], "modification")
        self.assertIn("OldText", changes[0]["deleted_text"])
        self.assertIn("NewText", changes[0]["inserted_text"])

    def test_addition_only_paragraph(self):
        xml = """<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:ins><w:r><w:t>Added</w:t></w:r></w:ins>
    </w:p>
  </w:body>
</w:document>"""
        root = ET.fromstring(xml)
        changes = paired_tracked_changes_from_document_root(root)
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["change_type"], "addition")
        self.assertEqual(changes[0]["deleted_text"], "")


if __name__ == "__main__":
    unittest.main()
