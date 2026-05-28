const STORAGE_SETTINGS = "document-insight-settings-v2";
const STORAGE_LAST_PROJECT = "document-insight-last-project-v2";
const STORAGE_PROJECT_PREFIX = "document-insight-project-v2:";

const DEFAULT_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";
const MODEL_PRESETS = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
const MAX_FILES = 10;
const MAX_REFERENCE_FILES = 1;
const MAX_FILE_SIZE = 200 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = [".docx", ".pdf", ".xlsx", ".txt", ".md", ".csv", ".zip", ".hwpx", ".hwp", ".png", ".jpg", ".jpeg", ".webp", ".kt", ".java", ".xml", ".gradle", ".kts", ".json", ".yml", ".yaml"];
const MAX_EXTRACT_CHARS_PER_FILE = 45000;
const MAX_GEMINI_INPUT_CHARS = 180000;
const ZIP_MAX_LIST_ITEMS = 160;
const ZIP_MAX_TEXT_ENTRIES = 70;
const ZIP_MAX_DOCUMENT_ENTRIES = 10;
const ZIP_ENTRY_TEXT_LIMIT = 7000;
const ZIP_TOTAL_TEXT_LIMIT = 42000;
const ZIP_MAX_MEDIA_ASSETS = 18;
const IMAGE_EXPORT_MAX_WIDTH = 1200;
const IMAGE_EXPORT_MAX_HEIGHT = 900;
const IMAGE_EXPORT_QUALITY = 0.82;
const DEFAULT_DOCUMENT_MODE = "regulatory";
const REGULATORY_SKILL_VERSION = "regulatory-doc-generator-v1";
const SHARE_STATE_VERSION = 1;
const MAX_SHARE_URL_LENGTH = 180000;

let state = {
  project: null,
  settings: loadSettingsFromStorage(),
  limits: {
    supported_extensions: SUPPORTED_EXTENSIONS,
    max_files_per_project: MAX_FILES,
    max_reference_files_per_project: MAX_REFERENCE_FILES,
    max_file_size_bytes: MAX_FILE_SIZE,
    max_file_size_label: "200MB",
  },
  busy: false,
  busyMessage: "",
  status: "GitHub Pages 정적 모드입니다. 백엔드 없이 브라우저에서 파일을 읽고 Gemini API를 직접 호출합니다.",
  toasts: [],
  preview: null,
};

const root = document.getElementById("root");

boot();

function boot() {
  restoreProjectFromUrlOrStorage();
  render();
}

function restoreProjectFromUrlOrStorage() {
  const sharedPayload = readSharedPayloadFromUrl();
  if (sharedPayload) {
    try {
      importSharedPayload(sharedPayload);
      state.status = "팀 공유 링크에서 현재 진행 상태를 불러왔습니다. 첨부파일 원문은 공유 링크에서 제외되어 있습니다.";
      return;
    } catch (error) {
      console.warn("Shared payload restore failed", error);
      state.status = `공유 링크 복원 실패: ${error.message}`;
    }
  }

  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("project") || localStorage.getItem(STORAGE_LAST_PROJECT);
  if (!projectId) return;
  const saved = localStorage.getItem(`${STORAGE_PROJECT_PREFIX}${projectId}`);
  if (!saved) return;
  try {
    state.project = JSON.parse(saved);
  } catch (error) {
    console.warn("Project restore failed", error);
  }
}

function render() {
  root.innerHTML = `
    <main class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="mark">DI</span>
          <div>
            <h1>Document Insight OS</h1>
            <p>인허가 문서 · Android 근거 · Word 초안</p>
          </div>
        </div>

        <section class="panel">
          <label for="project-title" class="label">프로젝트 이름</label>
          <input id="project-title" value="${escapeAttr(state.project?.title || "인허가 문서 초안")}" />
          <button id="create-project" ${state.busy ? "disabled" : ""}>${state.project ? "새 프로젝트 만들기" : "프로젝트 만들기"}</button>
        </section>

        <section class="panel skill-panel">
          <span class="eyebrow">Regulatory Skill</span>
          <label for="doc-mode" class="label">문서 생성 모드</label>
          <select id="doc-mode">
            <option value="regulatory" ${state.settings.document_mode !== "report" ? "selected" : ""}>인허가 문서 초안</option>
            <option value="report" ${state.settings.document_mode === "report" ? "selected" : ""}>일반 보고서 초안</option>
          </select>
          <div class="form-grid-2">
            <label><span class="label">현재 프로그램명</span><input id="product-name" value="${escapeAttr(state.settings.product_name || "")}" placeholder="예: Document Insight OS" /></label>
            <label><span class="label">SW 버전/빌드</span><input id="software-version" value="${escapeAttr(state.settings.software_version || "")}" placeholder="예: v1.0.0 / build 1" /></label>
          </div>
          <label for="target-hardware" class="label">대상 장비/하드웨어 페어링</label>
          <input id="target-hardware" value="${escapeAttr(state.settings.target_hardware || "")}" placeholder="예: 의료기기 본체, Android 태블릿, BLE 장비" />
          <label for="target-regulator" class="label">대상 규제/기관</label>
          <input id="target-regulator" value="${escapeAttr(state.settings.target_regulator || "")}" placeholder="예: MFDS, 내부 인허가 검토" />
          <label for="intended-use" class="label">사용 목적 / Intended use</label>
          <textarea id="intended-use" class="compact-textarea" placeholder="기존 문서와 동일하면 '기존 문서 기준'처럼 입력하세요.">${escapeHtml(state.settings.intended_use || "")}</textarea>
          <small>첨부파일은 기존 허가 문서, 최신 매뉴얼/스크린샷, Android 프로젝트 ZIP, 테스트 노트를 함께 넣는 흐름으로 분석합니다.</small>
        </section>

        <section class="panel">
          <label for="gemini-key" class="label">Gemini API Key</label>
          <input id="gemini-key" type="password" placeholder="${state.settings.gemini_api_key ? "저장된 키 사용 중" : "AIza..."}" />
          <label for="gemini-model" class="label">Gemini 모델 선택</label>
          <select id="gemini-model">
            <option value="gemini-2.5-pro" ${(state.settings.gemini_model || DEFAULT_MODEL) === "gemini-2.5-pro" ? "selected" : ""}>gemini-2.5-pro · 상세설계/인허가 문서 권장</option>
            <option value="gemini-2.5-flash" ${(state.settings.gemini_model || DEFAULT_MODEL) === "gemini-2.5-flash" ? "selected" : ""}>gemini-2.5-flash · 속도/품질 균형</option>
            <option value="gemini-2.5-flash-lite" ${(state.settings.gemini_model || DEFAULT_MODEL) === "gemini-2.5-flash-lite" ? "selected" : ""}>gemini-2.5-flash-lite · 간단 요약/저비용</option>
          </select>
          <label for="pipeline-mode" class="label">생성 품질 모드</label>
          <select id="pipeline-mode">
            <option value="high_quality" ${(state.settings.pipeline_mode || "high_quality") === "high_quality" ? "selected" : ""}>고품질 2단계 분석 + 최종 검토</option>
            <option value="two_step" ${(state.settings.pipeline_mode || "high_quality") === "two_step" ? "selected" : ""}>2단계 분석</option>
            <option value="single_pass" ${(state.settings.pipeline_mode || "high_quality") === "single_pass" ? "selected" : ""}>단일 생성</option>
          </select>
          <button id="save-settings" type="button" ${state.busy ? "disabled" : ""}>Gemini 설정 저장</button>
          <small>${state.settings.gemini_api_key ? "상세설계 문서는 gemini-2.5-pro + 고품질 2단계 분석을 권장합니다. 키는 이 브라우저 localStorage에만 저장됩니다." : "키가 없으면 이미지 해석 없는 로컬 SDF 템플릿으로 초안을 생성합니다."}</small>
        </section>

        <section class="panel reference-panel">
          <label for="reference-files" class="label">참조파일</label>
          <p class="helper-text">결과물의 목차, 문체, 표 구성, 검토 메모 형식을 맞출 기준 문서입니다. ZIP도 첨부할 수 있으며, ZIP 내부의 HWP/HWPX/DOCX/PDF/TXT 문서를 참조 형식 후보로 읽습니다. 새 파일을 선택하면 기존 참조파일을 대체합니다.</p>
          <div class="limit-grid compact-limit-grid">
            <span>참조파일: ${state.project?.reference_files?.length || 0}/${state.limits.max_reference_files_per_project}개</span>
            <span>지원 형식: ${escapeHtml(state.limits.supported_extensions.join(", "))}</span>
            <span>파일당 용량: ${escapeHtml(state.limits.max_file_size_label)}</span>
          </div>
          <input id="reference-files" type="file" accept=".xlsx,.docx,.pdf,.txt,.md,.csv,.zip,.hwpx,.hwp,.png,.jpg,.jpeg,.webp,.kt,.java,.xml,.gradle,.kts,.json,.yml,.yaml" ${state.busy ? "disabled" : ""} />
          <small>예: 기존 인허가 문서 HWP/HWPX/DOCX/PDF 또는 해당 문서들을 묶은 ZIP. 참조파일의 사실관계는 그대로 복사하지 않고 형식 기준으로 사용합니다.</small>
        </section>

        <section class="panel">
          <label for="files" class="label">첨부파일</label>
          <p class="helper-text">GitHub Pages 정적 모드입니다. 파일은 서버로 업로드되지 않고 현재 브라우저에서만 읽습니다. 첨부파일은 최대 10개까지 분석하며 Android 프로젝트, 화면 캡처, 보고서, 로그 묶음은 ZIP으로 첨부할 수 있습니다.</p>
          <div class="limit-grid">
            <span>지원 형식: ${escapeHtml(state.limits.supported_extensions.join(", "))}</span>
            <span>최대 개수: ${state.project?.files?.length || 0}/${state.limits.max_files_per_project}개</span>
            <span>파일당 용량: ${escapeHtml(state.limits.max_file_size_label)}</span>
          </div>
          <input id="files" type="file" multiple accept=".xlsx,.docx,.pdf,.txt,.md,.csv,.zip,.hwpx,.hwp,.png,.jpg,.jpeg,.webp,.kt,.java,.xml,.gradle,.kts,.json,.yml,.yaml" ${state.busy ? "disabled" : ""} />
          <div id="drop-zone" class="drop-zone">파일을 여기에 드래그하거나 파일 선택을 누르세요.</div>

          <button id="analyze" ${state.project?.files?.length && !state.busy ? "" : "disabled"}>2단계 분석 및 상세설계 생성</button>
          <button id="download" ${state.project?.draft && !state.busy ? "" : "disabled"}>Word 다운로드</button>
        </section>

        ${state.project ? `
          <section class="panel meta">
            <span class="label">팀 공유 링크</span>
            <button id="copy-share" class="secondary" ${state.busy ? "disabled" : ""}>현재 상태 링크 복사</button>
            <button id="clear-files" class="danger" ${state.busy || !(state.project?.files?.length) ? "disabled" : ""}>첨부파일 제거</button>
            <small>현재 초안/편집 내용은 링크에 포함하고, 첨부파일 원문과 Gemini API Key는 제외합니다.</small>
            <small>첨부파일 제거를 누르면 이 브라우저 저장본에서도 파일 본문을 삭제하고, 파일명 메타데이터만 남깁니다.</small>
          </section>
        ` : ""}

        <p class="status">${escapeHtml(state.status)}</p>
      </aside>

      <section class="workspace">
        ${fileStripTemplate()}
        ${state.project?.draft ? editorTemplate(state.project.draft) : emptyTemplate()}
      </section>
      ${state.busy ? busyTemplate() : ""}
      ${previewModalTemplate()}
    </main>
  `;

  bindEvents();
}

function fileStripTemplate() {
  const files = state.project?.files || [];
  const references = state.project?.reference_files || [];
  const sourceMeta = !files.length ? (state.project?.source_file_meta || []) : [];
  const sourceReferenceMeta = !references.length ? (state.project?.source_reference_file_meta || []) : [];
  const fileDisplayItems = files.length ? files : sourceMeta;
  const referenceDisplayItems = references.length ? references : sourceReferenceMeta;
  const totalDisplayCount = fileDisplayItems.length + referenceDisplayItems.length;
  return `
    <section class="file-summary" aria-label="첨부파일 목록">
      <div class="section-heading">
        <div>
          <span class="eyebrow">자료 목록</span>
          <h2>참조파일과 분석 첨부파일</h2>
        </div>
        <span class="count-badge">${totalDisplayCount}개</span>
      </div>
      <p class="helper-text">참조파일은 결과물의 형식 기준으로, 첨부파일은 실제 분석 근거로 사용합니다. 각 파일 칩을 클릭하면 추출 텍스트와 메타데이터를 열어볼 수 있습니다.</p>
      ${analysisPipelineTemplate()}

      <div class="file-group">
        <div class="file-group-heading">
          <strong>참조파일</strong>
          <span>${referenceDisplayItems.length}/${state.limits.max_reference_files_per_project}개</span>
        </div>
        <div class="file-strip">
          ${referenceDisplayItems.map((file, index) => fileChipTemplate(file, index, {
            actual: Boolean(references.length),
            kind: references.length ? "reference" : "reference-meta",
            label: "REF",
          })).join("") || `<span class="muted">참조파일이 없습니다. 기존 양식/문서와 동일한 형식이 필요하면 왼쪽에서 참조파일을 첨부하세요.</span>`}
        </div>
      </div>

      <div class="file-group">
        <div class="file-group-heading">
          <strong>첨부파일</strong>
          <span>${fileDisplayItems.length}/${state.limits.max_files_per_project}개</span>
        </div>
        <div class="file-strip">
          ${fileDisplayItems.map((file, index) => fileChipTemplate(file, index, {
            actual: Boolean(files.length),
            kind: files.length ? "file" : "meta",
            label: file.extension || "file",
          })).join("") || `<span class="muted">아직 첨부파일이 없습니다. 왼쪽에서 파일을 선택하거나 드래그하세요.</span>`}
        </div>
      </div>
    </section>
  `;
}

function fileChipTemplate(file, index, options = {}) {
  const actual = Boolean(options.actual);
  const kind = options.kind || "file";
  const label = options.label || file.extension || "file";
  const openAttr = kind === "reference"
    ? `data-open-reference-index="${index}"`
    : kind === "reference-meta"
      ? `data-open-reference-meta-index="${index}"`
      : kind === "meta"
        ? `data-open-meta-index="${index}"`
        : `data-open-file-index="${index}"`;
  const removeAttr = kind === "reference"
    ? `data-remove-reference-index="${index}"`
    : kind === "reference-meta"
      ? `data-remove-reference-meta-index="${index}"`
      : kind === "meta"
        ? `data-remove-meta-index="${index}"`
        : `data-remove-file-index="${index}"`;
  const status = actual ? (file.parsed_status || "parsed") : "excluded";
  const statusClass = actual ? (file.parsed_status === "parsed" ? "ok" : "fail") : "muted";
  return `
    <div class="file-chip file-chip-clickable" ${openAttr} role="button" tabindex="0" title="${escapeAttr(file.filename)} 열어보기">
      <span class="file-label">${escapeHtml(label)}</span>
      <strong title="${escapeAttr(file.filename)}">${escapeHtml(file.filename)}</strong>
      <span class="${statusClass}">${escapeHtml(status)}</span>
      <button
        type="button"
        class="file-remove-btn"
        title="이 파일 제거"
        aria-label="${escapeAttr(file.filename)} 제거"
        ${removeAttr}
        ${state.busy ? "disabled" : ""}
      >×</button>
    </div>
  `;
}

function previewModalTemplate() {
  const preview = state.preview;
  if (!preview) return "";
  const file = resolvePreviewFile(preview);
  if (!file) return "";
  const text = String(file.text || "").trim();
  const summary = file.summary || file.error || "요약 정보가 없습니다.";
  const roleLabel = preview.kind === "reference" || preview.kind === "reference-meta" ? "참조파일" : "첨부파일";
  return `
    <div id="file-preview-backdrop" class="file-preview-backdrop" role="dialog" aria-modal="true" aria-label="파일 열어보기">
      <div class="file-preview-card">
        <header class="file-preview-header">
          <div>
            <span class="eyebrow">${escapeHtml(roleLabel)} 열어보기</span>
            <h2>${escapeHtml(file.filename || "파일")}</h2>
          </div>
          <button id="file-preview-close" type="button" class="preview-close" aria-label="미리보기 닫기">×</button>
        </header>
        <div class="preview-meta-grid">
          <span><strong>형식</strong>${escapeHtml(file.extension || extensionOf(file.filename || "") || "-")}</span>
          <span><strong>크기</strong>${escapeHtml(formatBytes(Number(file.size || 0)))}</span>
          <span><strong>상태</strong>${escapeHtml(file.parsed_status || "metadata only")}</span>
        </div>
        <section class="preview-section">
          <h3>요약</h3>
          <p>${escapeHtml(summary)}</p>
        </section>
        ${Array.isArray(file.media_assets) && file.media_assets.length ? `
          <section class="preview-section">
            <h3>추출 이미지</h3>
            <div class="preview-image-grid">
              ${file.media_assets.slice(0, 12).map(asset => `<figure><img src="${escapeAttr(asset.dataUrl || "")}" alt="${escapeAttr(asset.alt || asset.name || "이미지")}"/><figcaption>${escapeHtml(asset.caption || asset.name || "이미지")}</figcaption></figure>`).join("")}
            </div>
          </section>
        ` : ""}
        <section class="preview-section">
          <h3>추출 텍스트</h3>
          <pre>${escapeHtml(text ? text.slice(0, 25000) : "공유 링크로 불러온 파일 정보이거나 첨부파일 원문을 제거한 상태라 원문 텍스트가 없습니다. 다시 첨부하면 추출 텍스트를 확인할 수 있습니다.")}</pre>
        </section>
      </div>
    </div>
  `;
}

function resolvePreviewFile(preview) {
  if (!state.project || !preview) return null;
  const index = Number(preview.index);
  if (!Number.isInteger(index) || index < 0) return null;
  if (preview.kind === "reference") return (state.project.reference_files || [])[index] || null;
  if (preview.kind === "reference-meta") return (state.project.source_reference_file_meta || [])[index] || null;
  if (preview.kind === "meta") return (state.project.source_file_meta || [])[index] || null;
  return (state.project.files || [])[index] || null;
}

function busyTemplate() {
  return `
    <div class="busy-overlay">
      <div class="busy-card">
        <span class="spinner"></span>
        <strong>처리 중</strong>
        <p>${escapeHtml(state.busyMessage || state.status)}</p>
      </div>
    </div>
  `;
}

function emptyTemplate() {
  return `
    <div class="empty-state">
      <h2>자료를 첨부하면 인허가 초안 편집기가 열립니다.</h2>
      <p>기존 문서, Android 프로젝트 ZIP, 매뉴얼/시험 노트를 비교해 검토용 초안을 생성합니다.</p>
    </div>
  `;
}

function editorTemplate(draft) {
  return `
    <article class="editor">
      <header class="editor-toolbar">
        <div class="title-field">
          <label for="draft-title">파일명</label>
          <input id="draft-title" class="doc-title" value="${escapeAttr(draft.title)}" />
          <p class="helper-text">다운로드될 Word 문서의 파일명과 첫 제목으로 사용됩니다.</p>
        </div>
        <button id="save-draft" class="save-button" ${state.busy ? "disabled" : ""}>검토 및 저장</button>
      </header>
      <div class="paper">
        ${[...draft.blocks].sort((a, b) => a.order - b.order).map(blockTemplate).join("")}
      </div>
    </article>
  `;
}

function blockTemplate(block) {
  const content = block.content || {};
  return `
    <section class="block" data-block-id="${escapeAttr(block.id)}">
      <div class="block-actions">
        <span>${escapeHtml(block.type)}</span>
        <button data-action="up">↑</button>
        <button data-action="down">↓</button>
        <button data-action="delete">×</button>
      </div>
      ${blockBody(block, content)}
    </section>
  `;
}

function blockBody(block, content) {
  if (block.type === "heading") {
    return `<input class="heading h${Number(content.level || 2)}" data-field="text" value="${escapeAttr(content.text || "")}" />`;
  }
  if (block.type === "paragraph") {
    return `<textarea class="paragraph" data-field="text">${escapeHtml(content.text || "")}</textarea>`;
  }
  if (block.type === "table") {
    const headers = Array.isArray(content.headers) ? content.headers : [];
    const rows = Array.isArray(content.rows) ? content.rows : [];
    return `
      <input class="caption" data-field="caption" value="${escapeAttr(content.caption || "")}" />
      <div class="table-wrap">
        <table>
          <thead><tr>${headers.map((header, index) => `<th><input data-header="${index}" value="${escapeAttr(header)}" /></th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map((row, rowIndex) => `
              <tr>${row.map((cell, cellIndex) => `<td><input data-row="${rowIndex}" data-cell="${cellIndex}" value="${escapeAttr(cell ?? "")}" /></td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
  if (block.type === "chart") {
    const values = Array.isArray(content.values) ? content.values : [];
    const max = Math.max(...values.map(item => Number(item.value) || 0), 1);
    return `
      <input class="caption" data-field="title" value="${escapeAttr(content.title || "")}" />
      <div class="bars">
        ${values.map(item => `
          <div class="bar-row">
            <span>${escapeHtml(item.label)}</span>
            <div><i style="width:${Math.max(4, ((Number(item.value) || 0) / max) * 100)}%"></i></div>
            <strong>${escapeHtml(item.value)}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }
  if (block.type === "diagram") {
    return `
      <input class="caption" data-field="title" value="${escapeAttr(content.title || "")}" />
      <textarea class="code" data-field="code">${escapeHtml(content.code || "")}</textarea>
    `;
  }
  if (block.type === "image") {
    return `
      <input class="caption" data-field="caption" value="${escapeAttr(content.caption || content.alt || "")}" />
      <figure class="evidence-image-block">
        ${content.dataUrl ? `<img src="${escapeAttr(content.dataUrl)}" alt="${escapeAttr(content.alt || content.caption || "증거 이미지")}" />` : `<div class="image-placeholder">이미지 데이터 없음</div>`}
        <figcaption>${escapeHtml(content.source || content.filename || "첨부 이미지")}</figcaption>
      </figure>
      <input class="caption subtle" data-field="alt" value="${escapeAttr(content.alt || "")}" placeholder="대체 텍스트 / 검토 메모" />
    `;
  }
  return `<input data-field="alt" value="${escapeAttr(content.alt || "")}" />`;
}


function analysisPipelineTemplate() {
  const bundle = state.project?.analysis_bundle;
  if (!state.project) return "";
  const modeLabel = {
    high_quality: "고품질 2단계 분석 + 최종 검토",
    two_step: "2단계 분석",
    single_pass: "단일 생성",
  }[state.settings.pipeline_mode || "high_quality"] || "고품질 2단계 분석";
  const imageCount = bundle?.screen_map?.length || collectEvidenceImages(state.project.files || []).length || 0;
  const quality = bundle?.quality_score ? `${bundle.quality_score}/100` : "생성 전";
  const steps = [
    ["1", "첨부자료 인벤토리", bundle?.inventory?.length ? `${bundle.inventory.length}개 분류 완료` : "대기"],
    ["2", "화면/이미지 기능 매핑", bundle?.screen_map?.length ? `${bundle.screen_map.length}개 화면 매핑` : `${imageCount}개 이미지 후보`],
    ["3", "SDD/SDS 상세설계 생성", state.project?.draft ? "초안 생성됨" : "대기"],
    ["4", "품질 점검/보정", quality],
  ];
  return `
    <div class="analysis-pipeline-card">
      <div class="analysis-pipeline-head">
        <strong>상세설계 생성 파이프라인</strong>
        <span>${escapeHtml(modeLabel)}</span>
      </div>
      <div class="pipeline-steps">
        ${steps.map(([no, label, status]) => `
          <div class="pipeline-step">
            <b>${escapeHtml(no)}</b>
            <span>${escapeHtml(label)}</span>
            <small>${escapeHtml(status)}</small>
          </div>
        `).join("")}
      </div>
      ${bundle?.screen_map?.length ? `<p class="helper-text">대표 화면 분류: ${escapeHtml(bundle.screen_map.slice(0, 6).map(item => item.screen || item.category || item.filename).join(" · "))}</p>` : ""}
    </div>
  `;
}

function bindEvents() {
  document.getElementById("create-project")?.addEventListener("click", createProject);
  document.getElementById("save-settings")?.addEventListener("click", saveSettings);
  ["doc-mode", "gemini-model", "pipeline-mode", "product-name", "software-version", "target-hardware", "target-regulator", "intended-use"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", saveSettings);
  });
  document.getElementById("reference-files")?.addEventListener("change", uploadReferenceFiles);
  document.getElementById("files")?.addEventListener("change", uploadFiles);
  const dropZone = document.getElementById("drop-zone");
  dropZone?.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
  dropZone?.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
    uploadFileList(Array.from(event.dataTransfer.files || []));
  });
  document.getElementById("analyze")?.addEventListener("click", analyzeProject);
  document.getElementById("download")?.addEventListener("click", downloadDocx);
  document.getElementById("save-draft")?.addEventListener("click", saveDraft);
  document.getElementById("copy-share")?.addEventListener("click", copyTeamShareLink);
  document.getElementById("clear-files")?.addEventListener("click", clearProjectAttachments);

  document.querySelectorAll("[data-remove-file-index]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      removeProjectFileAt(Number(button.dataset.removeFileIndex));
    });
  });

  document.querySelectorAll("[data-remove-meta-index]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      removeSourceFileMetaAt(Number(button.dataset.removeMetaIndex));
    });
  });

  document.querySelectorAll("[data-remove-reference-index]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      removeReferenceFileAt(Number(button.dataset.removeReferenceIndex));
    });
  });

  document.querySelectorAll("[data-remove-reference-meta-index]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      removeSourceReferenceFileMetaAt(Number(button.dataset.removeReferenceMetaIndex));
    });
  });

  bindFileOpenEvents();
  document.getElementById("file-preview-close")?.addEventListener("click", closeFilePreview);
  document.getElementById("file-preview-backdrop")?.addEventListener("click", event => {
    if (event.target?.id === "file-preview-backdrop") closeFilePreview();
  });

  document.querySelectorAll(".block").forEach(element => {
    element.addEventListener("input", event => updateBlockFromInput(element.dataset.blockId, event.target));
    element.addEventListener("click", event => {
      const action = event.target.dataset.action;
      if (!action) return;
      if (action === "delete") deleteBlock(element.dataset.blockId);
      if (action === "up") moveBlock(element.dataset.blockId, -1);
      if (action === "down") moveBlock(element.dataset.blockId, 1);
    });
  });
}

