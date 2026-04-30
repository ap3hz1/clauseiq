import unittest
from parser_utils import changes_from_sequences


class ParserDiffTests(unittest.TestCase):
    def test_sequence_changes_detect_insert_and_delete(self):
        base = ["Rent is payable monthly.", "CAM is uncapped."]
        redline = ["Rent is payable monthly.", "CAM is capped at 3%."]
        changes = changes_from_sequences(base, redline)
        self.assertTrue(len(changes) >= 1)
        first = changes[0]
        self.assertIn("CAM", first["inserted_text"] + first["deleted_text"])


if __name__ == "__main__":
    unittest.main()
