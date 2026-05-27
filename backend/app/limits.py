from __future__ import annotations

from pathlib import Path

SUPPORTED_EXTENSIONS = {".xlsx", ".docx", ".pdf"}
MAX_FILES_PER_PROJECT = 5
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024


def file_size(path: Path) -> int:
    return path.stat().st_size


def file_size_label(size: int = MAX_FILE_SIZE_BYTES) -> str:
    return f"{size // (1024 * 1024)}MB"
