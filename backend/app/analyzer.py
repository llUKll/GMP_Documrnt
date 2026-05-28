from __future__ import annotations

from typing import Any

from .gemini import generate_gemini_blocks
from .models import Block, DraftDocument


def build_draft(
    project_id: str,
    title: str,
    extracted_files: list[dict[str, Any]],
    gemini_api_key: str = "",
    gemini_model: str = "gemini-2.5-pro",
) -> DraftDocument:
    context = normalize_context(extracted_files)
    blocks: list[Block] = []

    blocks.append(
        Block(
            type="heading",
            order=len(blocks),
            content={"level": 1, "text": f"{title} 분석 보고서 초안"},
        )
    )
    blocks.append(
        Block(
            type="paragraph",
            order=len(blocks),
            content={"text": make_summary(context)},
        )
    )

    metric_rows = make_metric_rows(context)
    if metric_rows:
        blocks.append(
            Block(
                type="table",
                order=len(blocks),
                content={
                    "caption": "핵심 수치 요약",
                    "headers": ["파일", "시트/출처", "항목", "값", "해석"],
                    "rows": metric_rows,
                },
            )
        )
        chart = make_chart(metric_rows)
        if chart:
            blocks.append(Block(type="chart", order=len(blocks), content=chart))

    diagram = make_diagram(context)
    blocks.append(Block(type="diagram", order=len(blocks), content=diagram))
    blocks.extend(make_report_sections(context, len(blocks)))
    if gemini_api_key:
        try:
            blocks = generate_gemini_blocks(gemini_api_key, gemini_model, title, context, blocks)
        except RuntimeError as exc:
            blocks.append(
                Block(
                    type="paragraph",
                    order=len(blocks),
                    content={"text": f"Gemini 분석을 시도했지만 실패하여 로컬 초안을 사용했습니다. ({exc})"},
                )
            )
    return DraftDocument(project_id=project_id, title=f"{title} 분석 보고서", blocks=blocks)


def normalize_context(files: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "files": files,
        "xlsx": [item for item in files if item.get("kind") == "xlsx"],
        "docx": [item for item in files if item.get("kind") == "docx"],
        "pdf": [item for item in files if item.get("kind") == "pdf"],
    }


def make_summary(context: dict[str, Any]) -> str:
    pieces = []
    if context["xlsx"]:
        sheet_count = sum(len(file.get("sheets", [])) for file in context["xlsx"])
        pieces.append(f"엑셀 데이터 {len(context['xlsx'])}개 파일, {sheet_count}개 시트를 분석했습니다.")
    if context["docx"]:
        paragraph_count = sum(len(file.get("paragraphs", [])) for file in context["docx"])
        pieces.append(f"DOCX 문서 {len(context['docx'])}개에서 {paragraph_count}개 문단을 추출했습니다.")
    if context["pdf"]:
        page_count = sum(file.get("page_count", 0) for file in context["pdf"])
        pieces.append(f"PDF {len(context['pdf'])}개에서 {page_count}개 페이지의 텍스트를 확인했습니다.")
    if not pieces:
        return "첨부파일에서 분석 가능한 내용을 찾지 못했습니다. 원본 파일을 확인하고 다시 업로드해 주세요."
    return " ".join(pieces) + " 아래 초안은 다운로드 전 편집기에서 직접 수정할 수 있습니다."


def make_metric_rows(context: dict[str, Any]) -> list[list[Any]]:
    rows: list[list[Any]] = []
    for file_index, file in enumerate(context["xlsx"], start=1):
        filename = file.get("filename", f"엑셀 {file_index}")
        for sheet in file.get("sheets", []):
            for column in sheet.get("columns", []):
                if column.get("kind") != "number":
                    continue
                label = column.get("name", "수치")
                value = column.get("sum")
                rows.append(
                    [
                        filename,
                        sheet.get("name", "-"),
                        f"{label} 합계",
                        value,
                        f"{label} 컬럼의 총합 기준으로 우선 확인할 지표입니다.",
                    ]
                )
    return rows[:12]


def make_chart(metric_rows: list[list[Any]]) -> dict[str, Any] | None:
    values = []
    for row in metric_rows[:8]:
        try:
            values.append({"label": row[2], "value": float(row[3])})
        except (TypeError, ValueError):
            continue
    if not values:
        return None
    return {
        "title": "핵심 수치 비교",
        "kind": "bar",
        "values": values,
        "note": "업로드한 엑셀의 숫자 컬럼 합계를 기준으로 자동 생성했습니다.",
    }


def make_diagram(context: dict[str, Any]) -> dict[str, Any]:
    source_count = len(context["files"])
    return {
        "title": "문서 생성 흐름",
        "syntax": "mermaid",
        "code": (
            "flowchart LR\n"
            f"  A[첨부파일 {source_count}개] --> B[파싱 및 정규화]\n"
            "  B --> C[수치·문단·표 분석]\n"
            "  C --> D[보고서 초안]\n"
            "  D --> E[워드형 편집]\n"
            "  E --> F[DOCX 다운로드]"
        ),
    }


def make_report_sections(context: dict[str, Any], start_order: int) -> list[Block]:
    doc_text = collect_reference_text(context)
    paragraphs = [
        "시사점: 수치 데이터와 기존 문서 내용을 함께 보면, 의사결정자는 먼저 규모가 큰 지표와 반복적으로 언급된 주제를 확인해야 합니다.",
        "권장 액션: 편집기에서 핵심 수치의 해석을 실제 업무 맥락에 맞게 보강하고, 필요한 경우 차트 제목과 문서 결론을 팀 용어로 다듬으세요.",
    ]
    if doc_text:
        paragraphs.insert(0, f"참고 문서 핵심 문장: {doc_text}")
    return [
        Block(type="heading", order=start_order, content={"level": 2, "text": "결론 및 다음 액션"}),
        *[
            Block(type="paragraph", order=start_order + index + 1, content={"text": text})
            for index, text in enumerate(paragraphs)
        ],
    ]


def collect_reference_text(context: dict[str, Any]) -> str:
    candidates: list[str] = []
    for file in context["docx"]:
        candidates.extend(file.get("paragraphs", [])[:3])
    for file in context["pdf"]:
        for page in file.get("pages", [])[:2]:
            text = " ".join(page.get("text", "").split())
            if text:
                candidates.append(text[:240])
    return " ".join(candidates)[:420]
