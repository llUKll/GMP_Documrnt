# Regulatory Document Checklist

Use this checklist when generating or reviewing a current-version regulatory approval document from a prior approved document.

## Intake

- Prior approved/reference document is available or its absence is explicitly noted.
- Current product/app name, software version, build number, and release date are identified.
- Target hardware/device pairing is identified.
- Current screenshots or manual draft are available for user-facing flows.
- Test notes/results are available or marked as missing.
- Target output format is known: Markdown, DOCX, PDF-ready draft, table-only analysis, or section rewrite.

## Reference Document Extraction

- Preserve the original section order unless the user asks to reorganize.
- Capture repeated official phrasing and terms.
- Identify all tables and screenshots that must be replaced.
- Identify claims that require evidence: intended use, safety, performance, compatibility, limitations, tests.
- Identify prior-version details that must not leak into the new draft.

## Android Evidence

- Check app package, version name/code, permissions, activities, services, and hardware communication paths.
- Use visible labels from screenshots/manuals as primary screen/menu names.
- Use project resources/source to confirm features when screenshots/manuals are incomplete.
- Record file paths for important evidence.

## Draft Review

- Every changed feature has corresponding current evidence.
- Every new screenshot or described screen appears in current materials.
- Removed prior functionality is removed from claims and procedures.
- Test descriptions do not imply unavailable results.
- Safety, warning, and limitation text is preserved unless the user confirms a change.
- All uncertain statements use `[확인 필요: ...]`.
- A final "확인 필요 항목" list is included for reviewer action.

## Suggested Missing-Info Questions

Ask only the questions needed for the next draft iteration:

- 현재 프로그램명과 표시 버전은 무엇인가요?
- 기존 문서 대비 추가/삭제/변경된 기능은 무엇인가요?
- 인허가 문서에서 반드시 유지해야 하는 문구가 있나요?
- 현재 버전의 기능 테스트 결과표나 로그가 있나요?
- 문서 출력 형식은 DOCX 초안, Markdown 초안, 또는 기존 문서 변경안 중 무엇인가요?
