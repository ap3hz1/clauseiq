from difflib import SequenceMatcher


def changes_from_sequences(base: list[str], redline: list[str]) -> list[dict[str, str]]:
    matcher = SequenceMatcher(None, base, redline)
    out: list[dict[str, str]] = []
    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op == "equal":
            continue
        out.append(
            {
                "change_type": op,
                "inserted_text": " ".join(redline[j1:j2]).strip(),
                "deleted_text": " ".join(base[i1:i2]).strip(),
                "before_text": base[i1 - 1] if i1 > 0 else "",
                "after_text": redline[j1] if j1 < len(redline) else "",
            }
        )
    return out
