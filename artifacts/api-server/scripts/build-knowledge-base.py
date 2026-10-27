#!/usr/bin/env python3
"""Build the bot's extractive, page-cited corpus from the supplied PDFs."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "knowledge" / "sources"
OUTPUT = ROOT / "src" / "knowledge" / "documents.json"
MAX_CHARS = 1150

DISPLAY_NAMES = {
    "GhostLeaks_Complete_Documentation": "GhostLeaks Complete Documentation",
    "GhostLeaks_Architecture": "GhostLeaks Architecture",
    "GhostLeaks_Documentation_v2": "GhostLeaks Documentation v2",
}


def display_name(filename: str) -> str:
    for prefix, title in DISPLAY_NAMES.items():
        if filename.startswith(prefix):
            return title
    return filename


def clean_paragraphs(page_text: str) -> list[str]:
    paragraphs: list[str] = []
    current: list[str] = []

    for line in page_text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        current.append(line)

    if current:
        paragraphs.append(" ".join(current))

    return [paragraph for paragraph in paragraphs if paragraph]


def split_long_paragraph(paragraph: str) -> list[str]:
    parts: list[str] = []
    remaining = paragraph.strip()

    while len(remaining) > MAX_CHARS:
        cut = remaining.rfind(". ", 0, MAX_CHARS)
        if cut < MAX_CHARS // 2:
            cut = remaining.rfind(" ", 0, MAX_CHARS)
        if cut <= 0:
            cut = MAX_CHARS
        else:
            cut += 1
        parts.append(remaining[:cut].strip())
        remaining = remaining[cut:].strip()

    if remaining:
        parts.append(remaining)
    return parts


def section_for_heading(paragraph: str, current_section: str) -> str | None:
    text = paragraph.strip()
    if len(text) > 130 or text.endswith((".", "?", "!", ";")):
        return None

    main_sections = [
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?(?:frequently asked questions|faq)$", "FAQ"),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?buyer guide$", "Buyer Guide"),
        (
            r"^(?:\d+(?:\.\d+)*\.?\s*)?(?:license summary|commercial license agreement)$",
            "License",
        ),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?feature guide$", "Features"),
        (
            r"^(?:\d+(?:\.\d+)*\.?\s*)?(?:system architecture|architecture overview)$",
            "Architecture",
        ),
        (
            r"^(?:\d+(?:\.\d+)*\.?\s*)?(?:rest api reference|api reference)$",
            "REST API",
        ),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?security policy$", "Security"),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?deployment guide$", "Deployment"),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?overview(?: \(readme\))?$", "Overview"),
    ]
    for pattern, section in main_sections:
        if re.fullmatch(pattern, text, flags=re.I):
            return section

    if current_section == "FAQ":
        return None

    subsection_sections = [
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?billing(?: \([^)]*\))?$", "Billing"),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?domain monitoring(?: workflow| — dns setup)?$", "Domain Monitoring"),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?webhooks?(?: \(outbound\))?$", "Webhooks"),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?rest api(?: \(x-api-key\))?$", "REST API"),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?security$", "Security"),
        (r"^(?:\d+(?:\.\d+)*\.?\s*)?deployment$", "Deployment"),
        (r"^payment architecture$", "Billing"),
        (r"^architecture overview$", "Architecture"),
    ]
    for pattern, section in subsection_sections:
        if re.fullmatch(pattern, text, flags=re.I):
            return section
    return None


def main() -> None:
    if not SOURCE_DIR.exists():
        raise SystemExit(f"Missing PDF source directory: {SOURCE_DIR}")

    records: list[dict[str, object]] = []
    pdfs = sorted(SOURCE_DIR.glob("*.pdf"))
    if not pdfs:
        raise SystemExit(f"No PDFs found in {SOURCE_DIR}")

    for pdf in pdfs:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf), "-"],
            check=True,
            capture_output=True,
            text=True,
        )
        pages = result.stdout.split("\f")
        current_section = "General"
        for page_number, page_text in enumerate(pages, start=1):
            for paragraph in clean_paragraphs(page_text):
                heading_section = section_for_heading(paragraph, current_section)
                if heading_section:
                    current_section = heading_section
                for passage in split_long_paragraph(paragraph):
                    records.append(
                        {
                            "source": display_name(pdf.name),
                            "sourceFile": pdf.name,
                            "section": current_section,
                            "page": page_number,
                            "text": passage,
                        }
                    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Built {len(records)} passages from {len(pdfs)} PDFs: {OUTPUT}")


if __name__ == "__main__":
    main()
