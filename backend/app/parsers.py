from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any


def parse_file(path: Path, filename: str) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".xlsx":
        return parse_xlsx(path)
    if suffix == ".docx":
        return parse_docx(path)
    if suffix == ".pdf":
        return parse_pdf(path)
    raise ValueError(f"지원하지 않는 파일 형식입니다: {suffix}")


def parse_xlsx(path: Path) -> dict[str, Any]:
    from openpyxl import load_workbook

    workbook = load_workbook(path, read_only=True, data_only=True)
    sheets: list[dict[str, Any]] = []
    for worksheet in workbook.worksheets:
        rows = [
            [cell for cell in row]
            for row in worksheet.iter_rows(values_only=True)
            if any(cell is not None and str(cell).strip() != "" for cell in row)
        ]
        if not rows:
            continue
        headers = [str(value).strip() if value is not None else f"컬럼 {idx + 1}" for idx, value in enumerate(rows[0])]
        data_rows = rows[1:51]
        columns = infer_columns(headers, data_rows)
        sheets.append(
            {
                "name": worksheet.title,
                "headers": headers,
                "rows": [[normalize_cell(value) for value in row] for row in data_rows],
                "row_count": max(0, len(rows) - 1),
                "columns": columns,
            }
        )
    return {"kind": "xlsx", "sheets": sheets}


def infer_columns(headers: list[str], rows: list[list[Any]]) -> list[dict[str, Any]]:
    columns: list[dict[str, Any]] = []
    for index, header in enumerate(headers):
        values = [row[index] for row in rows if index < len(row) and row[index] is not None]
        numeric_values = [float(value) for value in values if isinstance(value, (int, float))]
        date_like = sum(1 for value in values if hasattr(value, "isoformat"))
        categories = Counter(str(value) for value in values if not isinstance(value, (int, float)))
        if numeric_values:
            kind = "number"
        elif date_like:
            kind = "date"
        else:
            kind = "category"
        columns.append(
            {
                "name": header,
                "kind": kind,
                "non_empty": len(values),
                "sum": round(sum(numeric_values), 2) if numeric_values else None,
                "avg": round(sum(numeric_values) / len(numeric_values), 2) if numeric_values else None,
                "top_values": categories.most_common(5),
            }
        )
    return columns


def normalize_cell(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def parse_docx(path: Path) -> dict[str, Any]:
    from docx import Document

    document = Document(path)
    paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    tables = []
    for table in document.tables:
        rows = []
        for row in table.rows[:30]:
            rows.append([cell.text.strip() for cell in row.cells])
        if rows:
            tables.append(rows)
    return {
        "kind": "docx",
        "paragraphs": paragraphs[:80],
        "tables": tables[:10],
        "image_count": len(document.inline_shapes),
    }


def parse_pdf(path: Path) -> dict[str, Any]:
    from PyPDF2 import PdfReader

    reader = PdfReader(str(path))
    pages = []
    for page_index, page in enumerate(reader.pages[:20], start=1):
        text = page.extract_text() or ""
        pages.append({"page": page_index, "text": text[:4000]})
    return {"kind": "pdf", "pages": pages, "page_count": len(reader.pages)}