function bindFileOpenEvents() {
  const bindings = [
    ["[data-open-file-index]", "file", "openFileIndex"],
    ["[data-open-reference-index]", "reference", "openReferenceIndex"],
    ["[data-open-meta-index]", "meta", "openMetaIndex"],
    ["[data-open-reference-meta-index]", "reference-meta", "openReferenceMetaIndex"],
  ];
  for (const [selector, kind, dataKey] of bindings) {
    document.querySelectorAll(selector).forEach(element => {
      const activate = event => {
        if (event.target?.closest?.("button")) return;
        event.preventDefault();
        openFilePreview(kind, Number(element.dataset[dataKey]));
      };
      element.addEventListener("click", activate);
      element.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") activate(event);
      });
    });
  }
}

function openFilePreview(kind, index) {
  state.preview = { kind, index };
  render();
}

function closeFilePreview() {
  state.preview = null;
  render();
}


async function copyTeamShareLink() {
  if (!state.project) return;
  captureCurrentEditableState();
  persistProject(false);
  const url = createTeamShareUrl();
  if (url.length > MAX_SHARE_URL_LENGTH) {
    pushToast("error", "공유 링크가 너무 깁니다", "첨부파일은 제외했지만 초안 본문이 길어 URL 길이 제한에 걸릴 수 있습니다. 문단을 줄이거나 Word 파일로 공유하세요.");
    return;
  }
  await navigator.clipboard.writeText(url);
  pushToast("success", "복사 완료", "팀원이 열 수 있는 현재 상태 공유 링크를 복사했습니다. 첨부파일 원문과 Gemini API Key는 포함되지 않습니다.");
}

function clearProjectAttachments() {
  if (!state.project) return;
  const files = state.project.files || [];
  if (!files.length) {
    pushToast("info", "첨부파일 없음", "제거할 첨부파일이 없습니다.");
    return;
  }
  state.project.source_file_meta = mergeSourceFileMeta(state.project.source_file_meta, files.map(toFileMeta));
  state.project.files = [];
  state.project.updated_at = new Date().toISOString();
  persistProject();
  state.status = "첨부파일 원문을 현재 브라우저 저장본에서 제거했습니다. 초안과 파일명 메타데이터는 유지됩니다.";
  pushToast("success", "첨부파일 제거 완료", state.status);
  render();
}

function removeProjectFileAt(index) {
  if (!state.project) return;
  const files = state.project.files || [];
  if (!Number.isInteger(index) || index < 0 || index >= files.length) {
    pushToast("error", "파일 제거 실패", "제거할 첨부파일을 찾을 수 없습니다.");
    return;
  }
  const [removed] = files.splice(index, 1);
  state.project.files = files;
  state.project.source_file_meta = (state.project.source_file_meta || []).filter(meta => !isSameFileMeta(meta, removed));
  state.project.updated_at = new Date().toISOString();
  persistProject();
  state.status = `${removed.filename} 파일을 첨부 목록에서 제거했습니다.`;
  pushToast("success", "첨부파일 제거", state.status);
  render();
}

function removeReferenceFileAt(index) {
  if (!state.project) return;
  const files = state.project.reference_files || [];
  if (!Number.isInteger(index) || index < 0 || index >= files.length) {
    pushToast("error", "참조파일 제거 실패", "제거할 참조파일을 찾을 수 없습니다.");
    return;
  }
  const [removed] = files.splice(index, 1);
  state.project.reference_files = files;
  state.project.source_reference_file_meta = mergeSourceFileMeta(state.project.source_reference_file_meta, [toFileMeta(removed)]);
  state.project.updated_at = new Date().toISOString();
  persistProject();
  state.status = `${removed.filename} 참조파일을 목록에서 제거했습니다.`;
  pushToast("success", "참조파일 제거", state.status);
  render();
}

function removeSourceReferenceFileMetaAt(index) {
  if (!state.project) return;
  const metaList = state.project.source_reference_file_meta || [];
  if (!Number.isInteger(index) || index < 0 || index >= metaList.length) {
    pushToast("error", "참조파일 정보 제거 실패", "제거할 참조파일 정보를 찾을 수 없습니다.");
    return;
  }
  const [removed] = metaList.splice(index, 1);
  state.project.source_reference_file_meta = metaList;
  state.project.updated_at = new Date().toISOString();
  persistProject();
  state.status = `${removed.filename} 참조파일 정보를 목록에서 제거했습니다.`;
  pushToast("success", "참조파일 정보 제거", state.status);
  render();
}

function removeSourceFileMetaAt(index) {
  if (!state.project) return;
  const metaList = state.project.source_file_meta || [];
  if (!Number.isInteger(index) || index < 0 || index >= metaList.length) {
    pushToast("error", "파일 정보 제거 실패", "제거할 파일 정보를 찾을 수 없습니다.");
    return;
  }
  const [removed] = metaList.splice(index, 1);
  state.project.source_file_meta = metaList;
  state.project.updated_at = new Date().toISOString();
  persistProject();
  state.status = `${removed.filename} 파일 정보를 목록에서 제거했습니다.`;
  pushToast("success", "파일 정보 제거", state.status);
  render();
}

function isSameFileMeta(meta, file) {
  return String(meta?.filename || "") === String(file?.filename || "")
    && Number(meta?.size || 0) === Number(file?.size || 0)
    && String(meta?.extension || "") === String(file?.extension || "");
}

function captureCurrentEditableState() {
  if (!state.project) return;
  const projectTitle = document.getElementById("project-title")?.value?.trim();
  if (projectTitle) state.project.title = projectTitle;
  const draftTitle = document.getElementById("draft-title")?.value?.trim();
  if (draftTitle && state.project.draft) state.project.draft.title = draftTitle;
  state.project.document_profile = currentDocumentProfile();
  state.project.updated_at = new Date().toISOString();
}

function createTeamShareUrl() {
  const payload = createSharePayload();
  const encoded = encodeBase64UrlUnicode(JSON.stringify(payload));
  return `${window.location.origin}${window.location.pathname}#state=${encoded}`;
}

function createSharePayload() {
  if (!state.project) throw new Error("공유할 프로젝트가 없습니다.");
  const sourceMeta = mergeSourceFileMeta(state.project.source_file_meta, (state.project.files || []).map(toFileMeta));
  const sourceReferenceMeta = mergeSourceFileMeta(state.project.source_reference_file_meta, (state.project.reference_files || []).map(toFileMeta));
  return {
    v: SHARE_STATE_VERSION,
    app: "Document Insight OS",
    exported_at: new Date().toISOString(),
    settings: publicSettingsSnapshot(),
    project: {
      id: state.project.id,
      title: state.project.title || "인허가 문서 초안",
      share_token: state.project.share_token || makeId("share"),
      document_profile: state.project.document_profile || currentDocumentProfile(),
      files: [],
      reference_files: [],
      source_file_meta: sourceMeta,
      source_reference_file_meta: sourceReferenceMeta,
      draft: state.project.draft ? normalizeDraft(state.project.draft, state.project.title || "인허가 문서 초안") : null,
      created_at: state.project.created_at || new Date().toISOString(),
      updated_at: state.project.updated_at || new Date().toISOString(),
      imported_from_share: false,
    },
  };
}

function publicSettingsSnapshot() {
  return {
    gemini_model: state.settings.gemini_model || DEFAULT_MODEL,
    document_mode: state.settings.document_mode || DEFAULT_DOCUMENT_MODE,
    product_name: state.settings.product_name || "",
    software_version: state.settings.software_version || "",
    target_hardware: state.settings.target_hardware || "",
    target_regulator: state.settings.target_regulator || "",
    intended_use: state.settings.intended_use || "",
  };
}

function readSharedPayloadFromUrl() {
  const hash = window.location.hash || "";
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const encoded = hashParams.get("state") || new URLSearchParams(window.location.search).get("state");
  if (!encoded) return null;
  return JSON.parse(decodeBase64UrlUnicode(encoded));
}

function importSharedPayload(payload) {
  if (!payload || Number(payload.v) !== SHARE_STATE_VERSION || !payload.project) {
    throw new Error("지원하지 않는 공유 링크 형식입니다.");
  }
  const previousApiKey = state.settings.gemini_api_key || "";
  state.settings = {
    ...state.settings,
    ...publicSettingsFromPayload(payload.settings || {}),
    gemini_api_key: previousApiKey,
  };
  saveSettingsToStorage(state.settings);

  const importedProject = payload.project;
  const id = makeId("project");
  state.project = {
    id,
    title: importedProject.title || "공유받은 인허가 문서 초안",
    share_token: makeId("share"),
    document_profile: importedProject.document_profile || publicSettingsSnapshot(),
    files: [],
    reference_files: [],
    source_file_meta: Array.isArray(importedProject.source_file_meta) ? importedProject.source_file_meta.map(toSafeFileMeta) : [],
    source_reference_file_meta: Array.isArray(importedProject.source_reference_file_meta) ? importedProject.source_reference_file_meta.map(toSafeFileMeta) : [],
    draft: importedProject.draft ? normalizeDraft(importedProject.draft, importedProject.title || "공유받은 문서") : null,
    created_at: importedProject.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    imported_from_share: true,
    imported_at: new Date().toISOString(),
  };
  persistProject(false);
  window.history.replaceState({}, "", `?project=${encodeURIComponent(id)}`);
}

function publicSettingsFromPayload(settings) {
  return {
    gemini_model: settings.gemini_model || DEFAULT_MODEL,
    document_mode: settings.document_mode || DEFAULT_DOCUMENT_MODE,
    pipeline_mode: settings.pipeline_mode || "high_quality",
    product_name: settings.product_name || "",
    software_version: settings.software_version || "",
    target_hardware: settings.target_hardware || "",
    target_regulator: settings.target_regulator || "",
    intended_use: settings.intended_use || "",
  };
}

function toFileMeta(file) {
  return toSafeFileMeta({
    filename: file.filename,
    extension: file.extension,
    size: file.size,
    parsed_status: file.parsed_status,
    summary: file.summary,
    error: file.error,
  });
}

function toSafeFileMeta(file) {
  return {
    filename: String(file?.filename || "첨부파일").slice(0, 240),
    extension: String(file?.extension || extensionOf(file?.filename || "")).slice(0, 16),
    size: Number(file?.size || 0),
    parsed_status: String(file?.parsed_status || "excluded"),
    summary: String(file?.summary || "").slice(0, 500),
    error: String(file?.error || "").slice(0, 500),
  };
}

function mergeSourceFileMeta(existing = [], next = []) {
  const map = new Map();
  for (const item of [...(existing || []), ...(next || [])]) {
    const safe = toSafeFileMeta(item);
    const key = `${safe.filename}|${safe.size}|${safe.extension}`;
    map.set(key, safe);
  }
  return [...map.values()];
}

function encodeBase64UrlUnicode(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64UrlUnicode(value) {
  let base64 = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function saveSettings() {
  const key = document.getElementById("gemini-key")?.value?.trim() || "";
  const model = document.getElementById("gemini-model")?.value?.trim() || DEFAULT_MODEL;
  state.settings = {
    ...state.settings,
    gemini_model: model,
    document_mode: document.getElementById("doc-mode")?.value || state.settings.document_mode || DEFAULT_DOCUMENT_MODE,
    pipeline_mode: document.getElementById("pipeline-mode")?.value || state.settings.pipeline_mode || "high_quality",
    product_name: document.getElementById("product-name")?.value?.trim() || "",
    software_version: document.getElementById("software-version")?.value?.trim() || "",
    target_hardware: document.getElementById("target-hardware")?.value?.trim() || "",
    target_regulator: document.getElementById("target-regulator")?.value?.trim() || "",
    intended_use: document.getElementById("intended-use")?.value?.trim() || "",
  };
  if (key) state.settings.gemini_api_key = key;
  saveSettingsToStorage(state.settings);
  state.status = state.settings.gemini_api_key
    ? "설정이 저장되었습니다. Gemini 직접 호출과 인허가 문서 생성 스킬이 적용됩니다."
    : "설정이 저장되었습니다. 키가 없으면 인허가 체크리스트 기반 로컬 초안으로 생성합니다.";
  pushToast("success", "저장 완료", state.status);
  render();
}

function createProject() {
  const title = document.getElementById("project-title").value.trim() || "인허가 문서 초안";
  const id = makeId("project");
  state.project = {
    id,
    title,
    share_token: makeId("share"),
    document_profile: currentDocumentProfile(),
    files: [],
    reference_files: [],
    source_file_meta: [],
    source_reference_file_meta: [],
    draft: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  window.history.replaceState({}, "", `?project=${id}`);
  persistProject();
  state.status = "프로젝트가 준비되었습니다. 파일 선택 또는 드래그 앤 드롭으로 자료를 첨부하세요.";
  pushToast("success", "프로젝트 생성", "프로젝트가 브라우저에 저장되었습니다.");
  render();
}

async function uploadReferenceFiles(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length) return;
  const validation = validateSelectedReferenceFiles(files);
  if (validation) {
    pushToast("error", "참조파일 제한", validation);
    return;
  }
  await withStatus("참조파일을 브라우저에서 읽는 중입니다.", async () => {
    if (!state.project) {
      createProjectWithoutRender(document.getElementById("project-title")?.value || "인허가 문서 초안");
    }
    const parsedReferences = [];
    for (const file of files) {
      state.status = `${file.name} 참조파일을 읽고 있습니다.`;
      render();
      const parsed = await parseSelectedFile(file);
      parsed.role = "reference_format";
      parsedReferences.push(parsed);
    }
    state.project.reference_files = parsedReferences.slice(0, state.limits.max_reference_files_per_project);
    state.project.source_reference_file_meta = parsedReferences.map(toFileMeta);
    state.project.draft = null;
    persistProject();
    state.status = "참조파일을 읽었습니다. 이후 생성 결과물은 참조파일의 목차·문체·표 구성에 맞춰 작성됩니다.";
  }, "참조파일을 읽었습니다.");
}

async function uploadFiles(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  await uploadFileList(files);
}

async function uploadFileList(files) {
  if (!files.length) return;
  const validation = validateSelectedFiles(files);
  if (validation) {
    pushToast("error", "업로드 제한", validation);
    return;
  }
  await withStatus("파일을 브라우저에서 읽는 중입니다.", async () => {
    if (!state.project) {
      createProjectWithoutRender(document.getElementById("project-title")?.value || "인허가 문서 초안");
    }
    const parsedFiles = [];
    for (const file of files) {
      state.status = `${file.name} 파일을 읽고 있습니다.`;
      render();
      parsedFiles.push(await parseSelectedFile(file));
    }
    state.project.files = [...(state.project.files || []), ...parsedFiles];
    state.project.draft = null;
    persistProject();
    state.status = "첨부파일을 브라우저에서 읽었습니다. 분석 및 초안 생성을 실행하세요.";
  }, "첨부파일을 읽었습니다.");
}

function createProjectWithoutRender(title) {
  const id = makeId("project");
  state.project = {
    id,
    title: title || "인허가 문서 초안",
    share_token: makeId("share"),
    document_profile: currentDocumentProfile(),
    files: [],
    reference_files: [],
    source_file_meta: [],
    source_reference_file_meta: [],
    draft: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  window.history.replaceState({}, "", `?project=${id}`);
  persistProject();
}

function validateSelectedReferenceFiles(files) {
  if (files.length > state.limits.max_reference_files_per_project) {
    return `참조파일은 최대 ${state.limits.max_reference_files_per_project}개까지 첨부할 수 있습니다. 기존 참조파일을 교체하려면 새 파일 1개만 선택하세요.`;
  }
  const supported = new Set(state.limits.supported_extensions.map(item => item.toLowerCase()));
  for (const file of files) {
    const suffix = extensionOf(file.name);
    if (!supported.has(suffix)) {
      return `${file.name}은 지원하지 않는 참조파일 형식입니다. 지원 형식: ${state.limits.supported_extensions.join(", ")}`;
    }
    if (file.size > state.limits.max_file_size_bytes) {
      return `${file.name}의 용량이 너무 큽니다. 파일당 최대 ${state.limits.max_file_size_label}까지 가능합니다.`;
    }
  }
  return "";
}

function validateSelectedFiles(files) {
  const currentCount = state.project?.files?.length || 0;
  if (currentCount + files.length > state.limits.max_files_per_project) {
    return `프로젝트당 첨부파일은 최대 ${state.limits.max_files_per_project}개까지 분석할 수 있습니다. 현재 ${currentCount}개, 추가 선택 ${files.length}개입니다.`;
  }
  const supported = new Set(state.limits.supported_extensions.map(item => item.toLowerCase()));
  for (const file of files) {
    const suffix = extensionOf(file.name);
    if (!supported.has(suffix)) {
      return `${file.name}은 지원하지 않는 형식입니다. 지원 형식: ${state.limits.supported_extensions.join(", ")}`;
    }
    if (file.size > state.limits.max_file_size_bytes) {
      return `${file.name}의 용량이 너무 큽니다. 파일당 최대 ${state.limits.max_file_size_label}까지 가능합니다.`;
    }
  }
  return "";
}

async function parseSelectedFile(file) {
  const extension = extensionOf(file.name);
  const base = {
    id: makeId("file"),
    filename: file.name,
    extension,
    size: file.size,
    parsed_status: "parsed",
    text: "",
    summary: "",
    error: "",
  };

  try {
    if (isPlainTextExtension(extension)) {
      base.text = await file.text();
    } else if (extension === ".docx") {
      base.text = await parseDocx(file);
    } else if (extension === ".xlsx") {
      base.text = await parseXlsx(file);
    } else if (extension === ".pdf") {
      base.text = await parsePdf(file);
    } else if (isSupportedImageExtension(extension)) {
      const asset = await createImageAssetFromBlob(file, file.name, { source: file.name, role: "direct-image" });
      base.media_assets = asset ? [asset] : [];
      base.text = createImageEvidenceText(file.name, base.media_assets[0]);
    } else if (extension === ".zip") {
      const parsedZip = await parseZip(file);
      if (typeof parsedZip === "string") {
        base.text = parsedZip;
      } else {
        base.text = parsedZip.text || "";
        base.media_assets = parsedZip.media_assets || [];
      }
    } else if (extension === ".hwpx") {
      base.text = await parseHwpx(file);
    } else if (extension === ".hwp") {
      base.text = createHwpBrowserFallbackText(file);
      base.summary = "HWP 바이너리 파일입니다. GitHub Pages 정적 모드에서는 본문 직접 추출이 제한되어 파일명/메타데이터 근거로 분석에 포함합니다. 정확한 본문 반영이 필요하면 HWPX, DOCX, PDF로 변환해 함께 첨부하세요.";
    }
    base.text = normalizeText(base.text).slice(0, MAX_EXTRACT_CHARS_PER_FILE);
    base.summary = base.summary || createLocalFileSummary(base.text, file.name);
    if (!base.text.trim()) {
      base.parsed_status = "failed";
      base.error = "텍스트를 추출하지 못했습니다.";
    }
  } catch (error) {
    base.parsed_status = "failed";
    base.error = error.message || "파일 파싱에 실패했습니다.";
    base.summary = base.error;
  }
  return base;
}

function createHwpBrowserFallbackText(file) {
  const name = String(file?.name || "");
  const isSdf = /ib-sdf|sdf|상세설계|software\s*design|s\/w\s*상세설계/i.test(name);
  const lines = [
    `[HWP: ${name}]`,
    "파일 형식: HWP 바이너리 한글 문서",
    `파일 크기: ${formatBytes(file.size || 0)}`,
    "파싱 상태: 제한 파싱",
    "주의: GitHub Pages 정적 브라우저 환경에서는 HWP 바이너리 본문을 안정적으로 직접 추출할 수 없습니다.",
    "처리 방식: 파일명과 메타데이터를 근거로 문서 종류를 판별하고, 확인되지 않은 사실은 [확인 필요]로 표시합니다.",
  ];
  if (isSdf) {
    lines.push(
      "",
      "[내장 양식 힌트: IB-SDF / S/W 상세설계파일 계열]",
      "이 파일명은 SW 상세설계파일 참조문서로 판별됩니다. HWP 본문 추출이 제한되더라도 결과물은 파일 읽기 실패 보고서가 아니라 아래 제출 문서 구조를 우선 적용해야 합니다.",
      "0. 제·개정 이력표",
      "1. 개요 (Introduction): 목적, 적용범위, 개발 목표 및 수행인원",
      "2. 용어정의 (Terminology and Definitions): S/W 아키텍처 설계도, SDD, SDS, 주요 시스템 용어",
      "3. S/W 아키텍처 설계도 (Software Architecture Design Chart): UI, Application Logic, Data Layer, Report Export, Network, Device/Controller Interface",
      "4. S/W 설계 기술서 (Software Design Description): Operation Part, User Interface, System Operation, Data Storage, Auto-Control, External Interface",
      "5. S/W 설계 명세서 (Software Design Specification): Software Flow Chart, Module Design Specification, 예외처리, 검증 포인트",
      "6. 인허가·사이버보안 설계 고려사항: 접근통제, 저장보안, 전송보안, 로그 무결성, PDF 반출",
      "7. 요구사항 추적성 매트릭스 초안",
      "8. 첨부자료 분석 결과 및 확인 필요 항목",
      "작성 원칙: HWP 본문 추출 제한 문구는 검토 메모/근거파일 표에만 넣고, 본문은 현재 첨부 ZIP/PDF/스크린샷/코드 근거를 이용해 SDD/SDS 형식으로 채웁니다."
    );
  } else {
    lines.push("권장: 기존 허가 문서의 본문을 정확히 반영하려면 HWP를 HWPX, DOCX, PDF 또는 TXT로 변환해 함께 첨부하세요.");
  }
  return lines.join("\n");
}

async function parseDocx(file) {
  ensureLibrary(window.JSZip, "JSZip");
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const xmlFile = zip.file("word/document.xml");
  if (!xmlFile) throw new Error("DOCX 본문 XML을 찾지 못했습니다.");
  const xml = await xmlFile.async("string");
  return docxXmlToText(xml);
}

async function parseXlsx(file) {
  ensureLibrary(window.XLSX, "XLSX");
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const parts = [];
  for (const sheetName of workbook.SheetNames.slice(0, 8)) {
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }).slice(0, 80);
    parts.push(`[Sheet: ${sheetName}]`);
    for (const row of rows) {
      const line = row.map(cell => String(cell ?? "").trim()).filter(Boolean).join("\t");
      if (line) parts.push(line);
    }
  }
  return parts.join("\n");
}

async function parsePdf(file) {
  ensureLibrary(window.pdfjsLib, "PDF.js");
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];
  const maxPages = Math.min(pdf.numPages, 30);
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str || "").join(" ");
    pages.push(`[Page ${pageNo}] ${text}`);
  }
  return pages.join("\n\n");
}

