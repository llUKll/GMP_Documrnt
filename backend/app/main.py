from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .analyzer import build_draft
from .docx_export import export_docx
from .gemini import refine_gemini_blocks, verify_gemini_connection
from .hwpx_export import export_hwpx
from .limits import MAX_FILE_SIZE_BYTES, MAX_FILES_PER_PROJECT, SUPPORTED_EXTENSIONS, file_size, file_size_label
from .models import CreateProjectRequest, Project, ProjectResponse, SourceFile, UpdateDraftRequest, UploadPathRequest
from .parsers import parse_file
from .settings import PublicSettings, UpdateSettingsRequest, load_settings, public_settings, save_settings
from .storage import EXPORT_DIR, UPLOAD_DIR, ensure_dirs, find_project_by_share_token, load_project, save_project


app = FastAPI(title="Document Insight OS", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://llukll.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    ensure_dirs()


@app.post("/api/projects", response_model=ProjectResponse)
def create_project(payload: CreateProjectRequest) -> ProjectResponse:
    project = save_project(Project(title=payload.title))
    return ProjectResponse(project=project)


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str) -> ProjectResponse:
    return ProjectResponse(project=require_project(project_id))


@app.get("/api/share/{share_token}", response_model=ProjectResponse)
def get_shared_project(share_token: str) -> ProjectResponse:
    try:
        return ProjectResponse(project=find_project_by_share_token(share_token))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="공유 링크를 찾을 수 없습니다.") from exc


@app.get("/api/settings", response_model=PublicSettings)
def get_settings() -> PublicSettings:
    return public_settings(load_settings())


@app.patch("/api/settings", response_model=PublicSettings)
def update_settings(payload: UpdateSettingsRequest) -> PublicSettings:
    current = load_settings()
    next_key = payload.gemini_api_key.strip() if payload.gemini_api_key is not None else current.gemini_api_key
    next_model = payload.gemini_model.strip() or "gemini-2.5-pro"
    check_message = ""
    if next_key:
        try:
            check_message = verify_gemini_connection(next_key, next_model)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    settings = save_settings(payload)
    public = public_settings(settings)
    public.gemini_check_status = "verified" if next_key else "local_only"
    public.gemini_check_message = check_message or "Gemini API 키 없이 로컬 분석기로 동작합니다."
    return public


@app.get("/api/upload-limits")
def get_upload_limits() -> dict[str, object]:
    return {
        "supported_extensions": sorted(SUPPORTED_EXTENSIONS),
        "max_files_per_project": MAX_FILES_PER_PROJECT,
        "max_file_size_bytes": MAX_FILE_SIZE_BYTES,
        "max_file_size_label": file_size_label(),
    }


@app.post("/api/projects/{project_id}/files", response_model=ProjectResponse)
def upload_file(project_id: str, file: UploadFile = File(...)) -> ProjectResponse:
    project = require_project(project_id)
    suffix = Path(file.filename or "").suffix.lower()
    validate_upload_slot(project)
    validate_extension(suffix)

    project_upload_dir = UPLOAD_DIR / project_id
    project_upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = project_upload_dir / f"{len(project.files) + 1}_{Path(file.filename or 'upload').name}"
    with stored_path.open("wb") as target:
        shutil.copyfileobj(file.file, target)
    validate_size(stored_path)

    source = SourceFile(
        project_id=project.id,
        filename=file.filename or stored_path.name,
        mime_type=file.content_type or "application/octet-stream",
        stored_path=str(stored_path),
    )
    try:
        extracted = parse_file(stored_path, source.filename)
        extracted["filename"] = source.filename
        source.extracted = extracted
        source.parsed_status = "parsed"
    except Exception as exc:  # Keep the project usable even when one file fails.
        source.parsed_status = "failed"
        source.parse_error = str(exc)

    project.files.append(source)
    save_project(project)
    return ProjectResponse(project=project)


