from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


BlockType = Literal["heading", "paragraph", "table", "chart", "diagram", "image"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid4().hex


class Block(BaseModel):
    id: str = Field(default_factory=new_id)
    type: BlockType
    content: dict[str, Any]
    source_refs: list[str] = Field(default_factory=list)
    order: int = 0


class DraftDocument(BaseModel):
    project_id: str
    title: str
    blocks: list[Block] = Field(default_factory=list)
    updated_at: str = Field(default_factory=now_iso)


class SourceFile(BaseModel):
    id: str = Field(default_factory=new_id)
    project_id: str
    filename: str
    mime_type: str
    stored_path: str
    parsed_status: Literal["pending", "parsed", "failed"] = "pending"
    parse_error: str | None = None
    extracted: dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=now_iso)


class Project(BaseModel):
    id: str = Field(default_factory=new_id)
    title: str
    share_token: str = Field(default_factory=new_id)
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    files: list[SourceFile] = Field(default_factory=list)
    draft: DraftDocument | None = None


class CreateProjectRequest(BaseModel):
    title: str = "새 문서 분석 프로젝트"


class UpdateDraftRequest(BaseModel):
    title: str
    blocks: list[Block]


class UploadPathRequest(BaseModel):
    path: str


class ProjectResponse(BaseModel):
    project: Project
    message: str | None = None
