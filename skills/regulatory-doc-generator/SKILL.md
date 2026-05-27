---
name: regulatory-doc-generator
description: Generate or revise regulatory approval document drafts from an existing approved/reference document plus current Android app materials. Use when the user mentions 인허가 문서, 허가 문서, 승인 문서, 의료기기/장비 소프트웨어 문서, 기존 문서 기반 새 버전 문서화, Android 프로젝트 파일, screenshots, manuals, feature tests, or asks to create a current-version regulatory document from prior-version documentation.
---

# Regulatory Doc Generator

Create a current-version regulatory approval document draft by using an existing approved/reference document as the structural and stylistic baseline, then reconciling it with current Android project evidence, screenshots, manuals, and test notes.

This skill does not invent regulatory facts. Preserve traceability, mark uncertainty, and ask for missing source material when a claim affects safety, intended use, performance, test evidence, or compliance wording.

## Workflow

### Step 1 · Intake

Collect the available artifacts and classify them:

- Reference regulatory document: prior approved `.docx`, `.hwp`, `.pdf`, `.md`, or text export.
- Current Android project: source tree, `AndroidManifest.xml`, Gradle files, resources, strings, screenshots, release notes, or APK metadata when available.
- Current manual draft: user manual, screen guide, feature description, test protocol, or test result notes.
- User constraints: target regulator/body, product name, software version, intended use, device/hardware pairing, required output format.

If the user has not provided files yet, ask for the reference document and the most current manual or screenshots first. Use the project files after the document skeleton and feature map are clear.

### Step 2 · Extract the Reference Model

Analyze the prior document before writing new text:

- Build a section outline with headings, numbering, tables, captions, appendices, and repeated phrases.
- Identify invariant wording that should likely be preserved: product purpose, safety cautions, definitions, regulatory claims, test method phrasing.
- Identify version-specific zones: screenshots, menu names, feature lists, operating procedure, environment, tests, revision history, software version, device compatibility.
- Create a traceability table: `section -> prior content purpose -> needed current evidence`.

When the reference document is binary (`.docx`, `.hwp`, `.pdf`), extract text and inspect pages visually when layout matters. If HWP cannot be parsed locally, ask the user for PDF/DOCX export.

### Step 3 · Inspect Current Android Evidence

Use current materials to produce a feature and screen map:

- Read `AndroidManifest.xml`, `build.gradle`/`build.gradle.kts`, `settings.gradle`, app module names, package name, version name/code, permissions, activities, services, receivers.
- Search resources for labels and visible text: `res/values/strings.xml`, layouts, menus, navigation graphs, Compose screens, drawable names.
- Search source for feature boundaries, hardware communication, protocol handling, Bluetooth/USB/serial/network usage, sensor/device commands, logging, validation, and safety checks.
- Compare screenshots/manual pages against resource strings and code names. Prefer user-facing labels from screenshots/manuals over internal class names.

Do not over-read the entire project when a targeted search is enough. Use `rg`/`rg --files` first and summarize evidence with file paths.

### Step 4 · Compare Old vs Current

Create a change map before drafting:

- Same: sections and statements that can carry over with version/name adjustments.
- Modified: behavior, screen, flow, wording, test evidence, environment, or limits that changed.
- New: features/screens/tests not present in the reference document.
- Removed: prior features/screens/claims no longer visible in current materials.
- Unknown: claims requiring user confirmation.

Flag contradictions directly. If screenshots/manuals disagree with project files, treat screenshots/manuals as the user-facing truth and note the code discrepancy.

### Step 5 · Draft the Document

Generate the new regulatory document in the requested format. If no format is specified, output Markdown first and offer DOCX conversion after review.

Drafting rules:

- Preserve the reference document's structure, heading style, terminology, and level of formality.
- Keep regulatory/safety claims conservative. Never upgrade a claim beyond provided evidence.
- Replace prior-version names, screenshots, version numbers, menu labels, and workflows with current-version evidence.
- Mark unverifiable content with `[확인 필요: ...]` instead of guessing.
- Include a source note or traceability table unless the user asks for a clean submission draft only.
- Separate "submission-ready text" from "review notes" so the user can remove notes cleanly.

### Step 6 · Review Checklist

Before final delivery, check:

- Product/app name and software version are consistent.
- Intended use and hardware pairing are unchanged or explicitly confirmed.
- Screens, menus, and procedures match current screenshots/manual.
- Test descriptions match actual available test notes.
- Removed features are not still claimed.
- New features have corresponding explanation and evidence.
- All `[확인 필요]` markers are gathered in one list.

Read `references/regulatory-doc-checklist.md` when doing a full document pass.

## Output Format

For analysis-only requests, return:

```markdown
## Reference Structure
...

## Current Evidence Map
...

## Change Map
| Area | Prior document | Current evidence | Action |
|---|---|---|---|

## Missing Information
- [확인 필요: ...]
```

For drafting requests, return:

```markdown
# <현재 프로그램명> 인허가 문서 초안

<!-- submission-ready draft -->

---

## 검토 메모
- 주요 변경점
- 확인 필요 항목
- 사용한 근거 파일
```

If the user provides a prior DOCX/PDF and asks for a finished file, create a new editable document, render/preview it when tooling is available, and report the output path plus remaining confirmation items.

## Good Triggers

- "기존 인허가 문서를 참고해서 현재 Android 프로그램용 문서를 만들어줘"
- "이전 허가 문서와 스크린샷을 바탕으로 새 버전 문서 초안을 써줘"
- "프로젝트 파일에서 메뉴/기능을 뽑아서 인허가 문서에 반영해줘"
- "현재 버전 매뉴얼 초안과 기존 문서를 비교해서 승인 문서를 갱신해줘"

## Guardrails

- Do not provide legal/regulatory advice as final authority. State that the draft needs domain/regulatory review.
- Do not fabricate test results, certifications, risk controls, intended use, compatibility, or performance claims.
- Do not silently translate or normalize technical terms that may be regulated terminology; preserve the user's terminology and note alternatives.
- Do not treat source code as sufficient evidence for user-facing behavior when screenshots/manuals disagree.