@app.post("/api/projects/{project_id}/files/path", response_model=ProjectResponse)
def upload_file_by_path(project_id: str, payload: UploadPathRequest) -> ProjectResponse:
    project = require_project(project_id)
    source_path = Path(payload.path).expanduser().resolve()
    if not source_path.exists() or not source_path.is_file():
        raise HTTPException(status_code=400, detail="파일 경로를 찾을 수 없습니다.")
    suffix = source_path.suffix.lower()
    validate_upload_slot(project)
    validate_extension(suffix)
    validate_size(source_path)

    project_upload_dir = UPLOAD_DIR / project_id
    project_upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = project_upload_dir / f"{len(project.files) + 1}_{source_path.name}"
    shutil.copyfile(source_path, stored_path)

    source = SourceFile(
        project_id=project.id,
        filename=source_path.name,
        mime_type="application/octet-stream",
        stored_path=str(stored_path),
    )
    try:
        extracted = parse_file(stored_path, source.filename)
        extracted["filename"] = source.filename
        source.extracted = extracted
        source.parsed_status = "parsed"
    except Exception as exc:
        source.parsed_status = "failed"
        source.parse_error = str(exc)

    project.files.append(source)
    save_project(project)
    return ProjectResponse(project=project)


@app.post("/api/projects/{project_id}/analyze", response_model=ProjectResponse)
def analyze_project(project_id: str) -> ProjectResponse:
    project = require_project(project_id)
    extracted = [source.extracted for source in project.files if source.parsed_status == "parsed"]
    settings = load_settings()
    project.draft = build_draft(
        project.id,
        project.title,
        extracted,
        gemini_api_key=settings.gemini_api_key,
        gemini_model=settings.gemini_model,
    )
    save_project(project)
    return ProjectResponse(project=project)


@app.patch("/api/projects/{project_id}/draft", response_model=ProjectResponse)
def update_draft(project_id: str, payload: UpdateDraftRequest) -> ProjectResponse:
    project = require_project(project_id)
    if project.draft is None:
        raise HTTPException(status_code=400, detail="아직 생성된 초안이 없습니다.")
    project.draft.title = payload.title
    project.draft.blocks = payload.blocks
    settings = load_settings()
    message = "초안이 저장되었습니다."
    if settings.gemini_api_key:
        try:
            project.draft.blocks = refine_gemini_blocks(
                settings.gemini_api_key,
                settings.gemini_model,
                project.draft.title,
                project.draft.blocks,
            )
            message = "Gemini가 초안을 검토하고 보완한 뒤 저장했습니다."
        except RuntimeError:
            message = "Gemini 보완에 실패해 사용자가 편집한 원본 초안을 저장했습니다."
    save_project(project)
    return ProjectResponse(project=project, message=message)


@app.post("/api/projects/{project_id}/export/hwpx")
def export_project_hwpx(project_id: str) -> FileResponse:
    project = require_project(project_id)
    if project.draft is None:
        raise HTTPException(status_code=400, detail="다운로드할 초안이 없습니다.")
    output_path = EXPORT_DIR / f"{project.id}.hwpx"
    export_hwpx(project.draft, output_path)
    return FileResponse(
        output_path,
        filename=f"{safe_filename(project.draft.title)}.hwpx",
        media_type="application/hwp+zip",
    )


@app.post("/api/projects/{project_id}/export/docx")
def export_project_docx(project_id: str) -> FileResponse:
    project = require_project(project_id)
    if project.draft is None:
        raise HTTPException(status_code=400, detail="다운로드할 초안이 없습니다.")
    output_path = EXPORT_DIR / f"{project.id}.docx"
    export_docx(project.draft, output_path)
    return FileResponse(
        output_path,
        filename=f"{safe_filename(project.draft.title)}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def require_project(project_id: str) -> Project:
    try:
        return load_project(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.") from exc


def safe_filename(value: str) -> str:
    return "".join(char for char in value if char.isalnum() or char in {" ", "_", "-"}).strip() or "document"


def validate_upload_slot(project: Project) -> None:
    if len(project.files) >= MAX_FILES_PER_PROJECT:
        raise HTTPException(status_code=400, detail=f"프로젝트당 첨부파일은 최대 {MAX_FILES_PER_PROJECT}개까지 분석할 수 있습니다.")


def validate_extension(suffix: str) -> None:
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="지원 형식은 XLSX, DOCX, PDF, TXT, MD, CSV, ZIP, HWPX, HWP, Android 소스/설정 파일입니다.")


def validate_size(path: Path) -> None:
    if file_size(path) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"파일당 최대 {file_size_label()}까지 업로드할 수 있습니다.")