async function parseZip(file) {
  ensureLibrary(window.JSZip, "JSZip");
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files)
    .filter(name => !zip.files[name].dir)
    .filter(name => !isIgnorableZipEntry(name));
  const documentEntries = names.filter(isZipExtractableDocument).sort(zipEntrySort);
  const codeEntries = names.filter(name => isImportantZipEntry(name) && !isZipExtractableDocument(name)).sort(zipEntrySort);
  const mediaEntries = names.filter(isZipMediaEntry).sort(zipEntrySort);
  const nestedZipEntries = names.filter(name => extensionOf(name) === ".zip").sort(zipEntrySort);
  const important = uniqueList([...documentEntries, ...codeEntries]).slice(0, ZIP_MAX_LIST_ITEMS);
  const parts = [
    `[ZIP: ${file.name}]`,
    "ZIP 분석 요약: 내부 문서, 코드/설정, 화면/미디어 파일명을 분류하고, 브라우저에서 텍스트 추출 가능한 내부 파일은 본문 근거로 확장했습니다.",
    `총 파일 수: ${names.length}`,
    `내부 문서 후보: ${documentEntries.length}`,
    `코드/설정 후보: ${codeEntries.length}`,
    `이미지/영상 후보: ${mediaEntries.length}`,
    `중첩 ZIP 후보: ${nestedZipEntries.length}`,
    "",
    "[ZIP 내부 문서/참조 후보]",
    ...(documentEntries.slice(0, 50).map(name => `- ${name}`) || []),
    "",
    "[ZIP 내부 코드/설정 후보]",
    ...(codeEntries.slice(0, 70).map(name => `- ${name}`) || []),
  ];

  if (mediaEntries.length) {
    parts.push("", "[ZIP 내부 화면/미디어 후보]", ...mediaEntries.slice(0, 60).map(name => `- ${name}`));
  }
  if (nestedZipEntries.length) {
    parts.push("", "[중첩 ZIP 후보]", ...nestedZipEntries.slice(0, 20).map(name => `- ${name}`));
  }

  let extractedTextEntries = 0;
  let extractedDocumentEntries = 0;
  let totalExtractedChars = 0;
  for (const name of important) {
    if (extractedTextEntries >= ZIP_MAX_TEXT_ENTRIES) break;
    if (totalExtractedChars >= ZIP_TOTAL_TEXT_LIMIT) break;
    const entry = zip.file(name);
    if (!entry) continue;
    const ext = extensionOf(name);
    const entrySize = getZipEntrySize(entry);
    let cleaned = "";
    try {
      if (isPlainTextExtension(ext)) {
        cleaned = normalizeText(await entry.async("string"));
      } else if (ext === ".hwp") {
        cleaned = createHwpBrowserFallbackText({ name, size: entrySize || 0 });
      } else if ([".docx", ".xlsx", ".pdf", ".hwpx", ".zip"].includes(ext)) {
        if (extractedDocumentEntries >= ZIP_MAX_DOCUMENT_ENTRIES) continue;
        if (entrySize && entrySize > 8 * 1024 * 1024 && ext !== ".zip") {
          cleaned = `대용량 내부 문서라 브라우저 직접 추출을 건너뜁니다. 파일명: ${name}, 크기: ${formatBytes(entrySize)}`;
        } else {
          const blob = await zipEntryToBlob(entry, ext);
          if (ext === ".docx") cleaned = await parseDocx(blob);
          else if (ext === ".xlsx") cleaned = await parseXlsx(blob);
          else if (ext === ".pdf") cleaned = await parsePdf(blob);
          else if (ext === ".hwpx") cleaned = await parseHwpx(blob);
          else if (ext === ".zip") cleaned = await summarizeNestedZipBlob(blob, name);
        }
        extractedDocumentEntries += 1;
      }
      cleaned = normalizeText(cleaned).slice(0, ZIP_ENTRY_TEXT_LIMIT);
      if (!cleaned) continue;
      totalExtractedChars += cleaned.length;
      extractedTextEntries += 1;
      parts.push(`\n[ZIP FILE: ${name}]\n${cleaned}`);
    } catch (error) {
      parts.push(`\n[ZIP FILE: ${name}]\n읽기 실패: ${error.message}`);
    }
  }
  const mediaAssets = [];
  const imageEntries = mediaEntries.filter(name => isZipImageEntry(name)).sort(zipEntrySort).slice(0, ZIP_MAX_MEDIA_ASSETS);
  for (const name of imageEntries) {
    try {
      const entry = zip.file(name);
      if (!entry) continue;
      const blob = await zipEntryToBlob(entry, extensionOf(name));
      const asset = await createImageAssetFromBlob(blob, name, { source: file.name, role: inferImageEvidenceRole(name) });
      if (asset) mediaAssets.push(asset);
    } catch (error) {
      parts.push(`
[ZIP IMAGE: ${name}]
이미지 추출 실패: ${error.message}`);
    }
  }
  if (mediaAssets.length) {
    parts.push("", "[ZIP 내부 삽입 이미지]", ...mediaAssets.map((asset, index) => `- 그림 ${index + 1}: ${asset.name} / ${asset.caption} / ${asset.width || "?"}x${asset.height || "?"}`));
  }
  return { text: parts.join("\n"), media_assets: mediaAssets };
}


function isZipImageEntry(name) {
  return /\.(png|jpe?g|webp)$/i.test(String(name || ""));
}

function isSupportedImageExtension(extension) {
  return [".png", ".jpg", ".jpeg", ".webp"].includes(String(extension || "").toLowerCase());
}

function createImageEvidenceText(name, asset) {
  const lines = [`[IMAGE: ${name}]`, "이미지 파일: 화면/산출물 증거 이미지", `추출 상태: ${asset ? "DOCX 삽입용 축소 이미지 생성" : "이미지 변환 실패"}`];
  if (asset) {
    lines.push(`이미지 크기: ${asset.width || "?"} x ${asset.height || "?"}`, `권장 캡션: ${asset.caption || asset.name || name}`);
  }
  return lines.join("\n");
}

function inferImageEvidenceRole(name) {
  const lower = String(name || "").toLowerCase();
  if (/login|home|main|시작|로그인/.test(lower)) return "login";
  if (/patient|guest|user|환자|번호|등록|수정|삭제/.test(lower)) return "patient";
  if (/profile|editor|select|프로파일|편집|선택/.test(lower)) return "profile";
  if (/run|treatment|chart|abt|oxygen|pressure|치료|운전|압력|그래프|완료/.test(lower)) return "run";
  if (/log|record|history|operation|report|pdf|내보내기|기록|운영/.test(lower)) return "log-report";
  return "screen-evidence";
}

function makeImageCaption(name, role) {
  const base = String(name || "첨부 이미지").split("/").pop();
  const label = {
    "login": "로그인/시작 화면 증거",
    "patient": "환자정보 입력·관리 화면 증거",
    "profile": "치료 프로파일 선택·편집 화면 증거",
    "run": "치료 운전·상태 표시 화면 증거",
    "log-report": "치료기록·운영로그·보고서 화면 증거",
    "screen-evidence": "화면/산출물 증거 이미지",
    "direct-image": "직접 첨부 이미지 근거"
  }[role || "screen-evidence"] || "화면/산출물 증거 이미지";
  return `${label}: ${base}`;
}

async function createImageAssetFromBlob(blob, name, options = {}) {
  const role = options.role || inferImageEvidenceRole(name);
  try {
    const objectUrl = URL.createObjectURL(blob);
    const image = await loadBrowserImage(objectUrl);
    URL.revokeObjectURL(objectUrl);
    const scaled = scaleImageSize(image.naturalWidth || image.width || IMAGE_EXPORT_MAX_WIDTH, image.naturalHeight || image.height || IMAGE_EXPORT_MAX_HEIGHT);
    const canvas = document.createElement("canvas");
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", IMAGE_EXPORT_QUALITY);
    return {
      id: makeId("img"),
      name: String(name || "image").slice(0, 240),
      source: String(options.source || name || "첨부파일").slice(0, 240),
      role,
      caption: makeImageCaption(name, role),
      alt: makeImageCaption(name, role),
      dataUrl,
      contentType: "image/jpeg",
      extension: ".jpg",
      width: scaled.width,
      height: scaled.height,
      originalWidth: image.naturalWidth || image.width || 0,
      originalHeight: image.naturalHeight || image.height || 0,
    };
  } catch (error) {
    console.warn("Image asset conversion failed", name, error);
    return null;
  }
}

function loadBrowserImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 로드 실패"));
    image.src = url;
  });
}

function scaleImageSize(width, height) {
  const safeWidth = Math.max(1, Number(width) || IMAGE_EXPORT_MAX_WIDTH);
  const safeHeight = Math.max(1, Number(height) || IMAGE_EXPORT_MAX_HEIGHT);
  const ratio = Math.min(1, IMAGE_EXPORT_MAX_WIDTH / safeWidth, IMAGE_EXPORT_MAX_HEIGHT / safeHeight);
  return { width: Math.round(safeWidth * ratio), height: Math.round(safeHeight * ratio) };
}

function collectEvidenceImages(files = []) {
  const all = [];
  for (const file of files || []) {
    for (const asset of file.media_assets || []) {
      if (asset?.dataUrl) all.push({ ...asset, parentFile: file.filename });
    }
  }
  const seen = new Set();
  return all.filter(asset => {
    const key = `${asset.name}|${asset.dataUrl?.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function imageBlockFromAsset(asset, index = 0) {
  return {
    id: makeId("image"),
    type: "image",
    order: 0,
    content: {
      caption: asset.caption || `그림 ${index + 1}. 화면 증거 이미지`,
      alt: asset.alt || asset.caption || "화면 증거 이미지",
      source: asset.source || asset.parentFile || asset.name || "첨부 ZIP",
      filename: asset.name || "image.jpg",
      dataUrl: asset.dataUrl || "",
      width: Number(asset.width || 0),
      height: Number(asset.height || 0),
      originalWidth: Number(asset.originalWidth || 0),
      originalHeight: Number(asset.originalHeight || 0),
    }
  };
}

function buildEvidenceImageRows(files = []) {
  return collectEvidenceImages(files).slice(0, ZIP_MAX_MEDIA_ASSETS).map((asset, index) => [
    `그림 ${index + 1}`,
    asset.caption || asset.name || "화면 증거 이미지",
    asset.source || asset.parentFile || "첨부 ZIP",
    asset.role || inferImageEvidenceRole(asset.name),
    `${asset.originalWidth || asset.width || "?"} x ${asset.originalHeight || asset.height || "?"}`,
  ]);
}

function attachEvidenceImagesToDraft(draft, files = []) {
  if (!draft || !Array.isArray(draft.blocks)) return draft;
  const images = collectEvidenceImages(files).slice(0, ZIP_MAX_MEDIA_ASSETS);
  if (!images.length) return draft;
  const hasImages = draft.blocks.some(block => block.type === "image" && block.content?.dataUrl);
  if (hasImages) return draft;
  let order = Math.max(-1, ...draft.blocks.map(block => Number(block.order) || 0)) + 1;
  const extra = [
    { ...headingBlock(0, 2, "부록 A. 화면 및 산출물 증거 이미지"), order: order++ },
    { ...paragraphBlock(0, "첨부 ZIP 내부에서 추출한 대표 화면 이미지를 문서 검토용 증거로 삽입하였다. 각 이미지는 Word 문서 크기와 브라우저 저장 한계를 고려하여 축소된 사본이며, 원본은 첨부 ZIP에서 관리한다."), order: order++ },
    { ...tableBlock(0, "화면 증거 이미지 매핑", ["번호", "캡션", "출처", "분류", "원본/추출 크기"], buildEvidenceImageRows(files)), order: order++ },
    ...images.map((asset, index) => ({ ...imageBlockFromAsset(asset, index), order: order++ })),
  ];
  return { ...draft, blocks: [...draft.blocks, ...extra] };
}

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}

function zipEntrySort(a, b) {
  return zipEntryPriority(a) - zipEntryPriority(b) || String(a).localeCompare(String(b));
}

function zipEntryPriority(name) {
  const lower = String(name || "").toLowerCase();
  if (/ib-sdf|sdf|상세설계|software.*design|설계|인허가|regulatory|submission/.test(lower)) return 0;
  if (/readme|manual|guide|사용자|매뉴얼|보고서|report|log|test|검증|시험/.test(lower)) return 1;
  if (/androidmanifest\.xml$|build\.gradle|settings\.gradle/.test(lower)) return 2;
  if (/res\/values\/.*\.xml$|strings\.xml$|res\/layout\/.*\.xml$|res\/menu\/.*\.xml$|navigation\/.*\.xml$/.test(lower)) return 3;
  if (/activity|service|fragment|viewmodel|repository|dao|database|export|log|safety|alarm|emergency|bluetooth|ble|socket|api/.test(lower)) return 4;
  if (isZipMediaEntry(name)) return 8;
  return 9;
}

function isIgnorableZipEntry(name) {
  const normalized = String(name || "").replaceAll("\\", "/");
  return /(^|\/)\.git\/|(^|\/)node_modules\/|(^|\/)build\/|(^|\/)\.gradle\/|(^|\/)\.idea\/|(^|\/)__macosx\/|\.DS_Store$/i.test(normalized);
}

function isZipExtractableDocument(name) {
  const ext = extensionOf(name);
  return [".docx", ".pdf", ".xlsx", ".txt", ".md", ".csv", ".hwpx", ".hwp", ".xml", ".json", ".yml", ".yaml", ".zip"].includes(ext);
}

function isZipMediaEntry(name) {
  return /\.(png|jpe?g|webp|gif|bmp|svg|mp4|mov|webm|avi|mkv)$/i.test(String(name || ""));
}

function getZipEntrySize(entry) {
  return Number(entry?._data?.uncompressedSize || entry?._data?.compressedSize || 0);
}

async function zipEntryToBlob(entry, extension) {
  const buffer = await entry.async("arraybuffer");
  return new Blob([buffer], { type: mimeTypeForExtension(extension) });
}

function mimeTypeForExtension(extension) {
  return {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pdf": "application/pdf",
    ".hwpx": "application/hwp+zip",
    ".zip": "application/zip",
  }[extension] || "application/octet-stream";
}

async function summarizeNestedZipBlob(blob, nestedName) {
  const zip = await window.JSZip.loadAsync(await blob.arrayBuffer());
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir).filter(name => !isIgnorableZipEntry(name));
  const important = names.filter(name => isZipExtractableDocument(name) || isImportantZipEntry(name)).sort(zipEntrySort).slice(0, 50);
  return [
    `[NESTED ZIP: ${nestedName}]`,
    `총 파일 수: ${names.length}`,
    "주요 내부 파일:",
    ...important.map(name => `- ${name}`),
  ].join("\n");
}

async function parseHwpx(file) {
  ensureLibrary(window.JSZip, "JSZip");
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir && name.toLowerCase().endsWith(".xml"));
  const parts = [`[HWPX: ${file.name}]`];
  for (const name of names.filter(name => /contents?|section|body|header|footer/i.test(name)).slice(0, 30)) {
    const xml = await zip.file(name).async("string");
    const text = decodeXmlEntities(xml.replace(/<[^>]+>/g, " "));
    const cleaned = normalizeText(text);
    if (cleaned) parts.push(`[XML: ${name}]\n${cleaned.slice(0, 5000)}`);
  }
  return parts.join("\n\n");
}

function isPlainTextExtension(extension) {
  return [".txt", ".md", ".csv", ".kt", ".java", ".xml", ".gradle", ".kts", ".json", ".yml", ".yaml"].includes(extension);
}

function isImportantZipEntry(name) {
  const normalized = String(name || "").replaceAll("\\", "/");
  const lower = normalized.toLowerCase();
  if (isIgnorableZipEntry(normalized)) return false;
  if (/androidmanifest\.xml$/.test(lower)) return true;
  if (/(build|settings)\.gradle(\.kts)?$/.test(lower)) return true;
  if (/res\/values\/.*\.xml$/.test(lower)) return true;
  if (/res\/layout\/.*\.xml$/.test(lower)) return true;
  if (/res\/menu\/.*\.xml$/.test(lower)) return true;
  if (/navigation\/.*\.xml$/.test(lower)) return true;
  if (/\.(kt|java|xml|gradle|kts|md|txt|json|yml|yaml)$/.test(lower)) return true;
  if (/\.(docx|pdf|xlsx|hwpx|hwp|zip)$/.test(lower)) return true;
  return false;
}

function isAndroidEvidencePath(name) {
  const lower = String(name || "").toLowerCase();
  return /androidmanifest\.xml|build\.gradle|settings\.gradle|res\/values|res\/layout|res\/menu|navigation|\.(kt|java|xml|gradle|kts)$/.test(lower);
}

async function analyzeProject() {
  if (!state.project?.files?.length) return;
  await withStatus("첨부자료를 분류하고 상세설계 초안을 생성하는 중입니다.", async () => {
    const parsedFiles = state.project.files.filter(file => file.parsed_status === "parsed" && (file.text?.trim() || file.assets?.length));
    const referenceFiles = getParsedReferenceFiles();
    if (!parsedFiles.length) throw new Error("분석 가능한 파일 텍스트 또는 이미지 근거가 없습니다.");
    state.project.document_profile = currentDocumentProfile();

    const mode = state.settings.pipeline_mode || "high_quality";
    const regulatoryMode = (state.settings.document_mode || DEFAULT_DOCUMENT_MODE) !== "report";
    let analysisBundle = buildLocalAnalysisBundle(parsedFiles, referenceFiles);
    state.project.analysis_bundle = analysisBundle;
    persistProject(false);

    if (state.settings.gemini_api_key && regulatoryMode && mode !== "single_pass") {
      state.status = "1/4 Gemini가 ZIP 내부 이미지와 파일 목록을 화면/기능별로 분류하는 중입니다.";
      render();
      try {
        const remoteBundle = await generateEvidenceMapWithGemini(parsedFiles, referenceFiles, analysisBundle);
        analysisBundle = normalizeAnalysisBundle(remoteBundle, analysisBundle);
        state.project.analysis_bundle = analysisBundle;
        persistProject(false);
      } catch (error) {
        console.warn("Gemini evidence map failed; keep local analysis", error);
        pushToast("error", "1단계 분석 보정", `${error.message} 로컬 근거 맵으로 계속 진행합니다.`, false);
      }
    }

    let draft;
    if (state.settings.gemini_api_key) {
      state.status = regulatoryMode
        ? "2/4 Gemini가 SDD/SDS 상세설계 본문을 작성하는 중입니다."
        : "Gemini API로 일반 보고서 초안을 생성하는 중입니다.";
      render();
      try {
        draft = await generateDraftWithGemini(parsedFiles, referenceFiles, analysisBundle);
        if (regulatoryMode && mode === "high_quality") {
          state.status = "3/4 Gemini가 인허가 문서 심사관 관점으로 품질을 검토하고 보강하는 중입니다.";
          render();
          draft = await reviewRegulatoryDraftWithGemini(draft, parsedFiles, referenceFiles, analysisBundle);
        }
      } catch (error) {
        console.warn("Gemini generation failed; fallback to local draft", error);
        pushToast("error", "Gemini 응답 보정 실패", `${error.message} 로컬 SDF 초안으로 대체합니다.`, false);
        draft = generateLocalDraft(parsedFiles, error.message, referenceFiles);
      }
    } else {
      draft = generateLocalDraft(parsedFiles, "", referenceFiles);
    }

    state.status = regulatoryMode ? "4/4 화면 이미지와 근거표를 DOCX 본문에 배치하는 중입니다." : "초안 후처리 중입니다.";
    render();
    draft = reinforceDraftWithAnalysis(draft, analysisBundle, parsedFiles, referenceFiles);
    draft = attachEvidenceImagesToDraft(draft, parsedFiles);
    draft = regulatoryMode ? enforceProfessionalDraftQuality(draft, parsedFiles, referenceFiles, analysisBundle) : draft;
    const normalized = normalizeDraft(draft, state.project.title);
    const score = scoreRegulatoryDraftQuality(normalized, analysisBundle);
    state.project.analysis_bundle = { ...analysisBundle, quality_score: score };
    state.project.draft = normalized;
    state.project.updated_at = new Date().toISOString();
    persistProject();
    state.status = regulatoryMode
      ? `S/W 상세설계파일 초안이 생성되었습니다. 품질 점수 ${score}/100 기준으로 [확인 필요] 항목을 검토하세요.`
      : "보고서 초안이 생성되었습니다. 화면에서 수정 후 Word로 다운로드하세요.";
  }, "상세설계 초안이 생성되었습니다.");
}


function currentGeminiModel() {
  return state.settings.gemini_model || DEFAULT_MODEL;
}

function buildGeminiParts(prompt, files = [], options = {}) {
  const parts = [{ text: String(prompt || "") }];
  const maxImages = Number(options.maxImages || 0);
  if (!maxImages) return parts;
  const assets = collectEvidenceImages(files).slice(0, maxImages);
  assets.forEach((asset, index) => {
    const inline = dataUrlToInlineData(asset.dataUrl);
    if (!inline) return;
    parts.push({ text: `\n[IMAGE_EVIDENCE_${index + 1}] filename=${asset.name || asset.filename || "image"}; source=${asset.source || "첨부 ZIP"}; role=${asset.role || "screen evidence"}; caption_hint=${asset.caption || "화면 증거 이미지"}\n이 이미지를 화면명, 주요 UI 요소, 기능, SDD/SDS 연결 근거 관점으로 해석하세요.` });
    parts.push({ inlineData: inline });
  });
  return parts;
}

function dataUrlToInlineData(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1] || "image/jpeg", data: match[2] };
}

async function callGeminiJson(prompt, options = {}) {
  const model = currentGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(state.settings.gemini_api_key)}`;
  const finalPrompt = options.retryInstruction ? `${prompt}\n\n${options.retryInstruction}` : prompt;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: buildGeminiParts(finalPrompt, options.files || [], options) }],
      generationConfig: {
        temperature: Number.isFinite(options.temperature) ? options.temperature : 0.12,
        maxOutputTokens: options.maxOutputTokens || 24576,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error?.message || `Gemini API 호출 실패: HTTP ${response.status}`;
    throw new Error(message);
  }
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n");
  if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
  return parseDraftJson(text);
}

