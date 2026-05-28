from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel

from .storage import DATA_DIR, ensure_dirs


SETTINGS_PATH = DATA_DIR / "settings.json"


class AppSettings(BaseModel):
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-pro"


class PublicSettings(BaseModel):
    has_gemini_api_key: bool
    gemini_model: str
    gemini_check_status: str = "not_checked"
    gemini_check_message: str = ""


class UpdateSettingsRequest(BaseModel):
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-pro"


def load_settings() -> AppSettings:
    ensure_dirs()
    if not SETTINGS_PATH.exists():
        return AppSettings()
    return AppSettings.model_validate(json.loads(SETTINGS_PATH.read_text(encoding="utf-8")))


def save_settings(payload: UpdateSettingsRequest) -> AppSettings:
    ensure_dirs()
    current = load_settings()
    if payload.gemini_api_key is not None:
        current.gemini_api_key = payload.gemini_api_key.strip()
    current.gemini_model = payload.gemini_model.strip() or "gemini-2.5-pro"
    SETTINGS_PATH.write_text(current.model_dump_json(indent=2), encoding="utf-8")
    return current


def public_settings(settings: AppSettings) -> PublicSettings:
    return PublicSettings(
        has_gemini_api_key=bool(settings.gemini_api_key),
        gemini_model=settings.gemini_model,
    )
