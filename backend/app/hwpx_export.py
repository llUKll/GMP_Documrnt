from __future__ import annotations

import html
import zipfile
from pathlib import Path

from .models import DraftDocument


def export_hwpx(draft: DraftDocument, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    section_xml = build_section_xml(draft)
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as package:
        package.writestr("mimetype", "application/hwp+zip")
        package.writestr("META-INF/container.xml", container_xml())
        package.writestr("Contents/content.hpf", content_hpf(draft.title))
        package.writestr("Contents/section0.xml", section_xml)
        package.writestr("version.xml", version_xml())
    return output_path


def build_section_xml(draft: DraftDocument) -> str:
    body = []
    body.append(paragraph(draft.title, "title"))
    for block in sorted(draft.blocks, key=lambda item: item.order):
        content = block.content
        if block.type == "heading":
            body.append(paragraph(content.get("text", ""), f"h{content.get('level', 2)}"))
        elif block.type == "paragraph":
            body.append(paragraph(content.get("text", ""), "p"))
        elif block.type == "table":
            body.append(paragraph(content.get("caption", "표"), "caption"))
            body.append(table_xml(content.get("headers", []), content.get("rows", [])))
        elif block.type == "chart":
            body.append(paragraph(content.get("title", "차트"), "caption"))
            values = content.get("values", [])
            body.append(table_xml(["항목", "값"], [[item.get("label"), item.get("value")] for item in values]))
        elif block.type == "diagram":
            body.append(paragraph(content.get("title", "다이어그램"), "caption"))
            body.append(paragraph(content.get("code", ""), "code"))
        elif block.type == "image":
            body.append(paragraph(content.get("alt", "이미지"), "caption"))
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<owpml xmlns="http://www.hancom.co.kr/hwpml/2011/section">\n'
        "  <section>\n"
        f"{''.join(body)}"
        "  </section>\n"
        "</owpml>\n"
    )


def paragraph(text: object, style: str) -> str:
    escaped = html.escape(str(text or ""))
    return f'    <p style="{style}"><run><t>{escaped}</t></run></p>\n'


def table_xml(headers: list[object], rows: list[list[object]]) -> str:
    lines = ['    <table>\n']
    if headers:
        lines.append("      <tr>" + "".join(cell(header) for header in headers) + "</tr>\n")
    for row in rows:
        lines.append("      <tr>" + "".join(cell(value) for value in row) + "</tr>\n")
    lines.append("    </table>\n")
    return "".join(lines)


def cell(value: object) -> str:
    return f"<tc>{html.escape(str(value or ''))}</tc>"


def container_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
        '  <rootfiles><rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></rootfiles>\n'
        "</container>\n"
    )


def content_hpf(title: str) -> str:
    escaped = html.escape(title)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<package xmlns="http://www.hancom.co.kr/hwpml/2011/package">\n'
        f"  <metadata><title>{escaped}</title></metadata>\n"
        '  <manifest><item href="Contents/section0.xml" media-type="application/xml"/></manifest>\n'
        "</package>\n"
    )


def version_xml() -> str:
    return '<?xml version="1.0" encoding="UTF-8"?><version app="Document Insight OS" version="1.0"/>'
