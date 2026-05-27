from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

from .models import Block


GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def verify_gemini_connection(api_key: str, model: str) -> str:
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "다음 문장만 그대로 출력하세요: "
                            "Gemini 연결 확인 완료. 문서 초안 보완에 사용할 수 있습니다."
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 80,
        },
    }
    response_payload = call_gemini(api_key, model, payload, timeout=20)
    text = extract_text(response_payload).strip()
    if not text:
        raise RuntimeError("Gemini가 빈 응답을 반환했습니다.")
    if len(text) < 8:
        return "Gemini 연결 확인 완료. 문서 초안 보완에 사용할 수 있습니다."
    return text[:240]


def generate_gemini_blocks(
    api_key: str,
    model: str,
    project_title: str,
    context: dict[str, Any],
    fallback_blocks: list[Block],
) -> list[Block]:
    prompt = build_prompt(project_title, context, fallback_blocks)
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.35,
            "responseMimeType": "application/json",
        },
    }
    response_payload = call_gemini(api_key, model, payload, timeout=45)

    text = extract_text(response_payload)
    blocks_payload = parse_json_text(text)
    return normalize_blocks(blocks_payload)


def refine_gemini_blocks(
    api_key: str,
    model: str,
    draft_title: str,
    current_blocks: list[Block],
) -> list[Block]:
    compact_draft = {
        "title": draft_title,
        "blocks": [
            {
                "type": block.type,
                "content": block.content,
                "source_refs": block.source_refs,
                "order": block.order,
            }
            for block in current_blocks
        ],
    }
    prompt = (
        "너는 한국어 보고서 편집자다. 사용자가 브라우저 편집기에서 수정한 초안을 검토하고 보완하라.\n"
        "목표: 문장을 자연스럽게 다듬고, 결론/시사점이 약하면 보강하고, 표·차트·다이어그램 설명을 더 명확하게 만든다.\n"
        "중요 규칙:\n"
        "- 사용자가 만든 섹션 순서와 블록 유형은 가능한 유지한다.\n"
        "- 데이터 근거가 없는 새 수치나 사실을 invent하지 않는다.\n"
        "- 근거가 부족한 판단은 '확인 필요'라고 표시한다.\n"
        "- 표의 숫자와 행/열 의미는 함부로 바꾸지 않는다.\n"
        "- 반드시 JSON만 출력한다. 마크다운 코드펜스는 쓰지 않는다.\n"
        "스키마: {\"blocks\":[{\"type\":\"heading|paragraph|table|chart|diagram|image\","
        "\"content\":{},\"source_refs\":[]}]}\n"
        "heading content: {\"level\":1|2|3,\"text\":\"...\"}\n"
        "paragraph content: {\"text\":\"...\"}\n"
        "table content: {\"caption\":\"...\",\"headers\":[...],\"rows\":[[...]]}\n"
        "chart content: {\"title\":\"...\",\"kind\":\"bar\",\"values\":[{\"label\":\"...\",\"value\":123}],\"note\":\"...\"}\n"
        "diagram content: {\"title\":\"...\",\"syntax\":\"mermaid\",\"code\":\"flowchart LR...\"}\n\n"
        f"현재 초안 JSON:\n{json.dumps(compact_draft, ensure_ascii=False)[:24000]}"
    )
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.25,
            "responseMimeType": "application/json",
        },
    }
    response_payload = call_gemini(api_key, model, payload, timeout=45)
    text = extract_text(response_payload)
    try:
        blocks_payload = parse_json_text(text)
        return normalize_blocks(blocks_payload)
    except (json.JSONDecodeError, RuntimeError) as exc:
        raise RuntimeError(f"Gemini 초안 보완 응답을 해석하지 못했습니다: {exc}") from exc


def call_gemini(api_key: str, model: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        GEMINI_URL.format(model=model),
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini 호출 실패: HTTP {exc.code} {detail[:500]}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Gemini 호출 실패: {exc}") from exc


def build_prompt(project_title: str, context: dict[str, Any], fallback_blocks: list[Block]) -> str:
    compact_context = {
        "project_title": project_title,
        "files": context.get("files", []),
        "fallback_draft": [
            {"type": block.type, "content": block.content}
            for block in fallback_blocks
        ],
    }
    return (
        "너는 팀 내부용 분석 보고서 초안을 작성하는 한국어 문서 분석가다.\n"
        "첨부파일 파싱 결과와 기본 초안을 바탕으로 더 자연스러운 보고서 초안을 만들어라.\n"
        "반드시 JSON만 출력한다. 마크다운 코드펜스는 쓰지 않는다.\n"
        "스키마: {\"blocks\":[{\"type\":\"heading|paragraph|table|chart|diagram\","
        "\"content\":{},\"source_refs\":[]}]}\n"
        "heading content: {\"level\":1|2|3,\"text\":\"...\"}\n"
        "paragraph content: {\"text\":\"...\"}\n"
        "table content: {\"caption\":\"...\",\"headers\":[...],\"rows\":[[...]]}\n"
        "chart content: {\"title\":\"...\",\"kind\":\"bar\",\"values\":[{\"label\":\"...\",\"value\":123}],\"note\":\"...\"}\n"
        "diagram content: {\"title\":\"...\",\"syntax\":\"mermaid\",\"code\":\"flowchart LR...\"}\n"
        "한국어로 작성하고, 과장하지 말고, 데이터에 근거가 부족하면 '확인 필요'라고 표시해라.\n\n"
        f"입력 JSON:\n{json.dumps(compact_context, ensure_ascii=False)[:24000]}"
    )


def extract_text(payload: dict[str, Any]) -> str:
    parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return "\n".join(part.get("text", "") for part in parts if part.get("text"))


def parse_json_text(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    return json.loads(cleaned)


def normalize_blocks(payload: dict[str, Any]) -> list[Block]:
    blocks = []
    for order, item in enumerate(payload.get("blocks", [])):
        block_type = item.get("type")
        if block_type not in {"heading", "paragraph", "table", "chart", "diagram", "image"}:
            continue
        content = item.get("content") if isinstance(item.get("content"), dict) else {}
        blocks.append(
            Block(
                type=block_type,
                content=content,
                source_refs=item.get("source_refs") or [],
                order=order,
            )
        )
    if not blocks:
        raise RuntimeError("Gemini 응답에서 사용 가능한 블록을 찾지 못했습니다.")
    return blocks
