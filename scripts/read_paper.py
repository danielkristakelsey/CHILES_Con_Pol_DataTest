from __future__ import annotations
from pathlib import Path
import json

from pypdf import PdfReader


def extract_pdf_summary(path: str | Path) -> dict:
    p = Path(path)
    reader = PdfReader(str(p))
    meta = reader.metadata or {}
    title = str(meta.get('/Title') or '').strip()
    author = str(meta.get('/Author') or '').strip()
    pages = len(reader.pages)
    # Extract text from first 2 pages for quick context
    text = ''
    for i in range(min(2, pages)):
        try:
            text += reader.pages[i].extract_text() or ''
            text += "\n\n"
        except Exception:
            break
    # Shorten text
    snippet = '\n'.join([line.strip() for line in text.splitlines() if line.strip()][:30])
    return {
        'path': str(p),
        'pages': pages,
        'title': title,
        'author': author,
        'snippet': snippet,
    }


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Summarize a PDF (title/author/snippet)")
    ap.add_argument("pdf_path", nargs="?", default="Luber_2025_AJ_170_59.pdf")
    ap.add_argument("--out", default="data/paper_summary.json")
    args = ap.parse_args()

    result = extract_pdf_summary(args.pdf_path)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))