function buildLocalAnalysisBundle(files, referenceFiles = []) {
  const images = collectEvidenceImages(files).slice(0, ZIP_MAX_MEDIA_ASSETS);
  const inventory = files.map(file => ({
    filename: file.filename,
    extension: file.extension,
    size: file.size,
    type: classifyArtifact(file),
    summary: file.summary || "요약 없음",
  }));
  const screen_map = images.map((asset, index) => inferScreenEvidenceFromAsset(asset, index));
  const evidence_map = buildCurrentEvidenceRows(files).map(row => ({ category: row[0], finding: row[1], section: row[2] }));
  const modules = buildModuleCandidatesFromEvidence(files, screen_map);
  return {
    version: 2,
    generated_by: "local-browser-analysis",
    model_recommended: DEFAULT_MODEL,
    inventory,
    reference_files: referenceFiles.map(file => ({ filename: file.filename, extension: file.extension, summary: file.summary || "" })),
    screen_map,
    evidence_map,
    modules,
    sdd_focus: ["User Interface", "System Operation", "Data Layer", "Report Export", "Network/Server Transfer", "Security"],
    sds_focus: modules.map(item => item.design_id),
    missing_items: buildMissingInfoRows(currentDocumentProfile(), files, referenceFiles).map(row => ({ item: row[0], evidence: row[1], priority: row[2] })),
  };
}

function inferScreenEvidenceFromAsset(asset, index = 0) {
  const name = String(asset.name || asset.filename || "").toLowerCase();
  const source = String(asset.source || "");
  const label = String(asset.caption || asset.name || `화면 증거 ${index + 1}`);
  let screen = "화면 증거 이미지";
  let category = "UI Evidence";
  let design_use = "화면 구성, 사용자 입력, 출력 표시, 예외처리 검토 근거";
  if (/login|home|main|start|로그인|로그인/.test(name)) { screen = "로그인/시작 화면"; category = "Login"; design_use = "운영 소프트웨어 접근, 권한/시작 흐름, 초기 화면 표시 근거"; }
  else if (/patient|guest|number|user|환자|번호/.test(name)) { screen = "환자번호 입력/환자관리 화면"; category = "Patient Management"; design_use = "환자 식별정보 입력, 조회, 등록/수정/삭제 예외처리 근거"; }
  else if (/profile|editor|select|프로파일|프로/.test(name)) { screen = "프로파일 선택/편집 화면"; category = "Profile"; design_use = "치료 프로파일 선택, 시간/압력 구간 편집, 저장 검증 근거"; }
  else if (/run|treatment|chart|abt|oxygen|pressure|치료|운전|압력/.test(name)) { screen = "치료 운전/모니터링 화면"; category = "Treatment Run"; design_use = "목표/실측 압력 표시, 치료 상태 전이, ABT/환경정보 표시 근거"; }
  else if (/log|record|history|report|pdf|export|운영|기록|내보내기/.test(name)) { screen = "치료기록/운영로그/보고서 화면"; category = "Log Report"; design_use = "치료 세션 조회, 운영로그 필터, PDF 미리보기/내보내기 근거"; }
  return {
    no: index + 1,
    filename: asset.name || asset.filename || `image-${index + 1}`,
    source,
    screen,
    category,
    visible_elements: "[Gemini 이미지 분석 또는 수동 검토 필요]",
    design_use,
    sdd_section: category === "Log Report" ? "4.1.3 / 5.5" : category === "Treatment Run" ? "4.2 / 5.2" : "4.1.1 / 5.2",
    confidence: "medium",
    caption: label,
  };
}

function buildModuleCandidatesFromEvidence(files, screenMap = []) {
  const text = files.map(file => `${file.filename}\n${file.text || ""}`).join("\n");
  const base = [
    ["SDS-UI-001", "로그인/시작", "운영 프로그램 접근 및 초기 진입", /login|home|start|로그인|시작/i],
    ["SDS-PAT-001", "환자번호 입력/환자관리", "환자 조회, 등록, 수정, 삭제", /patient|guest|환자|number|user/i],
    ["SDS-PF-001", "프로파일 선택/편집", "치료 시간/압력 구간 설정 및 검증", /profile|프로파일|editor|section|pressure_time/i],
    ["SDS-RUN-001", "치료 운전", "치료 시작, 상태 표시, 일시정지/재개/종료", /run|treatment|pressure|oxygen|abt|치료|압력/i],
    ["SDS-LOG-001", "치료기록/운영로그", "세션 조회, 운영 이력 조회, 필터", /log|record|history|operation|room|database|로그|기록/i],
    ["SDS-REP-001", "PDF 보고서/내보내기", "치료 상세 보고서와 운영로그 PDF 생성", /pdf|export|download|report|내보내기|보고서/i],
    ["SDS-NET-001", "중앙 서버 전송/통신", "REST/WebSocket 기반 상태 수신 및 데이터 전송", /websocket|socket|api|server|https|전송|중앙/i],
    ["SEC-001", "보안/감사추적", "접근통제, 개인정보, 무결성, 감사로그", /security|auth|token|encrypt|보안|권한|audit/i],
  ];
  return base.filter(row => row[3].test(text) || screenMap.some(item => row[3].test(`${item.screen} ${item.category} ${item.filename}`))).map(row => ({
    design_id: row[0],
    module: row[1],
    description: row[2],
    evidence: screenMap.filter(item => row[3].test(`${item.screen} ${item.category} ${item.filename}`)).map(item => item.filename).slice(0, 3),
  }));
}

function slimAnalysisBundle(bundle) {
  if (!bundle) return null;
  return {
    inventory: (bundle.inventory || []).slice(0, 30),
    screen_map: (bundle.screen_map || []).slice(0, 18),
    evidence_map: (bundle.evidence_map || []).slice(0, 20),
    modules: (bundle.modules || []).slice(0, 20),
    missing_items: (bundle.missing_items || []).slice(0, 20),
  };
}

function normalizeAnalysisBundle(remote, fallback) {
  const base = fallback || {};
  const bundle = remote && typeof remote === "object" ? remote : {};
  return {
    ...base,
    ...bundle,
    inventory: Array.isArray(bundle.inventory) && bundle.inventory.length ? bundle.inventory : base.inventory || [],
    screen_map: Array.isArray(bundle.screen_map) && bundle.screen_map.length ? bundle.screen_map : base.screen_map || [],
    evidence_map: Array.isArray(bundle.evidence_map) && bundle.evidence_map.length ? bundle.evidence_map : base.evidence_map || [],
    modules: Array.isArray(bundle.modules) && bundle.modules.length ? bundle.modules : base.modules || [],
    missing_items: Array.isArray(bundle.missing_items) && bundle.missing_items.length ? bundle.missing_items : base.missing_items || [],
    generated_by: bundle.generated_by || `gemini-${currentGeminiModel()}`,
  };
}

async function generateEvidenceMapWithGemini(files, referenceFiles = [], localBundle = null) {
  const prompt = buildEvidenceMapPrompt(files, referenceFiles, localBundle);
  return callGeminiJson(prompt, {
    files,
    maxImages: 12,
    temperature: 0.08,
    maxOutputTokens: 12288,
  });
}

function buildEvidenceMapPrompt(files, referenceFiles = [], localBundle = null) {
  const profile = currentDocumentProfile();
  const inventory = buildArtifactInventory(files, referenceFiles);
  const localJson = JSON.stringify(slimAnalysisBundle(localBundle), null, 2).slice(0, 40000);
  return `당신은 의료기기 소프트웨어 인허가 문서의 첨부자료 분석자입니다. 최종 문서를 바로 쓰지 말고, 먼저 ZIP 내부 이미지/보고서/파일을 SDD/SDS 작성 근거로 분류하세요.\n\n반드시 JSON 객체만 반환하세요. 마크다운 금지.\n\n반환 스키마:\n{\n  "generated_by":"gemini-evidence-map",\n  "inventory":[{"filename":"파일명","type":"Reference|Screen|Report|Log|AndroidCode|Other","summary":"근거 요약"}],\n  "screen_map":[{"no":1,"filename":"이미지 파일명","screen":"화면명","category":"Login|Patient|Profile|TreatmentRun|LogReport|Popup|Other","visible_elements":"보이는 UI 요소","design_use":"SDD/SDS에 반영할 설계 의미","sdd_section":"4.x/5.x","confidence":"high|medium|low"}],\n  "evidence_map":[{"category":"근거 분류","finding":"확인된 내용","section":"반영 섹션","limitations":"확인 필요"}],\n  "modules":[{"design_id":"SDS-...","module":"모듈명","description":"설계 의미","input":"입력","process":"처리","output":"출력","exception":"예외처리","evidence":["근거 파일"]}],\n  "missing_items":[{"item":"확인 필요 항목","evidence":"필요 근거","priority":"상|중|하"}]\n}\n\n분석 규칙:\n- 이미지마다 화면명을 구체화하세요. 예: 로그인 화면, 환자번호 입력, 프로파일 선택, 프로파일 에디터, 치료 운전, ABT/환경정보, 치료기록, 운영로그, 보고서 미리보기, 삭제 확인 팝업.\n- 이미지를 보고 보이는 UI 요소를 요약하세요. 임의로 안 보이는 내용은 쓰지 마세요.\n- 각 화면이 SDD/SDS 어느 항목의 근거인지 연결하세요.\n- HWP 본문 추출 실패는 한계로만 기록하고, IB-SDF 양식 적용 자체를 포기하지 마세요.\n\n현재 설정:\n- 프로그램명: ${profile.product_name || "[확인 필요]"}\n- 버전: ${profile.software_version || "[확인 필요]"}\n- 대상 장비: ${profile.target_hardware || "[확인 필요]"}\n\n파일 분류 힌트:\n${inventory}\n\n로컬 1차 분석:\n${localJson}`;
}

async function reviewRegulatoryDraftWithGemini(draft, files, referenceFiles = [], analysisBundle = null) {
  const draftJson = JSON.stringify(stripImagesForGemini(draft)).slice(0, MAX_GEMINI_INPUT_CHARS);
  const prompt = `당신은 의료기기 SW 인허가 문서 심사 대응 편집자입니다. 아래 S/W 상세설계파일 초안을 검토하고, 제가 직접 작성한 수준에 가깝게 보강하세요.\n\n반드시 JSON 객체만 반환하세요. image 블록은 만들지 말고, 텍스트/표/다이어그램 블록만 반환하세요. 이후 시스템이 기존 이미지를 다시 삽입합니다.\n\n보강 기준:\n- SDD 4장은 화면별 기능 설명을 구체화하세요. 화면 목적, 입력, 처리, 출력, 예외처리, 인허가 검증 포인트를 포함하세요.\n- SDS 5장은 모듈별 설계 ID와 입력/처리/출력/예외처리/검증 방법을 표로 상세화하세요.\n- 이미지 분석 결과를 화면-설계 매핑 표에 반영하세요.\n- "확인 필요"는 필요한 곳에만 쓰고, 화면/파일명/PDF 항목으로 확인되는 기능은 적극적으로 설계 문장으로 정리하세요.\n- HWP 추출 제한 문구가 본문을 지배하지 않게 하세요.\n- 요구사항 추적성 매트릭스, 사이버보안, PDF 산출물 필드 매핑, 데이터 모델을 반드시 유지/강화하세요.\n\n1단계 분석 결과:\n${JSON.stringify(slimAnalysisBundle(analysisBundle), null, 2).slice(0, 50000)}\n\n현재 초안 JSON:\n${draftJson}`;
  try {
    const reviewed = await callGeminiJson(prompt, { files, maxImages: 0, temperature: 0.08, maxOutputTokens: 24576 });
    return ensureRegulatoryDraftQuality(reviewed, files, referenceFiles, "Gemini 최종 검토 결과가 품질 기준에 미달하여 보정");
  } catch (error) {
    pushToast("error", "최종 검토 보정 실패", `${error.message} 1차 초안으로 계속 진행합니다.`, false);
    return draft;
  }
}

function stripImagesForGemini(draft) {
  return {
    title: draft?.title || "",
    blocks: (draft?.blocks || []).filter(block => block.type !== "image").slice(0, 120),
  };
}

function reinforceDraftWithAnalysis(draft, analysisBundle, files, referenceFiles = []) {
  if ((state.settings.document_mode || DEFAULT_DOCUMENT_MODE) === "report") return draft;
  const normalized = draft && Array.isArray(draft.blocks) ? draft : generateRegulatoryLocalDraft(files, "초안 구조 보정", referenceFiles);
  const text = JSON.stringify(normalized);
  const additions = [];
  let order = (normalized.blocks || []).length + 1;
  const add = block => additions.push({ ...block, order: order++ });
  if (!/화면[- ]?설계 매핑|화면 증거 이미지|screen_map/i.test(text) && analysisBundle?.screen_map?.length) {
    add(headingBlock(0, 3, "4.1.1.1 화면 증거 이미지 및 화면-설계 매핑"));
    add(paragraphBlock(0, "첨부 ZIP 내부에서 추출한 대표 화면 이미지는 사용자 인터페이스 설계와 기능 명세의 직접 근거로 사용한다. 각 화면은 화면명, 주요 UI 요소, 설계 활용 목적, SDD/SDS 반영 위치로 분류한다."));
    add(tableBlock(0, "화면 이미지-설계 항목 매핑", ["번호", "파일명", "화면명", "주요 UI 요소", "설계 활용", "반영 위치", "신뢰도"], (analysisBundle.screen_map || []).slice(0, 18).map(item => [
      item.no || "-", item.filename || "-", item.screen || item.category || "화면명 확인 필요", item.visible_elements || "[확인 필요]", item.design_use || "설계 근거", item.sdd_section || "4.1.1/5.2", item.confidence || "medium"
    ])));
  }
  if (!/예외처리 및 검증 포인트/i.test(text)) {
    add(headingBlock(0, 3, "5.6 예외처리 및 검증 포인트"));
    add(tableBlock(0, "예외처리 및 검증 포인트", ["구분", "예외 상황", "소프트웨어 처리", "검증 방법", "근거"], [
      ["환자정보", "미등록 환자번호 또는 필수값 누락", "등록 유도, 확인 버튼 제한, 오류 메시지 표시", "입력값 경계/누락 시험", "환자번호 입력/등록 화면"],
      ["프로파일", "최대압력·상승률·종료압력 조건 불만족", "저장 제한 또는 사용자 경고", "프로파일 저장 검증 시험", "프로파일 선택/편집 화면"],
      ["치료 운전", "중복 시작/일시정지/종료 명령", "상태별 버튼 활성 제어 및 로딩 차단", "상태 전이 시험", "치료 운전 화면"],
      ["통신", "서버/제어부 응답 실패", "사용자 알림, 재시도, 로컬 로그 보관", "통신 장애/재연결 시험", "REST/WebSocket 근거"],
      ["보고서", "세션 상세 로그 누락 또는 PDF 생성 실패", "내보내기 제한, 오류 표시, 재시도", "PDF 산출물 일치성 시험", "HBOT/Operation Logs PDF"],
    ]));
  }
  return { ...normalized, blocks: [...(normalized.blocks || []), ...additions] };
}

function scoreRegulatoryDraftQuality(draft, analysisBundle = null) {
  const text = JSON.stringify(draft || {});
  const blocks = draft?.blocks || [];
  let score = 0;
  const required = ["제·개정", "개요", "용어정의", "S/W 아키텍처", "S/W 설계 기술서", "S/W 설계 명세서", "사이버보안", "요구사항 추적성", "첨부자료 분석"];
  score += required.filter(item => text.includes(item)).length * 6;
  score += Math.min(18, blocks.filter(block => block.type === "table").length * 2);
  score += Math.min(12, blocks.filter(block => block.type === "image").length * 2);
  score += /화면 이미지-설계 항목 매핑|화면 증거 이미지/.test(text) ? 8 : 0;
  score += /예외처리 및 검증 포인트/.test(text) ? 6 : 0;
  score += /데이터 모델/.test(text) ? 5 : 0;
  score += /PDF 산출물 필드 매핑/.test(text) ? 5 : 0;
  score += /Room DB|WebSocket|REST API|중앙 서버/.test(text) ? 5 : 0;
  score += analysisBundle?.screen_map?.length ? 5 : 0;
  const hwpExcuses = (text.match(/본문 추출|추출 제한|확인할 수 없습니다/g) || []).length;
  score -= Math.min(15, hwpExcuses * 2);
  return Math.max(0, Math.min(100, score));
}

function enforceProfessionalDraftQuality(draft, files, referenceFiles = [], analysisBundle = null) {
  let candidate = ensureRegulatoryDraftQuality(draft, files, referenceFiles, "초안 품질 기준 미달로 내장 상세설계 구조 보정");
  candidate = reinforceDraftWithAnalysis(candidate, analysisBundle, files, referenceFiles);
  const score = scoreRegulatoryDraftQuality(candidate, analysisBundle);
  if (score >= 75) return candidate;
  const local = generateRegulatoryLocalDraft(files, "품질 점수가 낮아 내장 S/W 상세설계파일 템플릿으로 재구성", referenceFiles);
  return reinforceDraftWithAnalysis(local, analysisBundle, files, referenceFiles);
}

async function generateDocumentArchitecture() {
  if (!state.project?.files?.length) return;
  await withStatus("문서 전체 아키텍처를 생성하는 중입니다.", async () => {
    const parsedFiles = state.project.files.filter(file => file.parsed_status === "parsed" && file.text?.trim());
    const referenceFiles = getParsedReferenceFiles();
    if (!parsedFiles.length) throw new Error("아키텍처를 생성할 수 있는 파일 텍스트가 없습니다.");
    state.project.document_profile = currentDocumentProfile();

    let draft;
    if (state.settings.gemini_api_key) {
      state.status = "Gemini API로 문서 전체 구성 아키텍처를 설계하는 중입니다.";
      render();
      try {
        draft = await generateArchitectureWithGemini(parsedFiles, referenceFiles);
      } catch (error) {
        console.warn("Gemini architecture generation failed; fallback to local architecture", error);
        pushToast("error", "Gemini 아키텍처 생성 실패", `${error.message} 로컬 아키텍처로 대체합니다.`, false);
        draft = generateLocalArchitectureDraft(parsedFiles, error.message, referenceFiles);
      }
    } else {
      draft = generateLocalArchitectureDraft(parsedFiles, "", referenceFiles);
    }

    state.project.draft = normalizeDraft(draft, `${state.project.title || "문서"} 아키텍처`);
    state.project.updated_at = new Date().toISOString();
    persistProject();
    state.status = "문서 전체 구성 아키텍처가 생성되었습니다. 섹션 구조를 확인한 뒤 분석 및 초안 생성을 실행하세요.";
  }, "문서 아키텍처가 생성되었습니다.");
}

