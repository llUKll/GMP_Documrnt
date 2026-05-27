from __future__ import annotations

import json
from pathlib import Path

from .models import Project, now_iso


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PROJECT_DIR = DATA_DIR / "projects"
UPLOAD_DIR = DATA_DIR / "uploads"
EXPORT_DIR = DATA_DIR / "exports"


def ensure_dirs() -> None:
    for path in (PROJECT_DIR, UPLOAD_DIR, EXPORT_DIR):
        path.mkdir(parents=True, exist_ok=True)


def project_path(project_id: str) -> Path:
    return PROJECT_DIR / f"{project_id}.json"


def save_project(project: Project) -> Project:
    ensure_dirs()
    project.updated_at = now_iso()
    project_path(project.id).write_text(
        project.model_dump_json(indent=2),
        encoding="utf-8",
    )
    return project


def load_project(project_id: str) -> Project:
    path = project_path(project_id)
    if not path.exists():
        raise FileNotFoundError(project_id)
    return Project.model_validate(json.loads(path.read_text(encoding="utf-8")))


def find_project_by_share_token(token: str) -> Project:
    ensure_dirs()
    for path in PROJECT_DIR.glob("*.json"):
        project = Project.model_validate(json.loads(path.read_text(encoding="utf-8")))
        if project.share_token == token:
            return project
    raise FileNotFoundError(token)
