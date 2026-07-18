from pathlib import Path

path = Path("app/senkron-panel/page.js")
text = path.read_text(encoding="utf-8")

replacements = {
    "\u00c4\u00b1": "\u0131",
    "\u00c4\u00b0": "\u0130",
    "\u00c4\u0178": "\u011f",
    "\u00c4\u017e": "\u011e",
    "\u00c5\u0178": "\u015f",
    "\u00c5\u017e": "\u015e",
    "\u00c3\u00a7": "\u00e7",
    "\u00c3\u2021": "\u00c7",
    "\u00c3\u00b6": "\u00f6",
    "\u00c3\u2013": "\u00d6",
    "\u00c3\u00bc": "\u00fc",
    "\u00c3\u0153": "\u00dc",
    "\u00e2\u20ac\u00a6": "\u2026",
    "\u00e2\u20ac\u201c": "\u2013",
    "\u00e2\u20ac\u201d": "\u2014",
    "\u00e2\u20ac\u0153": "\u201c",
    "\u00e2\u20ac\u009d": "\u201d",
    "\u00e2\u20ac\u2122": "\u2019",
    "\u00c2\u00b7": "\u00b7",
    "\u00c2": "",
}

for wrong, correct in replacements.items():
    text = text.replace(wrong, correct)

path.write_text(text, encoding="utf-8")
print("DONE")