async function generateArchitectureWithGemini(files, referenceFiles = []) {
  const model = state.settings.gemini_model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(state.settings.gemini_api_key)}`;
  const sourceText = buildGeminiSourceText(referenceFiles, files);
  const profile = currentDocumentProfile();
  const inventory = buildArtifactInventory(files, referenceFiles);
  const prompt = buildArchitecturePrompt(sourceText, profile, inventory);

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: attempt === 1 ? prompt : `${prompt}\n\n재시도 지시: 이전 응답은 JSON 파싱에 실패했습니다. 설명 없이 유효한 JSON 객체만 반환하세요. 마크다운 코드펜스 금지. 마지막 문자는 반드시 } 이어야 합니다.` }] }],
        generationConfig: {
          temperature: attempt === 1 ? 0.18 : 0.05,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error?.message || `Gemini API 호출 실패: HTTP ${response.status}`;
      throw new Error(message);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n");
    if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
    try {
      return parseDraftJson(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Gemini 응답 JSON 파싱에 실패했습니다.");
}

function buildArchitecturePrompt(sourceText, profile, inventory) {
  return `당신은 한국어 인허가/기술문서 정보설계자입니다. 첨부파일 전체를 기준으로 실제 초안 작성 전에 사용할 "문서 전체 구성 아키텍처"를 설계하세요.\n\n목표:\n- 본문을 바로 길게 작성하지 말고, 어떤 순서와 구조로 문서를 구성할지 설계도를 만드세요.\n- 기존 승인/참조 문서, 현재 Android 프로젝트, 매뉴얼/스크린샷, 시험 노트가 각각 어느 섹션의 근거로 쓰일지 매핑하세요.\n- 인허가 문서 모드에서는 사용목적, 대상 장비, 안전/성능/시험/로그/보안 관련 claim을 임의로 만들지 말고 [확인 필요: ...]로 표시하세요.\n- 일반 보고서 모드에서는 핵심 주장, 근거, 표/차트/다이어그램 배치를 설계하세요.\n- 반드시 JSON 객체만 반환하세요. 마크다운 코드펜스 금지.\n\n현재 설정:\n- 문서 모드: ${profile.document_mode || "regulatory"}\n- 프로그램명: ${profile.product_name || "[확인 필요: 현재 프로그램명]"}\n- SW 버전/빌드: ${profile.software_version || "[확인 필요: SW 버전/빌드]"}\n- 대상 장비/하드웨어: ${profile.target_hardware || "[확인 필요: 대상 장비/하드웨어]"}\n- 대상 규제/기관: ${profile.target_regulator || "[확인 필요: 대상 규제/기관]"}\n- 사용 목적: ${profile.intended_use || "[확인 필요: 사용 목적]"}\n\n첨부파일 분류 힌트:\n${inventory}\n\n반환 JSON 스키마:\n{"title":"문서 아키텍처 제목","blocks":[{"id":"arch_1","type":"heading","order":0,"content":{"level":1,"text":"문서 전체 아키텍처"}},{"id":"arch_2","type":"paragraph","order":1,"content":{"text":"아키텍처 설명"}},{"id":"arch_3","type":"table","order":2,"content":{"caption":"섹션 설계","headers":["순서","상위 섹션","목적","주요 하위 내용","필요 근거","작성 상태"],"rows":[["1","개요","문서 목적 정의","제품/버전/대상","기존 문서, 사용자 입력","확인 필요"]]}},{"id":"arch_4","type":"diagram","order":3,"content":{"title":"작성 흐름","code":"입력 자료 → 섹션 설계 → 초안 작성 → 검토"}}]}\n\n반드시 포함할 블록:\n1. 문서 전체 아키텍처 요약\n2. 섹션 설계 표: 순서, 상위 섹션, 목적, 주요 하위 내용, 필요 근거, 작성 상태\n3. 첨부파일-섹션 근거 매핑 표\n4. 데이터/문서 생성 흐름 다이어그램\n5. 안전/성능/시험/보안 claim 관리 표\n6. 확인 필요 항목 표\n7. 다음 작성 단계\n\n첨부파일 추출 텍스트:\n${sourceText}`;
}

function generateLocalArchitectureDraft(files, fallbackReason = "", referenceFiles = []) {
  const profile = currentDocumentProfile();
  const inventoryRows = files.map(file => [file.filename, classifyArtifact(file), file.extension, formatBytes(file.size), file.summary || "요약 없음"]);
  const referenceRows = buildReferenceFormatRows(referenceFiles);
  const androidRows = extractAndroidEvidenceRows(files);
  const missingRows = buildMissingInfoRows(profile, files, referenceFiles);
  const sectionRows = buildArchitectureSectionRows(profile, files);
  const evidenceRows = buildArchitectureEvidenceRows(files);
  const claimRows = [
    ["사용 목적/Intended use", profile.intended_use || "[확인 필요: 기존 승인 문서 또는 사용자 확정 필요]", "기존 승인 문서, 매뉴얼", "확정 전까지 보수적으로 표시"],
    ["대상 장비/하드웨어", profile.target_hardware || "[확인 필요: 연동 장비/호환 모델]", "Android 프로젝트, 매뉴얼, 장비 사양", "모델명/통신 방식 확인"],
    ["안전/경고/제한사항", "[확인 필요: 기존 문서의 안전 문구 및 현재 안전 로직]", "기존 문서, 소스코드, 시험 노트", "임의 보강 금지"],
    ["성능/시험 결과", "[확인 필요: 검증 결과표/로그]", "시험 성적서, 테스트 노트", "수치 claim은 근거 확보 후 작성"],
    ["보안/로그/내보내기", androidRows.some(row => /로그|보안|안전/.test(row.join(" "))) ? "현재 자료에서 관련 후보 확인" : "[확인 필요: 로그/저장/내보내기/암호화 정책]", "소스코드, 운영절차, 사이버보안 문서", "인허가 제출 범위 확인"],
  ];
  const flowCode = [
    "[1] 입력 자료 분류",
    "    ├─ 기존 승인/참조 문서",
    "    ├─ 현재 Android 프로젝트 ZIP",
    "    ├─ 매뉴얼/스크린샷",
    "    └─ 시험 노트/검증 로그",
    "          ↓",
    "[2] Reference Structure 추출",
    "          ↓",
    "[3] Current Evidence Map 작성",
    "          ↓",
    "[4] Old vs Current Change Map 구성",
    "          ↓",
    "[5] Submission-ready Draft 작성",
    "          ↓",
    "[6] 확인 필요 항목/근거 파일 표 검토",
  ].join("\n");
  const title = `${profile.product_name || state.project?.title || "문서"} 전체 구성 아키텍처`;
  const blocks = [
    headingBlock(0, 1, "문서 전체 아키텍처"),
    paragraphBlock(1, `${fallbackReason ? `Gemini 아키텍처 생성 실패 사유: ${fallbackReason}\n` : ""}이 아키텍처는 최종 문서 초안을 쓰기 전에 섹션 순서, 근거 배치, 확인 필요 항목을 고정하기 위한 설계도입니다. 이후 '분석 및 초안 생성'을 실행하면 이 구조를 기준으로 본문 초안을 작성하는 흐름으로 사용할 수 있습니다.`),
    headingBlock(2, 2, "0. 참조파일 형식 기준"),
    tableBlock(3, "참조파일 형식 반영 기준", ["파일명", "형식", "크기", "반영할 형식 요소"], referenceRows.length ? referenceRows : [["참조파일 없음", "-", "-", "기본 인허가 문서 구조로 생성"]]),
    headingBlock(4, 2, "1. 섹션 설계"),
    tableBlock(5, "문서 섹션 아키텍처", ["순서", "상위 섹션", "목적", "주요 하위 내용", "필요 근거", "작성 상태"], sectionRows),
    headingBlock(6, 2, "2. 첨부파일-섹션 근거 매핑"),
    tableBlock(7, "근거 파일 매핑", ["파일명", "자료 유형", "연결할 문서 섹션", "활용 방식", "비고"], evidenceRows),
    headingBlock(8, 2, "3. 현재 Android/기능 근거 후보"),
    tableBlock(9, "현재 자료 근거 후보", ["구분", "추출 근거", "검토 포인트"], androidRows.length ? androidRows : [["현재 근거", "Android 프로젝트 ZIP 또는 매뉴얼/스크린샷 필요", "[확인 필요: 현재 화면/기능 근거]"]]),
    headingBlock(10, 2, "4. 작성 흐름"),
    { id: makeId("block"), type: "diagram", order: 11, content: { title: "문서 생성 흐름 아키텍처", code: flowCode } },
    headingBlock(12, 2, "5. Claim 관리 표"),
    tableBlock(13, "안전/성능/시험/보안 claim 관리", ["Claim 영역", "현재 표현", "필요 근거", "처리 원칙"], claimRows),
    headingBlock(14, 2, "6. 확인 필요 항목"),
    tableBlock(15, "아키텍처 단계 확인 필요 항목", ["항목", "필요 근거", "우선순위"], missingRows),
    headingBlock(16, 2, "7. 다음 작성 단계"),
    tableBlock(17, "다음 단계", ["순서", "작업", "완료 기준"], [
      ["1", "섹션 설계 검토", "불필요한 섹션 삭제 및 누락 섹션 추가"],
      ["2", "확인 필요 항목 보완", "제품명, 버전, 장비, 사용 목적, 시험 결과 근거 확보"],
      ["3", "분석 및 초안 생성 실행", "아키텍처를 참고해 제출용 문안 작성"],
      ["4", "저장 버튼으로 Gemini 보완", "문장 정리, 중복 제거, 검토 메모 분리"],
      ["5", "Word 다운로드", "검토용 DOCX 파일 생성"],
    ]),
    headingBlock(18, 2, "8. 전체 입력 자료 목록"),
    tableBlock(19, "입력 자료 인벤토리", ["파일명", "분류", "형식", "크기", "요약"], inventoryRows),
  ];
  return { title, blocks };
}

function buildArchitectureSectionRows(profile, files) {
  const regulatoryMode = (profile.document_mode || DEFAULT_DOCUMENT_MODE) !== "report";
  if (!regulatoryMode) {
    return [
      ["1", "Executive Summary", "핵심 결론 요약", "문서 목적, 주요 발견, 권고사항", "첨부 전체", "초안 가능"],
      ["2", "Source Review", "입력 자료 검토", "파일별 내용, 데이터 품질, 한계", "첨부파일", "초안 가능"],
      ["3", "Analysis", "핵심 분석 전개", "표, 차트, 비교, 해석", "XLSX/DOCX/PDF", "확인 필요"],
      ["4", "Action Plan", "후속 조치 정의", "우선순위, 담당, 일정", "사용자 검토", "확인 필요"],
      ["5", "Appendix", "근거 보존", "파일 목록, 추출 텍스트, 제한사항", "첨부 전체", "초안 가능"],
    ];
  }
  const hasReference = files.some(file => classifyArtifact(file) === "Reference regulatory document");
  const hasAndroid = files.some(file => classifyArtifact(file) === "Current Android project evidence");
  const hasManual = files.some(file => classifyArtifact(file) === "Current manual/screenshots");
  const hasTest = files.some(file => classifyArtifact(file) === "Test notes/results");
  return [
    ["1", "Intake / 입력 자료 분류", "제공 자료의 성격과 사용 범위를 정의", "참조 문서, Android 프로젝트, 매뉴얼, 시험 노트 분류", "첨부파일 전체", "초안 가능"],
    ["2", "기본 정보", "제품/프로그램 식별 정보 고정", "프로그램명, SW 버전/빌드, 장비 페어링, 대상 기관", "사용자 입력, Gradle/Manifest", profile.product_name && profile.software_version ? "초안 가능" : "확인 필요"],
    ["3", "Reference Structure", "기존 승인 문서의 구조와 공식 문구 보존", "섹션 순서, 표/그림, 안전 문구, 사용 목적", "기존 승인/참조 문서", hasReference ? "초안 가능" : "확인 필요"],
    ["4", "Current Evidence Map", "현재 앱/화면/기능 근거 정리", "Activity/Service, 권한, 통신, 로그, 화면 라벨", "Android ZIP, 매뉴얼/스크린샷", hasAndroid || hasManual ? "초안 가능" : "확인 필요"],
    ["5", "Change Map", "구버전 대비 변경점 추적", "Same, Modified, New, Removed, Unknown", "기존 문서 + 현재 근거", hasReference ? "부분 가능" : "확인 필요"],
    ["6", "Submission-ready Draft", "제출용 문안 초안 작성", "개요, 구성, 기능, 사용 절차, 제한사항", "확정된 근거", "확인 후 작성"],
    ["7", "Verification/Test Evidence", "시험/검증 근거와 claim 연결", "기능 테스트, 로그, 검증 결과, 한계", "시험 노트/결과표", hasTest ? "초안 가능" : "확인 필요"],
    ["8", "Review Notes", "불확실성 분리", "확인 필요 항목, 사용 근거 파일, 검토 메모", "첨부 전체", "초안 가능"],
  ];
}

function buildArchitectureEvidenceRows(files) {
  if (!files.length) return [["첨부파일 없음", "확인 필요", "입력 자료 분류", "파일 첨부 필요", "상"]];
  return files.map(file => {
    const type = classifyArtifact(file);
    let section = "입력 자료 분류 / 사용한 근거 파일";
    let usage = "보조 근거";
    if (type === "Reference regulatory document") {
      section = "Reference Structure / Change Map / Submission-ready Draft";
      usage = "기존 구조와 공식 문구 보존";
    } else if (type === "Current Android project evidence") {
      section = "Current Evidence Map / 기능 설명 / 보안·로그·통신 근거";
      usage = "현재 기능, 화면, 권한, 서비스, 통신 경로 확인";
    } else if (type === "Current manual/screenshots") {
      section = "사용 절차 / 화면 설명 / 사용자 표시 라벨";
      usage = "사용자에게 보이는 흐름과 용어 우선 반영";
    } else if (type === "Test notes/results") {
      section = "Verification/Test Evidence / Claim 관리";
      usage = "시험 결과와 성능·안전 claim 연결";
    }
    return [file.filename, type, section, usage, file.summary || "요약 없음"];
  });
}

async function generateDraftWithGemini(files, referenceFiles = [], analysisBundle = null) {
  const sourceText = buildGeminiSourceText(referenceFiles, files);
  const profile = currentDocumentProfile();
  const inventory = buildArtifactInventory(files, referenceFiles);
  const prompt = state.settings.document_mode === "report"
    ? buildGenericReportPrompt(sourceText)
    : buildRegulatoryPrompt(sourceText, profile, inventory, analysisBundle);

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const payload = await callGeminiJson(prompt, {
        files,
        maxImages: state.settings.document_mode === "report" ? 0 : 10,
        temperature: attempt === 1 ? 0.18 : 0.05,
        maxOutputTokens: 24576,
        retryInstruction: attempt === 1 ? "" : "재시도 지시: 이전 응답은 JSON 파싱에 실패했습니다. 설명 없이 유효한 JSON 객체만 반환하세요. 마지막 문자는 반드시 } 여야 합니다.",
      });
      const parsedDraft = payload;
      return state.settings.document_mode === "report"
        ? parsedDraft
        : ensureRegulatoryDraftQuality(parsedDraft, files, referenceFiles, "Gemini 초안이 IB-SDF 상세설계파일 기준에 미달하여 보정");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Gemini 응답 JSON 파싱에 실패했습니다.");
}

async function improveDraftWithGemini(draft) {
  const model = state.settings.gemini_model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(state.settings.gemini_api_key)}`;
  const sourceSummary = (state.project?.files || [])
    .map(file => `- ${file.filename} (${file.extension}, ${formatBytes(file.size)}): ${file.summary || "요약 없음"}`)
    .join("\n");
  const profile = currentDocumentProfile();
  const draftJson = JSON.stringify(draft).slice(0, MAX_GEMINI_INPUT_CHARS);
  const prompt = buildDraftImprovementPrompt(draftJson, profile, sourceSummary);

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: attempt === 1 ? prompt : `${prompt}\n\n재시도 지시: 이전 응답은 JSON 파싱에 실패했습니다. 설명 없이 유효한 JSON 객체만 반환하세요. 마크다운 코드펜스 금지. 마지막 문자는 반드시 } 이어야 합니다.` }] }],
        generationConfig: {
          temperature: attempt === 1 ? 0.15 : 0.05,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error?.message || `Gemini API 호출 실패: HTTP ${response.status}`;
      throw new Error(message);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n");
    if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
    try {
      return parseDraftJson(text);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Gemini 응답 JSON 파싱에 실패했습니다.");
}

function buildDraftImprovementPrompt(draftJson, profile, sourceSummary) {
  return `당신은 한국어 인허가/기술문서 편집 보조자입니다. 사용자가 화면에서 직접 수정한 현재 초안을 검토하고, 문장을 더 명확하고 제출용에 가깝게 보완하세요.\n\n핵심 규칙:\n- 반드시 JSON 객체만 반환하세요. 마크다운 코드펜스 금지.\n- 사용자가 편집한 의미, 순서, 표 구조를 최대한 보존하세요.\n- 임의로 규제/안전/성능/시험 결과를 만들지 마세요.\n- 근거가 부족한 문장은 '[확인 필요: ...]'로 표시하세요.\n- 중복 문장, 어색한 표현, 불명확한 용어를 정리하세요.\n- 제출용 문안과 검토 메모가 섞여 있으면 가능한 한 구분되게 다듬으세요.\n- 현재 초안이 문서 아키텍처이면 본문을 과도하게 확장하지 말고, 섹션 설계/근거 매핑/확인 필요 항목을 더 명확하게 보완하세요.\n- blocks 배열은 heading, paragraph, table, chart, diagram, image 타입을 사용할 수 있습니다. 단, Gemini 보완 단계에서는 기존 image 블록의 dataUrl은 절대 삭제하거나 변경하지 마세요.\n- 기존 block의 id/order가 있으면 유지하고, 필요 시 새 id는 refine_1, refine_2 형식으로 만드세요.\n\n현재 설정:\n- 문서 모드: ${profile.document_mode || "regulatory"}\n- 프로그램명: ${profile.product_name || "[확인 필요: 현재 프로그램명]"}\n- SW 버전/빌드: ${profile.software_version || "[확인 필요: SW 버전/빌드]"}\n- 대상 장비/하드웨어: ${profile.target_hardware || "[확인 필요: 대상 장비/하드웨어]"}\n- 대상 규제/기관: ${profile.target_regulator || "[확인 필요: 대상 규제/기관]"}\n- 사용 목적: ${profile.intended_use || "[확인 필요: 사용 목적]"}\n\n첨부파일 요약:\n${sourceSummary || "첨부파일 요약 없음"}\n\n반환 JSON 스키마:\n{"title":"문서 제목","blocks":[{"id":"b1","type":"heading","order":0,"content":{"level":1,"text":"제목"}},{"id":"b2","type":"paragraph","order":1,"content":{"text":"문단"}},{"id":"b3","type":"table","order":2,"content":{"caption":"표 제목","headers":["항목","내용"],"rows":[["값","값"]]}}]}\n\n현재 편집 초안 JSON:\n${draftJson}`;
}

function buildGenericReportPrompt(sourceText) {
  return `당신은 한국어 보고서 작성 보조자입니다. 아래 참조파일과 첨부파일 추출 텍스트를 바탕으로 편집 가능한 문서 초안을 만드세요.\n\n규칙:\n- 반드시 JSON만 반환하세요. 마크다운 코드펜스 금지.\n- title은 한국어 파일명/문서명으로 작성하세요.\n- 참조파일이 제공된 경우 참조파일의 목차, 문체, 표/검토 메모 형식을 우선 따라가세요. 단, 첨부파일에 없는 사실은 새로 만들지 마세요.\n- blocks는 heading, paragraph, table, chart, diagram 중 필요한 타입을 사용하세요.\n- 근거가 부족한 내용은 추측하지 말고 '[확인 필요: ...]'라고 쓰세요.\n- JSON 문자열 안에는 제어문자를 넣지 말고 줄바꿈은 \\n 으로 이스케이프하세요.\n\nJSON 스키마:\n{"title":"문서 제목","blocks":[{"id":"b1","type":"heading","order":0,"content":{"level":1,"text":"요약"}},{"id":"b2","type":"paragraph","order":1,"content":{"text":"요약 문단"}},{"id":"b3","type":"table","order":2,"content":{"caption":"핵심 항목","headers":["항목","내용"],"rows":[["예시","내용"]]}}]}\n\n참조파일 및 첨부파일 추출 텍스트:\n${sourceText}`;
}

function buildRegulatoryPrompt(sourceText, profile, inventory, analysisBundle = null) {
  const analysisJson = JSON.stringify(slimAnalysisBundle(analysisBundle), null, 2).slice(0, 50000);
  return `당신은 한국어 의료기기 소프트웨어 인허가 문서 작성자이자 S/W 상세설계파일 심사 대응 편집자입니다. 목표는 "파일 분석 요약"이 아니라, 참조 양식에 맞춘 제출 검토용 S/W 상세설계파일 초안을 작성하는 것입니다.

절대 목표:
- 최종 결과물은 IB-SDF 계열 S/W 상세설계파일이어야 합니다.
- 참조파일이 IB-SDF, S/W 상세설계파일, 소프트웨어 상세설계파일 계열이면 HWP 본문 추출이 제한되어도 반드시 IB-SDF 형식의 본문 초안을 작성하세요.
- "HWP 바이너리라 본문 추출이 제한됩니다"라는 설명만으로 2~5장을 비우면 실패입니다. 이 문구는 검토 메모와 사용 근거 파일 표에만 넣으세요.
- 첨부 ZIP 내부 화면 이미지는 "화면 증거"입니다. 각 화면을 기능 단위로 해석해서 SDD/SDS에 연결하세요.
- 이미지나 파일명에서 보이는 기능만 확정 표현하고, 확정할 수 없는 수치/성능/안전 claim은 [확인 필요: ...]로 표시하세요.

작성 깊이 기준:
- 4장 SDD는 화면별 상세설계, 상태/버튼 제어, 데이터 저장/산출물, 외부 연계, 보안 설계까지 포함해야 합니다.
- 5장 SDS는 모듈 ID, 입력, 처리 로직, 출력, 예외처리, 검증 포인트를 표로 작성해야 합니다.
- 단순 기능 목록이 아니라 "왜 이 설계가 필요한지"와 "어떤 근거 화면/파일에서 확인했는지"를 연결하세요.
- 표만 나열하지 말고 각 장 시작부에 제출용 문단을 1~3개 포함하세요.

현재 설정:
- 프로그램명: ${profile.product_name || "[확인 필요: 현재 프로그램명]"}
- SW 버전/빌드: ${profile.software_version || "[확인 필요: SW 버전/빌드]"}
- 대상 장비/하드웨어: ${profile.target_hardware || "[확인 필요: 대상 장비/하드웨어]"}
- 대상 규제/기관: ${profile.target_regulator || "[확인 필요: 대상 규제/기관]"}
- 사용 목적: ${profile.intended_use || "[확인 필요: 사용 목적]"}

첨부파일 분류 힌트:
${inventory}

1단계 근거 분석 결과 JSON:
${analysisJson || "[1단계 분석 결과 없음]"}

필수 목차:
0. 제·개정 이력표
1. 개요 (Introduction)
2. 용어정의 (Terminology and Definitions)
3. S/W 아키텍처 설계도 (Software Architecture Design Chart)
4. S/W 설계 기술서 (Software Design Description)
  4.1 Operation Part
  4.1.1 User Interface
  4.1.1.1 화면 증거 이미지 및 화면-설계 매핑
  4.1.2 System Operation
  4.1.3 데이터 저장 및 산출물
  4.2 Auto-Control Part
  4.3 Interface Board 및 외부 연계
  4.4 데이터 모델 및 산출물 상세
5. S/W 설계 명세서 (Software Design Specification)
  5.1 Software Flow Chart
  5.2 Module Design Specification
  5.3 프로파일 선택 및 편집 명세
  5.4 환자정보 관리 명세
  5.5 보고서 생성 및 내보내기 명세
  5.6 예외처리 및 검증 포인트
6. 인허가·사이버보안 설계 고려사항
7. 요구사항 추적성 매트릭스 초안
8. 첨부자료 분석 결과
부록 A. 화면 및 산출물 증거 이미지
부록 B. 제출 전 보완 체크리스트

반환 JSON 스키마:
{"title":"IBEX SW 상세설계파일 인허가 초안","blocks":[{"id":"b1","type":"heading","order":0,"content":{"level":1,"text":"제목"}},{"id":"b2","type":"paragraph","order":1,"content":{"text":"문단"}},{"id":"b3","type":"table","order":2,"content":{"caption":"표 제목","headers":["항목","내용"],"rows":[["값","값"]]}},{"id":"b4","type":"diagram","order":3,"content":{"title":"흐름도","code":"텍스트 다이어그램"}}]}

품질 실패 예시:
- Reference Structure, Current Evidence Map 같은 작업 단계 제목만 쓰고 실제 SDD/SDS 본문을 쓰지 않음
- 파일 목록만 나열하고 치료 운전, 환자정보, 프로파일, 로그, PDF 내보내기, 서버 전송, 보안 설계로 해석하지 않음
- 화면 증거 이미지와 설계 항목의 연결이 없음

참조파일 및 첨부파일 추출 텍스트:
${sourceText}`;
}

function generateLocalDraft(files, fallbackReason = "", referenceFiles = []) {
  return state.settings.document_mode === "report"
    ? generateGenericLocalDraft(files, fallbackReason, referenceFiles)
    : generateRegulatoryLocalDraft(files, fallbackReason, referenceFiles);
}

function generateGenericLocalDraft(files, fallbackReason = "", referenceFiles = []) {
  const rows = files.map(file => [file.filename, formatBytes(file.size), file.extension, file.summary || "확인 필요"]);
  const referenceRows = buildReferenceFormatRows(referenceFiles);
  const textPreview = files.map(file => `■ ${file.filename}\n${file.text.slice(0, 1200)}`).join("\n\n");
  const keywordRows = extractKeywords(files.map(file => file.text).join("\n")).map(item => [item.word, String(item.count)]);
  const blocks = [
    headingBlock(0, 1, state.project.title || "문서 분석 초안"),
    paragraphBlock(1, `${fallbackReason ? `Gemini 생성 실패 사유: ${fallbackReason}\n` : ""}총 ${files.length}개 파일을 브라우저에서 읽어 초안을 생성했습니다. 참조파일이 있으면 해당 목차·문체·표 구조를 결과물 형식 기준으로 반영합니다.`),
    headingBlock(2, 2, "참조파일 형식 반영 기준"),
    tableBlock(3, "참조파일", ["파일명", "형식", "크기", "반영할 형식 요소"], referenceRows.length ? referenceRows : [["참조파일 없음", "-", "-", "기본 보고서 구조로 생성"]]),
    headingBlock(4, 2, "첨부파일 요약"),
    tableBlock(5, "분석 대상 파일", ["파일명", "크기", "형식", "요약"], rows),
    headingBlock(6, 2, "주요 키워드"),
    tableBlock(7, "반복 출현 키워드", ["키워드", "출현 수"], keywordRows.length ? keywordRows : [["확인 필요", "0"]]),
    headingBlock(8, 2, "추출 텍스트 미리보기"),
    paragraphBlock(9, textPreview.slice(0, 5000)),
  ];
  return { title: state.project.title || "문서 분석 초안", blocks };
}

function generateRegulatoryLocalDraft(files, fallbackReason = "", referenceFiles = []) {
  const profile = currentDocumentProfile();
  const titleBase = profile.product_name || state.project?.title || "IBEX Medical Operator";
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", ".");
  const inventoryRows = files.map(file => [file.filename, classifyArtifact(file), file.extension, formatBytes(file.size), file.summary || "요약 없음"]);
  const referenceRows = buildReferenceFormatRows(referenceFiles);
  const evidenceRows = buildCurrentEvidenceRows(files);
  const zipRows = buildZipEvidenceRows(files);
  const missingRows = buildMissingInfoRows(profile, files, referenceFiles);
  const hwpLimited = referenceFiles.some(file => /\.hwp$/i.test(file.extension || file.filename || ""));
  const blocks = [];
  let order = 0;
  const add = block => blocks.push({ ...block, order: order++ });

  add(headingBlock(0, 1, `IB-SDF-01 | S/W 상세설계파일 | ${titleBase} | Rev.00`));
  add(tableBlock(0, "문서 기본 정보", ["항목", "내용"], [
    ["문서번호", "IB-SDF-01 [확인 필요]"],
    ["문서명", "S/W 상세설계파일"],
    ["제품명", profile.target_hardware || "1인용 고압산소챔버 [확인 필요]"],
    ["소프트웨어 형명", titleBase],
    ["SW 버전/빌드", profile.software_version || "[확인 필요: SW 버전/빌드]"],
    ["작성 기준", "첨부 참조 문서, ZIP 내부 화면/보고서/운영로그/소스 근거"],
    ["제정일", `${today} [초안]`],
    ["개정번호", "0"],
  ]));
  add(paragraphBlock(0, `본 문서는 기존 IB-SDF 계열 S/W 상세설계파일 양식을 기준으로, 첨부 ZIP 내부의 화면 캡처, 치료 상세 보고서, 운영로그, 영상 또는 Android 프로젝트 자료를 분석하여 작성한 인허가 검토용 초안이다. 최종 제출 전 제품명, 모델명, 소프트웨어 형명/버전, SRS, 위험관리파일, 검증시험 결과와의 추적성 검토가 필요하다.${hwpLimited ? " 참조 HWP는 브라우저 환경에서 본문 추출이 제한되므로, 본 초안은 파일명에서 확인되는 IB-SDF 구조와 첨부 근거를 조합하여 작성했다." : ""}${fallbackReason ? `\n\nGemini 생성 보정 사유: ${fallbackReason}` : ""}`));

  add(headingBlock(0, 2, "목차"));
  add(tableBlock(0, "목차", ["항목", "내용"], [
    ["0", "제·개정 이력표"],
    ["1", "개요 (Introduction)"],
    ["2", "용어정의 (Terminology and Definitions)"],
    ["3", "S/W 아키텍처 설계도 (Software Architecture Design Chart)"],
    ["4", "S/W 설계 기술서 (Software Design Description)"],
    ["5", "S/W 설계 명세서 (Software Design Specification)"],
    ["6", "인허가·사이버보안 설계 고려사항"],
    ["7", "요구사항 추적성 매트릭스 초안"],
    ["8", "첨부자료 분석 결과"],
    ["부록", "제출 전 보완 체크리스트"],
  ]));

  add(headingBlock(0, 2, "0. 제·개정 이력표"));
  add(tableBlock(0, "제·개정 이력", ["제·개정번호", "제·개정 페이지", "제·개정일", "제·개정 이력 사항"], [
    ["0", "전체", `${today}`, "첨부 참조문서 및 현재 ZIP 근거를 기반으로 S/W 상세설계파일 인허가 초안 작성"],
    ["1", "-", "-", "[추후] SRS, 위험관리, 검증시험 결과 반영 시 개정"],
  ]));

  add(headingBlock(0, 2, "1. 개요 (Introduction)"));
  add(headingBlock(0, 3, "1.1 목적"));
  add(paragraphBlock(0, `본 문서는 ${titleBase} 소프트웨어의 상세설계 내용을 문서화하여, 소프트웨어 기능의 안전성, 유효성, 추적성 및 인허가 심사 대응성을 확보하기 위한 것이다. 특히 치료 프로파일 선택/편집, 환자정보 관리, 치료 운전, 치료이력 조회, 운영로그 조회, PDF 보고서 생성 및 외부 반출, 중앙 서버 전송 기능에 대한 설계 근거를 정리한다.`));
  add(headingBlock(0, 3, "1.2 적용범위"));
  add(tableBlock(0, "적용범위", ["항목", "내용"], [
    ["제품명", profile.target_hardware || "1인용 고압산소챔버 [확인 필요]"],
    ["모델명", "IBEX Light / IBEX Medical System 계열 [확인 필요]"],
    ["소프트웨어 형명", titleBase],
    ["대상 기능", "로그인, 환자번호 입력/등록, 프로파일 선택/편집, 치료 운전, ABT/환경정보 표시, 치료기록 조회, 운영로그 조회, PDF 미리보기/내보내기, 중앙 서버 전송"],
    ["제외 범위", "하드웨어 회로 상세, 센서 보정 시험 원자료, 서버 내부 구현 세부, 외부 EMR 연계 세부 규격은 별도 문서에서 관리"],
  ]));
  add(headingBlock(0, 3, "1.3 개발 목표 및 수행인원"));
  add(paragraphBlock(0, "본 소프트웨어의 개발 목표는 챔버 운용자가 치료 프로파일에 따라 치료를 안전하게 시작, 일시정지, 재개, 종료 및 완료하고, 치료 과정에서 발생하는 압력·산소농도·이벤트 데이터를 기록하며, 치료 완료 후 인허가 및 품질관리 목적으로 추적 가능한 보고서를 생성할 수 있도록 하는 것이다."));
  add(tableBlock(0, "역할 및 책임", ["역할", "담당자", "주요 책임"], [
    ["대표이사/연구소장", "[확인 필요]", "개발 총괄 승인 및 자원 배정"],
    ["품질책임자", "[확인 필요]", "문서 검토, 품질시스템 적합성 확인"],
    ["연구개발팀", "[확인 필요]", "앱/서버/챔버 제어 연동 설계 및 구현"],
    ["RA/인허가", "[확인 필요]", "제출 문서 구조 검토 및 규격/고시 적합성 확인"],
    ["생산/서비스", "[확인 필요]", "현장 설치, 유지보수, 로그 회수 절차 검토"],
  ]));

  add(headingBlock(0, 2, "2. 용어정의 (Terminology and Definitions)"));
  add(tableBlock(0, "용어정의", ["용어", "정의"], [
    ["S/W 아키텍처 설계도", "하드웨어, 서버, 데이터 저장소, 사용자 인터페이스 및 주요 소프트웨어 모듈 간 관계와 데이터 흐름을 나타낸 설계도이다."],
    ["S/W 설계 기술서(SDD)", "요구사항을 만족시키기 위해 소프트웨어가 어떤 구성요소와 인터페이스로 구성되는지 설명하는 문서이다."],
    ["S/W 설계 명세서(SDS)", "요구사항을 실제 구현 단위로 어떻게 실현하는지 모듈, 흐름, 입력/출력, 예외처리 관점에서 정의한 문서이다."],
    ["HBOT", "Hyperbaric Oxygen Therapy. 고압산소치료를 의미한다."],
    ["ATA", "Absolute Atmosphere. 치료 압력 표시 단위로 사용된다."],
    ["Treatment Profile", "치료 압력과 시간 구간을 정의한 치료 운전 시나리오이다."],
    ["Treatment Records", "치료 세션의 환자, 프로파일, 시간, 최대압력, 그래프 및 결과 정보를 조회하는 기능이다."],
    ["Operation Logs", "장비 운용 이력을 기간·필터 조건으로 조회하고 품질 기록으로 출력하는 기능이다."],
    ["PDF Export", "치료 상세 보고서 또는 운영로그를 외부 반출 가능한 PDF 파일로 생성하는 기능이다."],
    ["Room DB", "Android 로컬 데이터베이스 계층으로 치료 세션, 환자, 운영로그 등의 영속 데이터를 저장한다."],
    ["WebSocket", "챔버 상태, 센서 데이터, 치료 단계 등 실시간 데이터를 수신하기 위한 통신 방식이다."],
    ["REST API", "치료 생성, 일시정지, 재개, 종료, 서버 전송 등 명령/조회에 사용되는 HTTP 기반 인터페이스이다."],
  ]));

  add(headingBlock(0, 2, "3. S/W 아키텍처 설계도 (Software Architecture Design Chart)"));
  add(paragraphBlock(0, `${titleBase}는 사용자 조작 UI, 치료 운용 로직, 로컬 데이터 저장소, 보고서 생성부, 네트워크 통신부 및 챔버 제어/센서 인터페이스로 구성된다. 첨부 자료 기준으로 로그인, 환자번호 입력, 프로파일 선택/편집, 치료 운전, 치료기록, 운영로그, 보고서 미리보기/내보내기 기능을 주요 소프트웨어 구성요소로 정의한다.`));
  add({ id: makeId("block"), type: "diagram", content: { title: "S/W 아키텍처 설계도", code: [
    "사용자/운영자",
    "  ↓ 터치 입력",
    "User Interface Layer",
    "  ↓ 화면 이벤트/검증",
    "Application Logic Layer",
    "  ├─ Profile / Patient / Run / Log / Report Modules",
    "  ├─ Data Layer(Room DB, 내부 파일, 설정 저장소)",
    "  ├─ Report Export Layer(PDF 미리보기/내보내기)",
    "  └─ Network Layer(REST API, WebSocket)",
    "        ↓",
    "중앙 서버 / 챔버 제어부 / 센서 데이터"
  ].join("\n") } });
  add(tableBlock(0, "주요 구성요소", ["구성요소", "설계 책임", "입력", "출력/산출물"], [
    ["User Interface Layer", "로그인, 환자 입력, 프로파일 선택/편집, 치료 운전, 로그 조회 화면 제공", "터치 입력, 사용자 확인/취소", "화면 표시, 사용자 명령"],
    ["Application Logic Layer", "치료 상태 전이, 프로파일 검증, 버튼 활성/비활성, 오류 처리", "UI 명령, 센서/서버 이벤트", "치료 명령, 알림, 데이터 저장 요청"],
    ["Data Layer", "치료 세션, 환자정보, 운영로그, 상세 로그 파일 저장", "치료 결과, 환자정보, 이벤트", "Room DB 레코드, 내부 파일"],
    ["Report Export Layer", "치료 상세 보고서 및 운영로그 PDF 생성", "DB 데이터, Raw Log, 차트 데이터", "PDF 파일, 미리보기 화면"],
    ["Network Layer", "중앙 서버 및 챔버 상태 통신", "REST 요청, WebSocket 데이터", "서버 응답, 실시간 센서/상태 데이터"],
    ["Device/Controller Interface", "압력/산소/환경/ABT 데이터 수신 및 제어 명령 전달", "센서 데이터, 제어 명령", "실제 치료 상태, 안전 이벤트"],
  ]));
  add({ id: makeId("block"), type: "diagram", content: { title: "치료 운용 상태 전이", code: "환자 확인 → 프로파일 선택 → 시작 대기 → 치료 시작 → 가압/유지/감압 → 일시정지/재개 또는 종료 → 완료 → 로그 저장 → 보고서 조회/내보내기" } });
  add({ id: makeId("block"), type: "diagram", content: { title: "로그 및 보고서 산출 흐름", code: "센서/상태 이벤트 → 세션 Raw Log 저장 → Room DB 요약 저장 → 치료기록/운영로그 조회 → PDF 미리보기 → PDF Export/중앙 서버 전송" } });

  add(headingBlock(0, 2, "4. S/W 설계 기술서 (Software Design Description)"));
  add(headingBlock(0, 3, "4.1 Operation Part"));
  add(headingBlock(0, 3, "4.1.1 User Interface"));
  add(tableBlock(0, "화면별 설계 기술", ["화면", "주요 기능", "인허가 관점 설계 포인트"], [
    ["로그인 화면", "운영 소프트웨어 접근 시작, 제품/브랜드 표시", "비인가 접근 방지 방식, 관리자/운영자 권한 분리 여부 확인 필요"],
    ["환자번호 입력", "환자번호 입력, 등록/확인, 초기화, 닫기", "환자식별정보 입력 검증, 중복/미등록 환자 처리, 입력 길이 제한 정의 필요"],
    ["프로파일 선택", "저장된 치료 프로파일 표시, 편집 진입, 선택 후 다음 단계 이동", "치료 전 프로파일명, 총 시간, 압력 구간, 상승률 제한 검증 필요"],
    ["프로파일 에디터", "구간별 시간/압력 수정, ABT/Monitor/Curve 옵션 선택, 저장/완료", "저장 전 마지막 압력, 총 시간, 압력 상승률, 최대압력 제한 검증 필요"],
    ["치료 운전 화면", "그래프, 장비 압력/설정압력 게이지, 환경정보, ABT 표시, 종료/일시정지/시작", "치료 중 오조작 방지, 일시정지 중 제한된 변경, 종료 확인, 실시간 상태 표시 정확성 필요"],
    ["치료기록 화면", "차트, 환자 목록, 세션 목록, 통계 표시, 상세 보기/삭제", "품질기록 보존, 환자정보 표시 범위, 삭제권한, 필터 조건 추적 필요"],
    ["운영로그 화면", "기간/필터 선택, 운영로그 목록, PDF 내보내기", "운영이력의 완전성, 필터 조건 기록, PDF 생성 시 생성일자/조건 표시 필요"],
    ["보고서 미리보기", "HBOT Treatment Report 미리보기, PDF 내보내기", "외부 반출 전 환자정보 포함 여부 고지, 저장 위치, 파일명 규칙, 무결성 관리 필요"],
  ]));
  add(tableBlock(0, "UI 화면별 상세 설계 명세", ["설계 ID", "화면/기능", "주요 컴포넌트", "입력 데이터", "처리 로직", "출력/저장", "예외처리"], [
    ["SDD-UI-001", "로그인/시작 화면", "제품 로고, 시작/로그인 버튼, 배경 영상 또는 이미지", "사용자 터치", "앱 구동 상태 확인 후 환자 입력 또는 홈 화면으로 전환", "로그인 상태, 다음 화면", "권한 미확인, 서버 미연결, 중복 클릭 차단"],
    ["SDD-UI-002", "환자번호 입력", "숫자 키패드, 입력창, 등록/확인/초기화/닫기 버튼", "환자번호", "길이 제한 및 기존 환자 조회, 미등록 시 등록 유도", "선택 환자 정보, 세션 준비 상태", "미입력, 미등록, 중복 번호, 조회 실패"],
    ["SDD-UI-003", "환자 등록/수정/삭제", "이름, 번호, 성별, 나이, 비고, 저장/삭제 버튼", "환자 식별정보", "필수값 검증 후 로컬 DB 저장 또는 갱신", "Patient 레코드", "필수값 누락, 삭제 확인, 치료기록 연결 환자 삭제 정책"],
    ["SDD-UI-004", "프로파일 선택", "프로파일 카드, 차트, 총 시간, 최대 압력, 편집 버튼", "프로파일 선택 이벤트", "프로파일 데이터 로드 및 그래프 렌더링", "선택 프로파일 ID/명칭", "손상된 프로파일, 빈 프로파일, 최대압력 초과"],
    ["SDD-UI-005", "프로파일 편집", "구간 목록, 시간/압력 입력, ABT/Monitor/Curve 옵션, 저장 버튼", "구간별 시간/압력/옵션", "상승률·최대압력·종료압력 검증 후 저장", "Profile 레코드", "상승률 초과, 마지막 압력 미복귀, 이름 중복"],
    ["SDD-UI-006", "치료 운전", "압력 차트, 설정/실측 게이지, 환경정보, ABT, 시작/일시정지/종료 버튼", "센서 데이터, 단계 상태, 사용자 명령", "상태별 버튼 제어 및 실시간 차트 갱신", "세션 상태, 이벤트 로그", "통신 끊김, 센서 이상, 명령 실패, 안전압력 미도달"],
    ["SDD-UI-007", "치료기록", "환자 목록, 세션 목록, 차트, 통계, 상세/삭제/내보내기 버튼", "검색/필터, 세션 선택", "DB 조회 및 차트/통계 재구성", "치료 상세 화면, PDF 생성 입력", "로그 누락, 환자정보 불일치, 삭제 권한"],
    ["SDD-UI-008", "운영로그", "기간 필터, 최소 시간 조건, 로그 목록, PDF 내보내기", "날짜 범위, 필터 조건", "조건별 Operation Log 조회", "운영로그 PDF", "대용량 조회 성능, 필터 조건 누락, 페이지 분할"],
  ]));
  const evidenceImagesForBody = collectEvidenceImages(files).slice(0, Math.min(6, ZIP_MAX_MEDIA_ASSETS));
  if (evidenceImagesForBody.length) {
    add(headingBlock(0, 3, "4.1.1.1 화면 증거 이미지"));
    add(paragraphBlock(0, "첨부 ZIP 내부의 대표 화면 이미지를 설계 근거로 삽입하였다. 이미지는 화면 라벨, 버튼, 차트, 보고서 미리보기 등 사용자 인터페이스 요구사항과 SDD/SDS 항목의 확인 근거로 사용한다."));
    add(tableBlock(0, "화면 이미지-설계 항목 매핑", ["번호", "캡션", "출처", "분류", "원본/추출 크기"], buildEvidenceImageRows(files).slice(0, 6)));
    evidenceImagesForBody.forEach((asset, index) => add(imageBlockFromAsset(asset, index)));
  }
  add(headingBlock(0, 3, "4.1.2 System Operation"));
  add(tableBlock(0, "System Operation", ["Function", "Description"], [
    ["Login / Start", "운용 프로그램 접근 시작. 로그인 이후 환자번호 입력 또는 치료 시작 화면으로 진입한다."],
    ["Patient Management", "환자번호 입력, 환자 등록, 환자정보 수정, 환자 삭제 기능을 제공한다."],
    ["Profile Select", "저장된 치료 프로파일 목록을 제공하고, 선택된 프로파일의 그래프와 구간 정보를 표시한다."],
    ["Profile Editor", "구간별 시간 및 압력을 편집하고, ABT/Monitor/Curve 옵션 등을 설정하여 치료 프로파일을 생성 또는 수정한다."],
    ["Run", "선택된 프로파일에 따라 치료 운전을 시작하고, 압력/시간/환경정보/ABT 상태를 표시한다. 일시정지, 재시작, 종료, 치료완료 상태를 처리한다."],
    ["Treatment Records", "치료 세션 목록, 환자 목록, 그래프 및 통계 정보를 조회하고 상세 보고서로 연결한다."],
    ["Operation Logs", "장비 운용 이력을 기간/조건별로 조회하고 운영로그 PDF로 출력한다."],
    ["Report Export", "치료 상세 보고서와 운영로그 보고서를 PDF로 미리보기 및 다운로드 폴더에 생성한다."],
    ["Server Transfer", "치료 완료 시 중앙 서버로 치료 데이터를 전송한다. 전송 실패 시 재시도/오프라인 보관 정책 정의가 필요하다."],
  ]));
  add(headingBlock(0, 3, "4.1.3 데이터 저장 및 산출물"));
  add(tableBlock(0, "데이터 저장 및 산출물", ["데이터", "저장 위치/형태", "보존·보안 고려사항"], [
    ["치료 세션 요약", "Room DB: 세션 ID, 프로파일명, 총 시간, 최대압력, 환자정보 참조, 생성일시", "환자와 세션의 추적성 유지. 삭제 시 감사 이력 또는 삭제 정책 필요"],
    ["치료 상세 Raw Log", "앱 내부 저장소 파일: 세션 상세 JSON/TXT 로그", "원본 데이터 무결성 보존, PDF와 Raw Log 간 불일치 방지 필요"],
    ["환자정보", "Room DB 또는 설정 저장소: 환자번호, 이름, 성별, 나이, 비고", "개인정보 보호, 권한 없는 조회/삭제 방지, 백업/복구 정책 필요"],
    ["운영로그", "Room DB: 운용 이벤트, 날짜, 세션/장비 정보", "품질 기록으로 보존기간, 삭제 권한, 내보내기 조건 정의 필요"],
    ["치료 상세 보고서 PDF", "Downloads 폴더 또는 사용자가 선택한 외부 저장 위치", "환자정보 포함 가능. 반출 전 고지, 파일명 규칙, 접근권한 통제 필요"],
    ["운영로그 PDF", "Downloads 폴더 또는 사용자가 선택한 외부 저장 위치", "필터 조건, 생성일자, 총 건수 포함. 개인정보 포함 여부 확인 필요"],
  ]));
  add(headingBlock(0, 3, "4.2 Auto-Control Part"));
  add(paragraphBlock(0, "치료 운전 화면은 프로파일 그래프와 실제 압력/설정 압력 표시를 포함한다. 소프트웨어는 치료 시간, 장비 압력, 설정 압력, 환경 데이터, ABT 상태를 실시간 표시하고, 치료 중 종료·일시정지·시작/재시작 명령을 제공한다. 실제 챔버 제어 알고리즘의 PID 계수 및 안전제어는 하드웨어 제어부/서버 연동 문서와 교차검토가 필요하다."));
  add(tableBlock(0, "Auto-Control 설계 항목", ["항목", "설계 내용", "검증 포인트"], [
    ["프로파일 SP 표시", "치료 시간에 따른 목표 압력 곡선을 표시한다.", "화면 그래프와 실제 명령 프로파일 간 일치성 시험"],
    ["센서 PV 표시", "장비 압력 또는 측정 압력을 게이지와 차트로 표시한다.", "센서 입력값 보정, 표시 지연, 단위 변환 검증"],
    ["상태 전이", "가압, 유지, 감압, 완료, 일시정지 상태를 표시한다.", "상태별 버튼 활성/비활성 및 예외처리 검증"],
    ["일시정지/재개", "치료 중 일시정지 및 재개 기능을 제공한다.", "일시정지 중 압력 유지/변경 가능 범위, 서버 명령 성공 여부 검증"],
    ["강제 종료/치료 완료", "종료 확인 후 치료를 종료하고 완료 화면으로 전환한다.", "안전 압력 도달 전 완료 전환 방지, 로그 저장 완료 조건 검증"],
    ["ABT/환경정보", "ABT 좌/우 그래프, 온도/습도/O₂/CO₂ 등 환경값을 표시한다.", "센서 채널별 정상/비정상 표시, 알람 처리 검증"],
  ]));
  add(tableBlock(0, "치료 상태 및 버튼 제어 상세", ["상태", "허용 동작", "제한 동작", "저장/로그", "검증 포인트"], [
    ["시작 대기", "프로파일 선택, 환자 변경, 치료 시작", "치료기록 확정 저장", "시작 전 설정값", "환자/프로파일 미선택 시 시작 제한"],
    ["가압/유지/감압", "일시정지, 종료 요청, 상태 모니터링", "프로파일 구조 변경, 환자 변경", "센서값, 단계 이벤트", "실측 압력·목표 압력·상태 표시 일치성"],
    ["일시정지", "재개, 제한된 압력 조정, 산소교체 등 보조 작업", "세션 종료 없는 화면 이탈", "일시정지/재개 시각", "중복 명령 방지, 재개 실패 처리"],
    ["종료 요청", "종료 확인, 안전 감압 진행", "즉시 완료 처리", "종료 사유/시각", "안전압력 도달 전 완료 전환 방지"],
    ["완료", "로그 저장, 보고서 조회/내보내기, 서버 전송", "치료 제어 명령", "세션 요약, Raw Log, PDF", "DB 저장 완료와 보고서 내용 일치성"],
    ["통신 장애", "재연결, 사용자 알림, 로컬 보관", "확인 없는 데이터 폐기", "장애 이벤트", "재시도/오프라인 큐/중복 업로드 방지"],
  ]));
  add(headingBlock(0, 3, "4.3 Interface Board 및 외부 연계"));
  add(tableBlock(0, "외부 연계", ["연계 대상", "방식", "주요 데이터", "비고"], [
    ["챔버 제어부", "REST API / WebSocket / 내부 제어 프로토콜 [확인 필요]", "치료 시작/중지/일시정지/재개, 목표 압력, 상태 이벤트", "실제 프로토콜 명세서 필요"],
    ["센서 데이터", "WebSocket 또는 제어부 폴링 [확인 필요]", "압력, 산소농도, 온도, 습도, CO₂, ABT", "샘플링 주기/단위/정확도 확인 필요"],
    ["중앙 서버", "HTTPS REST API [확인 필요]", "치료 세션, 치료 상세 로그, 장비 식별정보", "TLS, 인증, 재전송 정책 필요"],
    ["로컬 저장소", "Room DB / 내부 파일 / SharedPreferences", "프로파일, 환자, 세션, 운영로그, 설정값", "백업/삭제/마이그레이션 정책 필요"],
  ]));

  add(headingBlock(0, 3, "4.4 데이터 모델 및 산출물 상세"));
  add(tableBlock(0, "데이터 모델 상세 초안", ["데이터 객체", "주요 필드", "생성/수정 시점", "사용 화면", "보안·무결성 고려사항"], [
    ["Patient", "patientId, patientName, gender, age, remark", "환자 등록/수정", "환자번호 입력, 치료기록", "개인정보 최소수집, 삭제/수정 권한, 세션 연결 정책"],
    ["Profile", "profileId, profileName, totalTime, pressure/time sections, options", "프로파일 저장/수정", "프로파일 선택/편집, 치료 운전", "상승률·최대압력·종료압력 검증, 변경 이력"],
    ["TreatmentSession", "sessionId, patientId, profileId, start/end time, duration, maxPressure, result", "치료 시작/완료", "치료 운전, 치료기록, 보고서", "세션 ID 유일성, 저장 완료 전 완료 화면 전환 방지"],
    ["RawDetailLog", "timestamp, pressure, oxygen, state, event, sensor values", "치료 중 주기 저장", "보고서, 차트, 이벤트 로그", "원본 보존, PDF와 원자료 추적성, 손상 감지"],
    ["OperationLog", "timestamp, action, profile, patient, result, operator/device", "운영 이벤트 발생 시", "운영로그 화면, 운영로그 PDF", "감사추적, 필터 조건 기록, 삭제 권한"],
    ["ReportFile", "reportId, sessionId, createdAt, fileName, filter, appVersion", "PDF 내보내기", "보고서 미리보기/다운로드", "환자정보 포함 고지, 파일명 규칙, 해시/무결성 검토"],
  ]));
  add(headingBlock(0, 2, "5. S/W 설계 명세서 (Software Design Specification)"));
  add(headingBlock(0, 3, "5.1 Software Flow Chart"));
  add(paragraphBlock(0, "소프트웨어의 기본 운용 흐름은 로그인, 환자 확인, 프로파일 선택, 치료 시작, 치료 운전, 치료 완료, 치료기록 저장, 보고서 확인/내보내기 순서로 구성된다."));
  add({ id: makeId("block"), type: "diagram", content: { title: "Software Flow Chart", code: "앱 실행 → 로그인 → 환자번호 입력/조회 → 프로파일 선택/편집 → 치료 시작 → 실시간 상태 표시 → 일시정지/재개/종료 → 치료 완료 → 세션 저장 → 치료기록/운영로그 조회 → PDF 내보내기" } });
  add(headingBlock(0, 3, "5.2 Module Design Specification"));
  add(tableBlock(0, "Module Design Specification", ["ID", "모듈", "설계 명세", "입력", "출력", "예외/검증"], [
    ["SDS-UI-001", "Login 화면", "앱 시작 시 브랜드 화면과 로그인 버튼 표시", "앱 실행 이벤트", "로그인/환자 입력 진입", "로그인 실패, 권한 미확인 시 진입 제한 [정책 확인 필요]"],
    ["SDS-UI-002", "환자번호 입력", "숫자 키패드로 환자번호 입력, 등록/확인/닫기 처리", "터치 입력, 환자번호", "환자 조회 결과, 신규등록 진입", "최대 길이, 미등록 환자, 중복 환자 처리"],
    ["SDS-UI-003", "환자 등록/수정/삭제", "환자명, 번호, 성별, 나이, 비고 입력 및 수정/삭제", "환자정보 입력", "환자 DB 레코드", "필수값 누락, 중복번호, 삭제 확인"],
    ["SDS-PF-001", "프로파일 선택", "프로파일 목록과 그래프, 총 시간, 최대압력 표시", "프로파일 DB", "선택된 프로파일", "프로파일 누락/손상 시 선택 제한"],
    ["SDS-PF-002", "프로파일 편집", "구간별 시간/압력 및 옵션 수정", "사용자 입력", "저장된 프로파일", "최대압력, 상승률, 마지막 압력, 총 시간 검증"],
    ["SDS-RUN-001", "치료 시작", "선택 프로파일과 환자를 세션으로 연결하여 시작 명령 수행", "프로파일, 환자, 장비 상태", "치료 세션 ID, 시작 상태", "서버/장비 응답 실패, 안전상태 불만족"],
    ["SDS-RUN-002", "치료 운전 표시", "목표/실제 압력 그래프, 게이지, 치료시간, 환경정보 표시", "센서/상태 데이터", "실시간 화면 갱신", "통신 끊김, 센서값 이상, 단위 변환 오류"],
    ["SDS-RUN-003", "일시정지/재개", "치료 중 일시정지 및 재개 명령 수행", "버튼 입력", "치료 상태 변경", "중복 클릭 방지, 명령 실패 시 롤백/알림"],
    ["SDS-RUN-004", "종료/완료", "종료 확인 후 안전 종료 또는 프로파일 완료 처리", "종료 입력, 완료 이벤트", "완료 화면, 로그 저장", "안전 압력 도달 전 완료 전환 방지"],
    ["SDS-LOG-001", "치료기록 조회", "세션 목록, 차트, 환자 목록, 통계 표시", "DB 조회 조건", "치료기록 화면", "필터 조건 없음, 환자정보 누락 처리"],
    ["SDS-LOG-002", "운영로그 조회", "운영 이력 목록 조회 및 기간/조건 필터", "날짜/필터 입력", "운영로그 목록", "대용량 로그 성능, 최소 시간 필터"],
    ["SDS-REP-001", "치료 상세 보고서", "세션 상세를 HBOT Treatment Report로 표시/내보내기", "세션/환자/차트/이벤트", "PDF 보고서", "환자정보 보호, 차트/이벤트 누락 방지"],
    ["SDS-REP-002", "운영로그 보고서", "운영로그 조건별 PDF 출력", "로그 목록, 필터조건", "Operation Logs PDF", "생성일자/필터/건수 표시"],
    ["SDS-NET-001", "중앙 서버 전송", "치료 완료 후 서버로 치료 데이터를 전송", "세션 데이터, Raw Log", "서버 저장 결과", "전송 실패 재시도/오프라인 큐 필요"],
  ]));
  add(headingBlock(0, 3, "5.3 프로파일 선택 및 편집 명세"));
  add(tableBlock(0, "프로파일 검증 항목", ["검증 항목", "설계 기준 초안", "불합격 시 처리"], [
    ["프로파일명", "공백 불가, 중복명 저장 시 덮어쓰기 확인 또는 저장 제한", "사용자에게 오류 메시지 표시"],
    ["구간 시간", "0보다 큰 분 단위 값, 총 치료시간 상한 적용 [확인 필요]", "저장 제한"],
    ["압력 범위", "최소 1.00 ATA, 최대 설정압력 이하 [상한 확인 필요]", "저장 제한"],
    ["압력 상승률", "구간 간 압력 변화율 제한. 기존 계열 문서 기준 0.25 ATA/min 이하 검토 가능", "저장 제한 및 수정 안내"],
    ["마지막 압력", "치료 종료 시 1.00 ATA 또는 안전완료 압력 범위로 복귀", "저장 제한 또는 자동 보정"],
    ["옵션", "ABT / Monitor / Curve 옵션 저장", "옵션별 호환성 확인"],
  ]));
  add(headingBlock(0, 3, "5.4 환자정보 관리 명세"));
  add(tableBlock(0, "환자정보 관리", ["기능", "입력값", "저장값", "주요 예외처리"], [
    ["환자번호 입력", "숫자 입력", "환자번호", "미입력, 길이 초과, 미등록 환자"],
    ["환자 등록", "이름, 환자번호, 성별, 나이, 비고", "Patient 레코드", "필수값 누락, 중복 환자번호"],
    ["환자 수정", "기존 환자정보 변경", "변경된 Patient 레코드", "수정 권한, 환자번호 변경 제한 여부"],
    ["환자 삭제", "삭제 대상 환자", "삭제 또는 비활성화 상태", "연결된 치료 세션 존재 시 삭제 정책"],
  ]));
  add(headingBlock(0, 3, "5.5 보고서 생성 및 내보내기 명세"));
  add(tableBlock(0, "보고서 생성 및 내보내기", ["보고서", "포함 데이터", "생성 시점", "검증 포인트"], [
    ["HBOT Treatment Report", "환자명, 환자번호, 성별, 나이, 날짜/시간, 챔버, 프로파일, Duration, Pressure Profile, O₂ Concentration, Event Log", "치료기록 상세 미리보기 또는 내보내기 버튼 입력 시", "DB 데이터와 차트/이벤트 로그의 일치성, 환자정보 표시 정책"],
    ["Operation Logs Report", "생성일시, 필터, 최소 시간 조건, Count, 날짜, 프로파일, 시간, 최대 실제압력, 환자, 환자번호", "운영로그 화면 내보내기 버튼 입력 시", "필터 조건과 출력 목록의 일치성, 페이지 번호, 개인정보 포함 여부"],
  ]));
  add(tableBlock(0, "PDF 산출물 필드 매핑 상세", ["보고서 필드", "데이터 출처", "생성 로직", "검증 기준", "보완 필요"], [
    ["환자정보", "Patient DB / 현재 세션 환자 참조", "선택 환자와 세션을 연결하여 표시", "화면/DB/PDF의 환자번호 일치", "마스킹/권한 정책"],
    ["치료 기본정보", "TreatmentSession", "시작/종료시각, Duration, Chamber, Profile 표시", "세션 요약과 PDF 일치", "장비 식별정보 확정"],
    ["Pressure Profile", "RawDetailLog + Profile", "목표압력과 실측압력을 차트로 렌더링", "원자료 대비 차트 누락 없음", "샘플링 주기 명시"],
    ["O₂ Concentration", "센서 로그", "산소농도 시계열 그래프 생성", "단위/스케일/결측 처리 검증", "센서 보정 근거"],
    ["Event Log", "치료 상태 이벤트/사용자 조작 로그", "시각순 이벤트 목록 출력", "일시정지/재개/종료 이벤트 반영", "이벤트 코드 정의"],
    ["운영로그 필터", "사용자 선택 날짜/최소시간/검색 조건", "PDF 상단에 생성일시와 조건 표시", "화면 목록 건수와 PDF Count 일치", "필터 조건 저장 정책"],
    ["파일명/출력일", "앱 생성 로직", "보고서 종류+세션ID 또는 생성시각 기반 파일명", "중복 파일명 방지", "해시/전자서명 여부"],
  ]));

  add(headingBlock(0, 2, "6. 인허가·사이버보안 설계 고려사항"));
  add(paragraphBlock(0, "본 소프트웨어는 환자정보, 치료이력, 운영로그 및 PDF 외부 반출 기능을 포함하므로, 인허가 제출 시 소프트웨어 안전성뿐 아니라 개인정보 보호, 로그 무결성, 접근통제, 전송보안, 저장보안, 백업/삭제 정책을 함께 설명해야 한다."));
  add(tableBlock(0, "사이버보안 설계 고려사항", ["항목", "현재 확인사항", "문서화/보완 필요사항"], [
    ["접근통제", "로그인 화면은 확인되나 사용자 계정/권한 체계는 첨부자료만으로 불명확하다.", "관리자/운영자 권한 구분, 삭제/내보내기 권한 제한, 자동 로그아웃 정책 정의"],
    ["환자정보 보호", "환자명/환자번호가 화면 및 PDF에 표시될 수 있다.", "PDF 생성 전 개인정보 포함 고지, 최소 표시 원칙, 마스킹 옵션 검토"],
    ["전송보안", "치료 완료 후 중앙 서버 전송 기능이 요구된다.", "HTTPS/TLS, 서버 인증서 검증, API 인증 토큰, 재전송 큐, 실패 로그 필요"],
    ["저장보안", "Room DB, 내부 Raw Log, Downloads PDF로 데이터가 저장될 수 있다.", "내부 저장소 접근 제한, 외부 PDF 반출 통제, 민감정보 암호화 여부 검토"],
    ["무결성", "PDF 보고서가 품질기록으로 사용될 수 있다.", "원본 Raw Log와 PDF의 세션 ID/출력일자/해시 또는 무결성 확인정보 연계 검토"],
    ["감사추적", "환자정보 수정/삭제, 프로파일 수정/삭제, 로그 삭제가 가능하다.", "수정/삭제 주체, 시간, 대상, 사유 기록 및 삭제 확인 절차 정의"],
    ["오프라인/장애", "서버 또는 네트워크 장애 시 치료기록 전송 실패 가능성이 있다.", "로컬 보관, 재시도, 실패 알림, 중복 업로드 방지 키 설계"],
    ["소프트웨어 업데이트", "앱 업데이트 및 설정 변경이 치료 안전성에 영향 가능성이 있다.", "버전관리, 릴리즈노트, 검증 후 배포, 롤백 정책 필요"],
  ]));

  add(headingBlock(0, 2, "7. 요구사항 추적성 매트릭스 초안"));
  add(tableBlock(0, "요구사항 추적성 매트릭스", ["요구사항 ID", "요구사항 초안", "설계 ID", "설계 산출물", "검증 방법"], [
    ["SRS-001", "운영자는 앱에 접근할 수 있어야 한다.", "SDS-UI-001", "로그인 화면, 권한 정책", "로그인/권한 시험"],
    ["SRS-002", "운영자는 환자번호를 입력하고 환자를 등록/수정/삭제할 수 있어야 한다.", "SDS-UI-002, SDS-UI-003", "환자번호 입력, 등록/수정/삭제 화면", "환자 CRUD 시험, 입력검증 시험"],
    ["SRS-003", "운영자는 치료 프로파일을 선택하고 편집할 수 있어야 한다.", "SDS-PF-001, SDS-PF-002", "프로파일 선택/에디터 화면", "프로파일 검증 시험"],
    ["SRS-004", "소프트웨어는 치료 중 목표/실제 압력과 치료 시간을 표시해야 한다.", "SDS-RUN-002", "치료 운전 화면", "실시간 표시/단위 변환 시험"],
    ["SRS-005", "소프트웨어는 치료 중 일시정지/재개 및 종료 기능을 제공해야 한다.", "SDS-RUN-003, SDS-RUN-004", "치료 상태 전이", "상태별 버튼/명령 시험"],
    ["SRS-006", "소프트웨어는 치료 완료 후 치료기록을 저장해야 한다.", "SDS-LOG-001", "Room DB, Raw Log 파일", "세션 저장/조회 시험"],
    ["SRS-007", "소프트웨어는 치료 상세 보고서를 PDF로 생성해야 한다.", "SDS-REP-001", "HBOT Treatment Report", "PDF 내용 일치성 시험"],
    ["SRS-008", "소프트웨어는 운영로그를 PDF로 생성해야 한다.", "SDS-REP-002", "Operation Logs Report", "필터/건수/페이지 시험"],
    ["SRS-009", "치료 데이터는 중앙 서버로 전송되어야 한다.", "SDS-NET-001", "REST API/전송 큐", "성공/실패/재시도 시험"],
    ["SRS-010", "환자정보 및 치료기록은 권한 없는 접근으로부터 보호되어야 한다.", "SEC-001~SEC-008", "접근통제/저장/전송보안", "보안 요구사항 검증"],
  ]));

  add(headingBlock(0, 2, "8. 첨부자료 분석 결과"));
  add(paragraphBlock(0, "첨부자료는 참조 문서, 현재 구현 ZIP, PDF 보고서, 운영로그, 화면 캡처/영상, Android 코드/설정 자료로 분류하여 설계 근거로 사용하였다. 화면 캡처와 영상은 UI 흐름의 근거, PDF는 실제 내보내기 산출물의 항목과 형식을 확인하는 근거, Android 프로젝트 파일은 구현 모듈·권한·통신·저장소 설계 검토의 근거로 사용한다."));
  add(tableBlock(0, "참조파일 형식 기준", ["파일명", "형식", "크기", "반영할 형식 요소"], referenceRows.length ? referenceRows : [["참조파일 없음", "-", "-", "기본 IB-SDF 구조로 생성"]]));
  add(tableBlock(0, "현재 근거 요약", ["구분", "확인된 내용", "설계 반영 위치"], evidenceRows));
  add(tableBlock(0, "ZIP 내부 근거 요약", ["첨부 ZIP", "총 파일", "문서 후보", "코드/설정 후보", "이미지/영상 후보"], zipRows.length ? zipRows : [["ZIP 첨부 없음", "-", "-", "-", "-"]]));
  add(tableBlock(0, "사용한 근거 파일", ["파일명", "근거 유형", "비고"], inventoryRows.length ? inventoryRows.map(row => [row[0], row[1], row[4]]) : [["첨부파일 없음", "-", "-"]]));
  add(headingBlock(0, 2, "8.1 확인 필요 사항"));
  add(tableBlock(0, "확인 필요 항목", ["항목", "필요 근거", "우선순위"], missingRows));
  const allEvidenceImages = collectEvidenceImages(files).slice(0, ZIP_MAX_MEDIA_ASSETS);
  if (allEvidenceImages.length) {
    add(headingBlock(0, 2, "부록 A. 화면 및 산출물 증거 이미지 전체"));
    add(paragraphBlock(0, "아래 이미지는 첨부 ZIP에서 자동 추출한 대표 화면/산출물 이미지이다. 문서 최종화 시 각 이미지의 실제 화면명과 기능명을 확인하여 캡션을 확정한다."));
    add(tableBlock(0, "증거 이미지 전체 목록", ["번호", "캡션", "출처", "분류", "원본/추출 크기"], buildEvidenceImageRows(files)));
    allEvidenceImages.slice(6).forEach((asset, index) => add(imageBlockFromAsset(asset, index + 6)));
  }
  add(headingBlock(0, 2, "부록. 제출 전 보완 체크리스트"));
  add(tableBlock(0, "제출 전 보완 체크리스트", ["구분", "확인 항목", "상태"], [
    ["문서정보", "문서번호, 제정일, 개정일, 개정번호, 작성/검토/승인자 확정", "☐"],
    ["제품정보", "제품명, 모델명, 소프트웨어 형명/버전 확정", "☐"],
    ["SRS 연계", "S/W 요구사항명세서 ID와 SDS ID 추적성 연결", "☐"],
    ["위험관리 연계", "위험관리파일의 위험통제와 설계/검증 항목 연결", "☐"],
    ["API 명세", "REST/WebSocket 엔드포인트, 인증, 실패처리 정의", "☐"],
    ["데이터 보안", "DB/파일/PDF/서버 전송 보안 정책 확정", "☐"],
    ["시험자료", "단위시험, 통합시험, 시스템시험, PDF 산출물 검증 결과 첨부", "☐"],
    ["형상관리", "소스코드 태그, 빌드 산출물, 릴리즈노트, 설치파일 해시 관리", "☐"],
    ["사용자 문서", "사용설명서, 관리자 매뉴얼, 유지보수 절차와 기능명 일치 확인", "☐"],
  ]));

  return { title: `${titleBase} SW 상세설계파일 인허가 초안`, blocks };
}

function buildCurrentEvidenceRows(files) {
  const rows = [];
  const combined = files.map(file => `${file.filename}\n${file.text || ""}`).join("\n");
  const checks = [
    ["화면 캡처/영상", /스크린샷|screenshot|\.png|\.jpg|\.jpeg|\.webp|\.mp4|screen-/i, "로그인, 환자번호 입력, 프로파일 선택/편집, 치료 운전, 치료기록, 운영로그, 보고서 미리보기 화면의 UI 근거", "4장, 5장"],
    ["치료 상세 보고서 PDF", /HBOT|Treatment Report|Pressure Profile|O₂|O2|Event Log|HBOT_Report/i, "환자정보, 치료정보, 압력 프로파일, 산소농도, 이벤트 로그, 출력일시 구성", "5.5, 6.1"],
    ["운영로그 PDF", /operation_logs|Operation Logs|Generated|Filter|minimum|Count|최소|운영로그/i, "운영로그 생성일자, 필터, 최소시간, Count, 목록 컬럼, 페이지 구성", "5.5, 6.1"],
    ["Android 프로젝트", /AndroidManifest\.xml|build\.gradle|settings\.gradle|\.kt|\.java|res\/layout|strings\.xml/i, "Manifest, Gradle, layout, strings, Kotlin/Java 소스 기반 구현 근거", "3장, 4장, 5장"],
    ["로그/내보내기", /log|export|pdf|download|room|database|storage/i, "치료기록·운영로그 조회 및 PDF 내보내기 기능 후보", "4.1.3, 5.5, 6장"],
    ["통신/서버 전송", /websocket|socket|REST|https?|server|api|전송|중앙 서버/i, "치료 완료 데이터 전송, 실시간 상태 수신, 실패 처리 정책 검토 근거", "3장, 4.3, 5.2"],
  ];
  for (const [kind, pattern, found, section] of checks) {
    if (pattern.test(combined)) rows.push([kind, found, section]);
  }
  if (!rows.length) rows.push(["첨부자료", "파일명과 추출 텍스트 기준 현재 기능 근거 확인 필요", "8장"]);
  return rows;
}

function buildZipEvidenceRows(files) {
  return files.filter(file => file.extension === ".zip").map(file => {
    const text = String(file.text || "");
    const get = label => {
      const m = text.match(new RegExp(`${label}:\\s*(\\d+)`, "i"));
      return m ? m[1] : "[확인 필요]";
    };
    return [file.filename, get("총 파일 수"), get("내부 문서 후보"), get("코드/설정 후보"), get("이미지/영상 후보")];
  });
}

function isLowQualityRegulatoryDraft(draft) {
  if (!draft || !Array.isArray(draft.blocks)) return true;
  const text = JSON.stringify(draft, null, 0);
  const sectionHits = ["S/W 설계 기술서", "S/W 설계 명세서", "S/W 아키텍처", "용어정의", "제·개정", "요구사항 추적성"].filter(keyword => text.includes(keyword)).length;
  const hwpExcuseCount = (text.match(/HWP|본문 추출|추출 제한|작성해야 합니다|확인할 수 없습니다/g) || []).length;
  const tableCount = draft.blocks.filter(block => block.type === "table").length;
  const blockCount = draft.blocks.length;
  return blockCount < 24 || tableCount < 8 || sectionHits < 4 || (hwpExcuseCount >= 5 && blockCount < 35);
}

function ensureRegulatoryDraftQuality(draft, files, referenceFiles = [], reason = "") {
  if ((state.settings.document_mode || DEFAULT_DOCUMENT_MODE) === "report") return draft;
  if (!isLowQualityRegulatoryDraft(draft)) return draft;
  const improved = generateRegulatoryLocalDraft(files, reason || "Gemini 초안이 IB-SDF 품질 기준에 미달하여 내장 S/W 상세설계파일 템플릿으로 재구성", referenceFiles);
  return improved;
}


function normalizeDraft(draft, fallbackTitle) {
  const normalized = {
    title: String(draft?.title || fallbackTitle || "문서 분석 초안").slice(0, 80),
    blocks: Array.isArray(draft?.blocks) ? draft.blocks : [],
  };
  if (!normalized.blocks.length) {
    normalized.blocks = generateLocalDraft(state.project.files.filter(file => file.parsed_status === "parsed"), "", getParsedReferenceFiles()).blocks;
  }
  normalized.blocks = normalized.blocks.map((block, index) => ({
    id: block.id || makeId("block"),
    type: ["heading", "paragraph", "table", "chart", "diagram", "image"].includes(block.type) ? block.type : "paragraph",
    order: Number.isFinite(Number(block.order)) ? Number(block.order) : index,
    content: normalizeBlockContent(block.type, block.content),
  })).sort((a, b) => a.order - b.order).map((block, order) => ({ ...block, order }));
  return normalized;
}

function normalizeBlockContent(type, content = {}) {
  if (type === "heading") return { level: Number(content.level || 2), text: String(content.text || "") };
  if (type === "paragraph") return { text: String(content.text || "") };
  if (type === "table") {
    return {
      caption: String(content.caption || ""),
      headers: Array.isArray(content.headers) ? content.headers.map(String) : ["항목", "내용"],
      rows: Array.isArray(content.rows) ? content.rows.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? "")) : [String(row)]) : [],
    };
  }
  if (type === "chart") {
    return {
      title: String(content.title || "차트"),
      values: Array.isArray(content.values) ? content.values.map(item => ({ label: String(item.label || ""), value: Number(item.value) || 0 })) : [],
    };
  }
  if (type === "diagram") return { title: String(content.title || "다이어그램"), code: String(content.code || "") };
  if (type === "image") {
    return {
      caption: String(content.caption || content.alt || "증거 이미지"),
      alt: String(content.alt || content.caption || "증거 이미지"),
      source: String(content.source || content.filename || "첨부파일"),
      filename: String(content.filename || content.name || "image.jpg"),
      dataUrl: String(content.dataUrl || ""),
      width: Number(content.width || 0),
      height: Number(content.height || 0),
      originalWidth: Number(content.originalWidth || 0),
      originalHeight: Number(content.originalHeight || 0),
    };
  }
  return { alt: String(content.alt || "") };
}

function updateBlockFromInput(blockId, input) {
  const block = state.project?.draft?.blocks?.find(item => item.id === blockId);
  if (!block) return;
  if (input.dataset.field) {
    block.content[input.dataset.field] = input.value;
  }
  if (input.dataset.header) {
    block.content.headers[Number(input.dataset.header)] = input.value;
  }
  if (input.dataset.row) {
    block.content.rows[Number(input.dataset.row)][Number(input.dataset.cell)] = input.value;
  }
  persistProject(false);
}

function moveBlock(blockId, direction) {
  const blocks = state.project.draft.blocks;
  const ordered = [...blocks].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex(block => block.id === blockId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  state.project.draft.blocks = ordered.map((block, order) => ({ ...block, order }));
  persistProject();
  pushToast("success", "이동 완료", "문서 블록 순서를 변경했습니다.");
  render();
}

function deleteBlock(blockId) {
  state.project.draft.blocks = state.project.draft.blocks
    .filter(block => block.id !== blockId)
    .sort((a, b) => a.order - b.order)
    .map((block, order) => ({ ...block, order }));
  persistProject();
  pushToast("success", "삭제 완료", "문서 블록을 삭제했습니다.");
  render();
}

async function saveDraft() {
  if (!state.project?.draft) return;
  const title = document.getElementById("draft-title")?.value?.trim();
  if (title) state.project.draft.title = title;

  if (!state.settings.gemini_api_key) {
    state.project.updated_at = new Date().toISOString();
    persistProject();
    state.status = "초안이 이 브라우저에 저장되었습니다. Gemini API Key가 없어서 자동 보완은 실행하지 않았습니다.";
    pushToast("success", "저장 완료", state.status);
    render();
    return;
  }

  await withStatus("Gemini가 편집 내용을 검토하고 보완하는 중입니다.", async () => {
    try {
      const improvedDraft = await improveDraftWithGemini(state.project.draft);
      state.project.draft = normalizeDraft(improvedDraft, state.project.draft.title || state.project.title || "인허가 문서 초안");
      state.project.updated_at = new Date().toISOString();
      persistProject();
      state.status = "Gemini가 편집 내용을 보완하고 저장했습니다.";
    } catch (error) {
      console.warn("Gemini draft improvement failed; saved current draft", error);
      state.project.updated_at = new Date().toISOString();
      persistProject();
      state.status = `Gemini 보완 실패로 현재 편집본만 저장했습니다: ${error.message}`;
      pushToast("error", "Gemini 보완 실패", state.status, false);
    }
  }, "Gemini 보완 및 저장이 완료되었습니다.");
}

async function downloadDocx() {
  if (!state.project?.draft) return;
  await withStatus("Word 문서를 생성하는 중입니다.", async () => {
    ensureLibrary(window.JSZip, "JSZip");
    const blob = await buildDocxBlob(state.project.draft);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFileName(state.project.draft.title || "document-insight")}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    state.status = "Word 다운로드를 시작했습니다.";
  }, "Word 다운로드를 시작했습니다.");
}

async function buildDocxBlob(draft) {
  const zip = new window.JSZip();
  const imageRels = collectDocxImageRelationships(draft);
  const imageDefaults = imageRels.length ? `
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>` : "";
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>${imageDefaults}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  const imageRelXml = imageRels.map(item => `  <Relationship Id="${item.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.filename}"/>`).join("\n");
  zip.folder("word").folder("_rels").file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${imageRelXml}
</Relationships>`);
  for (const item of imageRels) {
    zip.folder("word").folder("media").file(item.filename, base64ToUint8Array(item.base64));
  }
  zip.folder("docProps").file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(draft.title)}</dc:title>
  <dc:creator>Document Insight OS</dc:creator>
  <cp:lastModifiedBy>Document Insight OS</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);
  zip.folder("docProps").file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Document Insight OS</Application></Properties>`);
  zip.folder("word").file("styles.xml", wordStylesXml());
  const imageRelMap = Object.fromEntries(imageRels.map(item => [item.blockId, item]));
  const bodyXml = draftToWordBodyXml(draft, imageRelMap);
  zip.folder("word").file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function draftToWordBodyXml(draft, imageRelMap = {}) {
  const blocks = [...draft.blocks].sort((a, b) => a.order - b.order);
  const parts = [paragraphXml(draft.title, "Title")];
  for (const block of blocks) {
    if (block.type === "heading") {
      const style = Number(block.content.level || 2) <= 1 ? "Heading1" : "Heading2";
      parts.push(paragraphXml(block.content.text || "", style));
    } else if (block.type === "paragraph") {
      splitParagraphText(block.content.text || "").forEach(line => parts.push(paragraphXml(line, "Normal")));
    } else if (block.type === "table") {
      if (block.content.caption) parts.push(paragraphXml(block.content.caption, "Heading2"));
      parts.push(tableXml(block.content.headers || [], block.content.rows || []));
    } else if (block.type === "chart") {
      parts.push(paragraphXml(block.content.title || "차트", "Heading2"));
      const rows = (block.content.values || []).map(item => [item.label, String(item.value)]);
      parts.push(tableXml(["항목", "값"], rows));
    } else if (block.type === "diagram") {
      parts.push(paragraphXml(block.content.title || "다이어그램", "Heading2"));
      splitParagraphText(block.content.code || "").forEach(line => parts.push(paragraphXml(line, "Normal")));
    }
  }
  return parts.join("\n");
}


function collectDocxImageRelationships(draft) {
  const blocks = [...(draft?.blocks || [])].sort((a, b) => a.order - b.order);
  const rels = [];
  let imageIndex = 1;
  for (const block of blocks) {
    if (block.type !== "image" || !block.content?.dataUrl) continue;
    const parsed = parseDataUrl(block.content.dataUrl);
    if (!parsed) continue;
    const ext = parsed.contentType === "image/png" ? "png" : "jpg";
    rels.push({
      blockId: block.id,
      rid: `rIdImage${imageIndex}`,
      filename: `image${imageIndex}.${ext}`,
      contentType: parsed.contentType,
      base64: parsed.base64,
      width: Number(block.content.width || 960),
      height: Number(block.content.height || 540),
    });
    imageIndex += 1;
  }
  return rels;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { contentType: match[1], base64: match[2] };
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function imageXml(rel, content = {}) {
  const size = docxImageSize(Number(content.width || rel.width || 960), Number(content.height || rel.height || 540));
  const name = xmlEscape(content.filename || rel.filename || "image");
  const descr = xmlEscape(content.alt || content.caption || "증거 이미지");
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">
    <wp:extent cx="${size.cx}" cy="${size.cy}"/>
    <wp:docPr id="${Math.max(1, Math.floor(Math.random() * 100000))}" name="${name}" descr="${descr}"/>
    <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <pic:pic>
        <pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>
        <pic:blipFill><a:blip r:embed="${rel.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
        <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size.cx}" cy="${size.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
      </pic:pic>
    </a:graphicData></a:graphic>
  </wp:inline></w:drawing></w:r></w:p>`;
}

function docxImageSize(widthPx, heightPx) {
  const maxCx = 5486400;
  const cxRaw = Math.max(1, widthPx) * 9525;
  const cyRaw = Math.max(1, heightPx) * 9525;
  const ratio = Math.min(1, maxCx / cxRaw);
  return { cx: Math.round(cxRaw * ratio), cy: Math.round(cyRaw * ratio) };
}

function paragraphXml(text, style = "Normal") {
  const runs = String(text || "").split("\n").map((line, index) => {
    const breakXml = index > 0 ? "<w:br/>" : "";
    return `<w:r>${breakXml}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`;
  }).join("");
  const styleXml = style && style !== "Normal" ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}${runs || "<w:r><w:t></w:t></w:r>"}</w:p>`;
}

function tableXml(headers, rows) {
  const normalizedRows = [headers, ...rows].filter(row => Array.isArray(row) && row.length);
  const rowXml = normalizedRows.map((row, rowIndex) => `<w:tr>${row.map(cell => `
    <w:tc>
      <w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>
      ${paragraphXml(String(cell ?? ""), rowIndex === 0 ? "TableHeader" : "Normal")}
    </w:tc>`).join("")}</w:tr>`).join("\n");
  return `<w:tbl>
    <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D0D7E2"/></w:tblBorders></w:tblPr>
    ${rowXml}
  </w:tbl>`;
}

function wordStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="280" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="220" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>
</w:styles>`;
}

async function withStatus(message, callback, successMessage = "완료되었습니다.") {
  state.busy = true;
  state.busyMessage = message;
  state.status = message;
  pushToast("info", "진행 중", message, false);
  render();
  try {
    const resultMessage = await callback();
    pushToast("success", "완료", resultMessage || successMessage, false);
  } catch (error) {
    state.status = error.message || "처리 중 오류가 발생했습니다.";
    pushToast("error", "오류", state.status, false);
  } finally {
    state.busy = false;
    state.busyMessage = "";
    render();
  }
}

function pushToast(type, title, message, renderNow = true) {
  const id = `${Date.now()}-${Math.random()}`;
  state.toasts = [...state.toasts, { id, type, title, message }].slice(-4);
  const host = ensureToastHost();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.dataset.toastId = id;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  host.appendChild(toast);
  while (host.children.length > 4) host.firstElementChild?.remove();
  if (renderNow) render();
  setTimeout(() => {
    state.toasts = state.toasts.filter(toast => toast.id !== id);
    document.querySelector(`[data-toast-id="${CSS.escape(id)}"]`)?.remove();
  }, type === "error" ? 10000 : 8000);
}

function ensureToastHost() {
  let host = document.getElementById("global-toast-stack");
  if (!host) {
    host = document.createElement("div");
    host.id = "global-toast-stack";
    host.className = "toast-stack";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

function persistProject(showWarning = true) {
  if (!state.project) return;
  try {
    state.project.updated_at = new Date().toISOString();
    localStorage.setItem(`${STORAGE_PROJECT_PREFIX}${state.project.id}`, JSON.stringify(state.project));
    localStorage.setItem(STORAGE_LAST_PROJECT, state.project.id);
  } catch (error) {
    console.warn("Project persistence failed", error);
    if (showWarning) pushToast("error", "저장 용량 초과", "브라우저 localStorage 용량을 초과했습니다. 파일 수나 크기를 줄여주세요.");
  }
}

function loadSettingsFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || "{}");
    return {
      gemini_api_key: saved.gemini_api_key || "",
      gemini_model: saved.gemini_model || DEFAULT_MODEL,
      document_mode: saved.document_mode || DEFAULT_DOCUMENT_MODE,
      pipeline_mode: saved.pipeline_mode || "high_quality",
      product_name: saved.product_name || "",
      software_version: saved.software_version || "",
      target_hardware: saved.target_hardware || "",
      target_regulator: saved.target_regulator || "",
      intended_use: saved.intended_use || "",
    };
  } catch {
    return { gemini_api_key: "", gemini_model: DEFAULT_MODEL, document_mode: DEFAULT_DOCUMENT_MODE, pipeline_mode: "high_quality", product_name: "", software_version: "", target_hardware: "", target_regulator: "", intended_use: "" };
  }
}

function saveSettingsToStorage(settings) {
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify({
    gemini_api_key: settings.gemini_api_key || "",
    gemini_model: settings.gemini_model || DEFAULT_MODEL,
    document_mode: settings.document_mode || DEFAULT_DOCUMENT_MODE,
    pipeline_mode: settings.pipeline_mode || "high_quality",
    product_name: settings.product_name || "",
    software_version: settings.software_version || "",
    target_hardware: settings.target_hardware || "",
    target_regulator: settings.target_regulator || "",
    intended_use: settings.intended_use || "",
  }));
}

function parseDraftJson(text) {
  const cleaned = stripJsonFences(String(text || "")).trim();
  const candidates = [cleaned, extractJsonObject(cleaned), repairJsonLikeText(extractJsonObject(cleaned))].filter(Boolean);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError?.message ? `Gemini 응답 JSON 파싱에 실패했습니다: ${lastError.message}` : "Gemini 응답 JSON 파싱에 실패했습니다.");
}

function stripJsonFences(value) {
  return String(value || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function extractJsonObject(value) {
  const text = String(value || "");
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escape) { escape = false; continue; }
    if (char === "\\") { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  const end = text.lastIndexOf("}");
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

function repairJsonLikeText(value) {
  if (!value) return "";
  return String(value)
    .replace(/[\u0000-\u001F]+/g, match => match.includes("\n") ? "\\n" : " ")
    .replace(/,\s*([}\]])/g, "$1");
}

function docxXmlToText(xml) {
  return decodeXmlEntities(xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " "));
}

function decodeXmlEntities(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createLocalFileSummary(text, filename) {
  const clean = normalizeText(text);
  if (!clean) return `${filename}에서 텍스트를 추출하지 못했습니다.`;
  const firstSentence = clean.split(/[.!?。！？\n]/).map(item => item.trim()).find(Boolean);
  return (firstSentence || clean).slice(0, 180);
}

function extractKeywords(text) {
  const stop = new Set(["그리고", "그러나", "또는", "대한", "위한", "에서", "으로", "합니다", "있습니다", "the", "and", "for", "with", "this", "that", "from", "are", "was", "were"]);
  const counts = new Map();
  String(text || "").toLowerCase().replace(/[A-Za-z0-9가-힣_]{2,}/g, word => {
    if (stop.has(word)) return word;
    counts.set(word, (counts.get(word) || 0) + 1);
    return word;
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));
}

function getParsedReferenceFiles() {
  return (state.project?.reference_files || []).filter(file => file.parsed_status === "parsed" && file.text?.trim());
}

function buildReferenceFormatRows(referenceFiles = []) {
  return referenceFiles.map(file => [
    file.filename,
    file.extension || extensionOf(file.filename || ""),
    formatBytes(Number(file.size || 0)),
    inferReferenceFormatHint(file),
  ]);
}

function inferReferenceFormatHint(file) {
  const text = String(file?.text || "");
  const hints = [];
  if (/목차|table of contents|contents/i.test(text)) hints.push("목차 구조");
  if (/표|table|항목|내용|결과|비고/i.test(text)) hints.push("표 구성");
  if (/검토|확인 필요|review|comment|note/i.test(text)) hints.push("검토 메모 방식");
  if (/인허가|허가|승인|regulatory|submission/i.test(text)) hints.push("인허가 문체");
  if (!hints.length) hints.push("제목/문단 흐름");
  return hints.join(", ");
}

function buildGeminiSourceText(referenceFiles = [], files = []) {
  const sections = [];
  if (referenceFiles.length) {
    sections.push([
      "## 참조파일 / FORMAT REFERENCE",
      "아래 파일은 결과물의 목차, 문체, 표 구성, 검토 메모 형식을 맞추기 위한 기준입니다. ZIP은 내부 파일 목록과 추출 가능한 문서 본문이 확장되어 있습니다. 현재 버전 사실관계는 첨부파일 근거가 있을 때만 반영하세요.",
      ...referenceFiles.map(file => `### [REF] ${file.filename} (${file.extension}, ${formatBytes(file.size)})\n${file.text}`),
    ].join("\n\n"));
  }
  sections.push([
    "## 분석 첨부파일 / SOURCE ATTACHMENTS",
    "아래 파일은 현재 결과물에 반영할 실제 분석 근거입니다.",
    ...files.map(file => `### [SRC] ${file.filename} (${file.extension}, ${formatBytes(file.size)})\n${file.text}`),
  ].join("\n\n"));
  return sections.join("\n\n---\n\n").slice(0, MAX_GEMINI_INPUT_CHARS);
}

function currentDocumentProfile() {
  return {
    skill_version: REGULATORY_SKILL_VERSION,
    document_mode: state.settings.document_mode || DEFAULT_DOCUMENT_MODE,
    product_name: state.settings.product_name || "",
    software_version: state.settings.software_version || "",
    target_hardware: state.settings.target_hardware || "",
    target_regulator: state.settings.target_regulator || "",
    intended_use: state.settings.intended_use || "",
  };
}

function buildArtifactInventory(files, referenceFiles = []) {
  const referenceLines = referenceFiles.map(file => `- [참조파일] ${file.filename}: Format reference / ${file.extension} / ${formatBytes(file.size)} / ${file.summary || "요약 없음"}`);
  const fileLines = files.map(file => `- [첨부파일] ${file.filename}: ${classifyArtifact(file)} / ${file.extension} / ${formatBytes(file.size)} / ${file.summary || "요약 없음"}`);
  return [...referenceLines, ...fileLines].join("\n");
}

function classifyArtifact(file) {
  const name = String(file.filename || "").toLowerCase();
  const text = String(file.text || "").slice(0, 9000).toLowerCase();
  const combined = `${name}
${text}`;
  if (/ib-sdf|s\/w 상세설계|소프트웨어 상세설계|software design|인허가|허가|승인|reference|prior|기존|previous|품목|의료기기|regulatory|submission/.test(combined)) return "Reference regulatory document";
  if (/test|검증|시험|result|결과|validation|verification|로그|report|보고서/.test(combined)) return "Test notes/results";
  if (/manual|매뉴얼|사용자|화면|스크린샷|screenshot|guide|procedure|절차|\.(png|jpg|jpeg|webp|mp4|mov)/.test(combined)) return "Current manual/screenshots";
  if (/androidmanifest\.xml|build\.gradle|settings\.gradle|res\/values|class .*activity|fun oncreate|extends activity|activity|service|bluetooth|ble|websocket|api/.test(combined)) return "Current Android project evidence";
  if (file.extension === ".zip") return "ZIP supporting bundle";
  return "Unclassified supporting material";
}

function extractAndroidEvidenceRows(files) {
  const rows = [];
  const combined = files.map(file => `\n[${file.filename}]\n${file.text}`).join("\n");
  const patterns = [
    ["패키지/Manifest", /AndroidManifest\.xml|package=|<manifest|uses-permission|<activity|<service|<receiver/i, "패키지명, 권한, Activity/Service/Receiver, exported 설정 확인"],
    ["Gradle/버전", /build\.gradle|versionName|versionCode|applicationId|minSdk|targetSdk|compileSdk/i, "앱 ID, 버전명/코드, SDK 버전 확인"],
    ["화면/메뉴 라벨", /res\/values\/.*strings|<string name=|res\/layout|res\/menu|navigation/i, "사용자 표시 화면명과 메뉴명을 문서 절차에 반영"],
    ["통신/하드웨어", /bluetooth|ble|usb|serial|socket|websocket|http|mqtt|sensor|device|gatt/i, "장비 통신 경로와 안전 관련 제한사항 확인"],
    ["로그/내보내기", /log|export|download|pdf|docx|csv|room|database|storage/i, "로그 저장, 내보내기, 개인정보/보안 영향 확인"],
    ["안전/검증", /safety|alarm|emergency|validation|verify|limit|permission|encrypt|secure|auth/i, "안전 알람, 검증 로직, 권한/암호화 근거 확인"],
  ];
  for (const [area, pattern, note] of patterns) {
    if (pattern.test(combined)) {
      const source = files.find(file => pattern.test(`${file.filename}\n${file.text}`));
      rows.push([area, source ? source.filename : "첨부 자료", note]);
    }
  }
  return rows;
}

function buildMissingInfoRows(profile, files, referenceFiles = []) {
  const rows = [];
  if (!profile.product_name) rows.push(["현재 프로그램명", "앱 표시명, 제품명 또는 인허가 문서상 프로그램명", "상"]);
  if (!profile.software_version) rows.push(["SW 버전/빌드", "versionName/versionCode, 릴리즈 날짜", "상"]);
  if (!profile.target_hardware) rows.push(["대상 장비/하드웨어", "연동 장비명, 통신 방식, 호환 모델", "상"]);
  if (!profile.intended_use) rows.push(["사용 목적", "기존 승인 문서의 사용 목적 또는 현재 사용 목적", "상"]);
  if (!referenceFiles.length && !files.some(file => classifyArtifact(file) === "Reference regulatory document")) rows.push(["기존 승인/참조 문서", "이전 인허가 문서 DOCX/PDF/HWPX 또는 텍스트 export", "상"]);
  if (!files.some(file => classifyArtifact(file) === "Current manual/screenshots")) rows.push(["현재 매뉴얼/스크린샷", "사용자 화면 흐름, 표시 라벨, 절차", "중"]);
  if (!files.some(file => classifyArtifact(file) === "Test notes/results")) rows.push(["시험 결과/검증 로그", "기능 테스트 결과표, 검증 로그, 성능 근거", "상"]);
  if (!rows.length) rows.push(["최종 규제 검토", "초안 문구의 제출 가능성, 안전/성능 claim 검토", "상"]);
  return rows;
}

function splitParagraphText(text) {
  const clean = String(text || "").trim();
  if (!clean) return [""];
  return clean.split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
}

function headingBlock(order, level, text) {
  return { id: makeId("block"), type: "heading", order, content: { level, text } };
}

function paragraphBlock(order, text) {
  return { id: makeId("block"), type: "paragraph", order, content: { text } };
}

function tableBlock(order, caption, headers, rows) {
  return { id: makeId("block"), type: "table", order, content: { caption, headers, rows } };
}

function extensionOf(name) {
  const part = String(name || "").split(".").pop();
  return part ? `.${part.toLowerCase()}` : "";
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function projectUrl() {
  if (!state.project) return window.location.href;
  return `${window.location.origin}${window.location.pathname}?project=${encodeURIComponent(state.project.id)}`;
}

function ensureLibrary(library, name) {
  if (!library) throw new Error(`${name} 라이브러리를 불러오지 못했습니다. 인터넷 연결 또는 CDN 차단 여부를 확인하세요.`);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "0B";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function sanitizeFileName(value) {
  return String(value || "document")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 80) || "document";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
