const STORAGE_SETTINGS = "document-insight-settings-v2";
const STORAGE_LAST_PROJECT = "document-insight-last-project-v2";
const STORAGE_PROJECT_PREFIX = "document-insight-project-v2:";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const MAX_FILES = 10;
const MAX_REFERENCE_FILES = 1;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = [".docx", ".pdf", ".xlsx", ".txt", ".md", ".csv", ".zip", ".hwpx", ".hwp", ".kt", ".java", ".xml", ".gradle", ".kts", ".json", ".yml", ".yaml"];
const MAX_EXTRACT_CHARS_PER_FILE = 18000;
const MAX_GEMINI_INPUT_CHARS = 90000;
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
    max_file_size_label: "20MB",
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
          <label for="gemini-model" class="label">Gemini 모델</label>
          <input id="gemini-model" value="${escapeAttr(state.settings.gemini_model || DEFAULT_MODEL)}" />
          <button id="save-settings" type="button" ${state.busy ? "disabled" : ""}>Gemini 설정 저장</button>
          <small>${state.settings.gemini_api_key ? "Gemini 직접 호출이 켜져 있습니다. 키는 이 브라우저 localStorage에만 저장됩니다." : "키가 없으면 로컬 요약기로 초안을 생성합니다."}</small>
        </section>

        <section class="panel reference-panel">
          <label for="reference-files" class="label">참조파일</label>
          <p class="helper-text">결과물의 목차, 문체, 표 구성, 검토 메모 형식을 맞출 기준 문서입니다. 새 파일을 선택하면 기존 참조파일을 대체합니다.</p>
          <div class="limit-grid compact-limit-grid">
            <span>참조파일: ${state.project?.reference_files?.length || 0}/${state.limits.max_reference_files_per_project}개</span>
            <span>지원 형식: ${escapeHtml(state.limits.supported_extensions.join(", "))}</span>
            <span>파일당 용량: ${escapeHtml(state.limits.max_file_size_label)}</span>
          </div>
          <input id="reference-files" type="file" accept=".xlsx,.docx,.pdf,.txt,.md,.csv,.zip,.hwpx,.hwp,.kt,.java,.xml,.gradle,.kts,.json,.yml,.yaml" ${state.busy ? "disabled" : ""} />
          <small>예: 기존 인허가 문서, 기존 보고서, 양식 샘플, 검토 완료본. 참조파일의 사실관계는 그대로 복사하지 않고 형식 기준으로 사용합니다.</small>
        </section>

        <section class="panel">
          <label for="files" class="label">첨부파일</label>
          <p class="helper-text">GitHub Pages 정적 모드입니다. 파일은 서버로 업로드되지 않고 현재 브라우저에서만 읽습니다. 첨부파일은 최대 10개까지 분석하며 Android 프로젝트는 ZIP으로 첨부할 수 있습니다.</p>
          <div class="limit-grid">
            <span>지원 형식: ${escapeHtml(state.limits.supported_extensions.join(", "))}</span>
            <span>최대 개수: ${state.project?.files?.length || 0}/${state.limits.max_files_per_project}개</span>
            <span>파일당 용량: ${escapeHtml(state.limits.max_file_size_label)}</span>
          </div>
          <input id="files" type="file" multiple accept=".xlsx,.docx,.pdf,.txt,.md,.csv,.zip,.hwpx,.hwp,.kt,.java,.xml,.gradle,.kts,.json,.yml,.yaml" ${state.busy ? "disabled" : ""} />
          <div id="drop-zone" class="drop-zone">파일을 여기에 드래그하거나 파일 선택을 누르세요.</div>
          <label for="file-path" class="label">파일명 또는 로컬 파일 경로</label>
          <input id="file-path" placeholder="브라우저 보안상 경로 직접 업로드는 지원하지 않습니다." disabled />
          <button id="upload-path" type="button" ${state.busy ? "disabled" : ""}>경로 업로드 안내</button>
          <button id="generate-architecture" class="secondary" ${state.project?.files?.length && !state.busy ? "" : "disabled"}>문서 아키텍처 생성</button>
          <button id="analyze" ${state.project?.files?.length && !state.busy ? "" : "disabled"}>분석 및 초안 생성</button>
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
  return `<input data-field="alt" value="${escapeAttr(content.alt || "")}" />`;
}

function bindEvents() {
  document.getElementById("create-project")?.addEventListener("click", createProject);
  document.getElementById("save-settings")?.addEventListener("click", saveSettings);
  ["doc-mode", "product-name", "software-version", "target-hardware", "target-regulator", "intended-use"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", saveSettings);
  });
  document.getElementById("reference-files")?.addEventListener("change", uploadReferenceFiles);
  document.getElementById("files")?.addEventListener("change", uploadFiles);
  document.getElementById("upload-path")?.addEventListener("click", () => {
    pushToast("info", "경로 업로드 안내", "GitHub Pages 정적 모드에서는 로컬 경로를 직접 읽을 수 없습니다. 파일 선택 또는 드래그 앤 드롭을 사용하세요.");
  });
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
  document.getElementById("generate-architecture")?.addEventListener("click", generateDocumentArchitecture);
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
    } else if (extension === ".zip") {
      base.text = await parseZip(file);
    } else if (extension === ".hwpx") {
      base.text = await parseHwpx(file);
    } else if (extension === ".hwp") {
      base.text = createHwpBrowserFallbackText(file);
      base.summary = "HWP 바이너리 파일입니다. GitHub Pages 정적 모드에서는 본문 직접 추출이 제한되어 파일명/메타데이터 근거로 분석에 포함합니다. 정확한 본문 반영이 필요하면 HWPX, DOCX, PDF로 변환해 함께 첨부하세요.";
    }
    base.text = normalizeText(base.text).slice(0, MAX_EXTRACT_CHARS_PER_FILE);
    base.summary = createLocalFileSummary(base.text, file.name);
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
  return [
    `[HWP: ${file.name}]`,
    "파일 형식: HWP 바이너리 한글 문서",
    `파일 크기: ${formatBytes(file.size)}`,
    "파싱 상태: 제한 파싱",
    "주의: GitHub Pages 정적 브라우저 환경에서는 HWP 바이너리 본문을 안정적으로 직접 추출할 수 없습니다.",
    "처리 방식: 파일명과 메타데이터를 인허가 근거 자료 목록에 포함하고, 본문 기반 세부 문구는 [확인 필요]로 표시합니다.",
    "권장: 기존 허가 문서의 본문을 정확히 반영하려면 HWP를 HWPX, DOCX, PDF 또는 TXT로 변환해 함께 첨부하세요."
  ].join("\n");
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
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  const important = names.filter(isImportantZipEntry).slice(0, 120);
  const parts = [
    `[ZIP: ${file.name}]`,
    `총 파일 수: ${names.length}`,
    `주요 파일 수: ${important.length}`,
    "",
    "[주요 경로 목록]",
    ...important.slice(0, 80).map(name => `- ${name}`),
  ];
  for (const name of important.slice(0, 45)) {
    try {
      const entry = zip.file(name);
      if (!entry) continue;
      const ext = extensionOf(name);
      if (!isPlainTextExtension(ext) && !isAndroidEvidencePath(name)) continue;
      const content = await entry.async("string");
      const cleaned = normalizeText(content).slice(0, 7000);
      if (cleaned) parts.push(`\n[FILE: ${name}]\n${cleaned}`);
    } catch (error) {
      parts.push(`\n[FILE: ${name}]\n읽기 실패: ${error.message}`);
    }
  }
  return parts.join("\n");
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
  if (/node_modules|\.git/gi.test(normalized)) return false;
  if (/androidmanifest\.xml$/.test(lower)) return true;
  if (/(build|settings)\.gradle(\.kts)?$/.test(lower)) return true;
  if (/res\/values\/.*\.xml$/.test(lower)) return true;
  if (/res\/layout\/.*\.xml$/.test(lower)) return true;
  if (/res\/menu\/.*\.xml$/.test(lower)) return true;
  if (/navigation\/.*\.xml$/.test(lower)) return true;
  if (/\.(kt|java|xml|gradle|kts|md|txt|json|yml|yaml)$/.test(lower)) return true;
  return false;
}

function isAndroidEvidencePath(name) {
  const lower = String(name || "").toLowerCase();
  return /androidmanifest\.xml|build\.gradle|settings\.gradle|res\/values|res\/layout|res\/menu|navigation|\.(kt|java|xml|gradle|kts)$/.test(lower);
}

async function analyzeProject() {
  if (!state.project?.files?.length) return;
  await withStatus("인허가 문서 초안을 생성하는 중입니다.", async () => {
    const parsedFiles = state.project.files.filter(file => file.parsed_status === "parsed" && file.text?.trim());
    const referenceFiles = getParsedReferenceFiles();
    if (!parsedFiles.length) throw new Error("분석 가능한 파일 텍스트가 없습니다.");
    state.project.document_profile = currentDocumentProfile();

    let draft;
    if (state.settings.gemini_api_key) {
      state.status = state.settings.document_mode === "report"
        ? "Gemini API로 일반 보고서 초안을 생성하는 중입니다."
        : "Gemini API로 인허가 문서 초안을 생성하는 중입니다.";
      render();
      try {
        draft = await generateDraftWithGemini(parsedFiles, referenceFiles);
      } catch (error) {
        console.warn("Gemini generation failed; fallback to local draft", error);
        pushToast("error", "Gemini 응답 보정 실패", `${error.message} 로컬 체크리스트 초안으로 대체합니다.`, false);
        draft = generateLocalDraft(parsedFiles, error.message, referenceFiles);
      }
    } else {
      draft = generateLocalDraft(parsedFiles, "", referenceFiles);
    }

    state.project.draft = normalizeDraft(draft, state.project.title);
    state.project.updated_at = new Date().toISOString();
    persistProject();
    state.status = state.settings.document_mode === "report"
      ? "보고서 초안이 생성되었습니다. 화면에서 수정 후 Word로 다운로드하세요."
      : "인허가 문서 초안이 생성되었습니다. [확인 필요] 항목을 검토한 뒤 Word로 다운로드하세요.";
  }, "초안이 생성되었습니다.");
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
          maxOutputTokens: 8192,
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

async function generateDraftWithGemini(files, referenceFiles = []) {
  const model = state.settings.gemini_model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(state.settings.gemini_api_key)}`;
  const sourceText = buildGeminiSourceText(referenceFiles, files);
  const profile = currentDocumentProfile();
  const inventory = buildArtifactInventory(files, referenceFiles);
  const prompt = state.settings.document_mode === "report"
    ? buildGenericReportPrompt(sourceText)
    : buildRegulatoryPrompt(sourceText, profile, inventory);

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: attempt === 1 ? prompt : `${prompt}\n\n재시도 지시: 이전 응답은 JSON 파싱에 실패했습니다. 이번에는 설명 없이 유효한 JSON 객체만 반환하세요. 마지막 문자는 반드시 } 여야 합니다.` }] }],
        generationConfig: {
          temperature: attempt === 1 ? 0.2 : 0.05,
          maxOutputTokens: 8192,
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
          maxOutputTokens: 8192,
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
  return `당신은 한국어 인허가/기술문서 편집 보조자입니다. 사용자가 화면에서 직접 수정한 현재 초안을 검토하고, 문장을 더 명확하고 제출용에 가깝게 보완하세요.\n\n핵심 규칙:\n- 반드시 JSON 객체만 반환하세요. 마크다운 코드펜스 금지.\n- 사용자가 편집한 의미, 순서, 표 구조를 최대한 보존하세요.\n- 임의로 규제/안전/성능/시험 결과를 만들지 마세요.\n- 근거가 부족한 문장은 '[확인 필요: ...]'로 표시하세요.\n- 중복 문장, 어색한 표현, 불명확한 용어를 정리하세요.\n- 제출용 문안과 검토 메모가 섞여 있으면 가능한 한 구분되게 다듬으세요.\n- 현재 초안이 문서 아키텍처이면 본문을 과도하게 확장하지 말고, 섹션 설계/근거 매핑/확인 필요 항목을 더 명확하게 보완하세요.\n- blocks 배열은 heading, paragraph, table, chart, diagram 타입만 사용하세요.\n- 기존 block의 id/order가 있으면 유지하고, 필요 시 새 id는 refine_1, refine_2 형식으로 만드세요.\n\n현재 설정:\n- 문서 모드: ${profile.document_mode || "regulatory"}\n- 프로그램명: ${profile.product_name || "[확인 필요: 현재 프로그램명]"}\n- SW 버전/빌드: ${profile.software_version || "[확인 필요: SW 버전/빌드]"}\n- 대상 장비/하드웨어: ${profile.target_hardware || "[확인 필요: 대상 장비/하드웨어]"}\n- 대상 규제/기관: ${profile.target_regulator || "[확인 필요: 대상 규제/기관]"}\n- 사용 목적: ${profile.intended_use || "[확인 필요: 사용 목적]"}\n\n첨부파일 요약:\n${sourceSummary || "첨부파일 요약 없음"}\n\n반환 JSON 스키마:\n{"title":"문서 제목","blocks":[{"id":"b1","type":"heading","order":0,"content":{"level":1,"text":"제목"}},{"id":"b2","type":"paragraph","order":1,"content":{"text":"문단"}},{"id":"b3","type":"table","order":2,"content":{"caption":"표 제목","headers":["항목","내용"],"rows":[["값","값"]]}}]}\n\n현재 편집 초안 JSON:\n${draftJson}`;
}

function buildGenericReportPrompt(sourceText) {
  return `당신은 한국어 보고서 작성 보조자입니다. 아래 참조파일과 첨부파일 추출 텍스트를 바탕으로 편집 가능한 문서 초안을 만드세요.\n\n규칙:\n- 반드시 JSON만 반환하세요. 마크다운 코드펜스 금지.\n- title은 한국어 파일명/문서명으로 작성하세요.\n- 참조파일이 제공된 경우 참조파일의 목차, 문체, 표/검토 메모 형식을 우선 따라가세요. 단, 첨부파일에 없는 사실은 새로 만들지 마세요.\n- blocks는 heading, paragraph, table, chart, diagram 중 필요한 타입을 사용하세요.\n- 근거가 부족한 내용은 추측하지 말고 '[확인 필요: ...]'라고 쓰세요.\n- JSON 문자열 안에는 제어문자를 넣지 말고 줄바꿈은 \\n 으로 이스케이프하세요.\n\nJSON 스키마:\n{"title":"문서 제목","blocks":[{"id":"b1","type":"heading","order":0,"content":{"level":1,"text":"요약"}},{"id":"b2","type":"paragraph","order":1,"content":{"text":"요약 문단"}},{"id":"b3","type":"table","order":2,"content":{"caption":"핵심 항목","headers":["항목","내용"],"rows":[["예시","내용"]]}}]}\n\n참조파일 및 첨부파일 추출 텍스트:\n${sourceText}`;
}

function buildRegulatoryPrompt(sourceText, profile, inventory) {
  return `당신은 한국어 의료기기/장비 소프트웨어 인허가 문서 초안 작성자입니다. 아래 참조파일과 첨부파일을 구분해서 읽고, 참조파일의 형식에 맞춰 현재 버전 인허가 문서 초안을 작성하세요.\n\n중요 원칙:\n- 규제/안전/성능/시험/사용목적 사실을 발명하지 마세요.\n- 확인되지 않은 내용은 반드시 '[확인 필요: ...]' 형식으로 표시하세요.\n- 참조파일이 제공된 경우 참조파일의 목차, 제목 스타일, 표 컬럼 구성, 문체, 검토 메모 배치를 결과물의 형식 기준으로 우선 반영하세요.\n- 기존 문서의 구조, 제목 스타일, 용어, 공식 문구는 가능한 한 보존하세요.\n- 참조파일에 있는 사실관계를 첨부파일 근거 없이 현재 버전 사실로 복사하지 마세요. 근거가 없으면 [확인 필요: ...]로 분리하세요.\n- Android 프로젝트 ZIP이 있으면 AndroidManifest.xml, Gradle, res/values/strings.xml, layout/menu/navigation, kt/java 소스의 화면/권한/서비스/통신/로그/안전 체크 근거를 우선 정리하세요.\n- 스크린샷/매뉴얼과 코드가 충돌하면 사용자에게 보이는 스크린샷/매뉴얼을 우선하고 차이를 검토 메모에 기록하세요.\n- 제출용 문안과 검토 메모를 분리하세요.\n- 반드시 JSON 객체만 반환하세요. 마크다운 코드펜스 금지.\n\n사용자 입력 제약:\n- 프로그램명: ${profile.product_name || "[확인 필요: 현재 프로그램명]"}\n- SW 버전/빌드: ${profile.software_version || "[확인 필요: SW 버전/빌드]"}\n- 대상 장비/하드웨어: ${profile.target_hardware || "[확인 필요: 대상 장비/하드웨어]"}\n- 대상 규제/기관: ${profile.target_regulator || "[확인 필요: 대상 규제/기관]"}\n- 사용 목적: ${profile.intended_use || "[확인 필요: 사용 목적]"}\n\n첨부파일 분류 힌트:\n${inventory}\n\n작성 순서:\n1. Reference Structure: 기존 승인/참조 문서의 섹션, 반복 공식 문구, 유지해야 할 안전/목적 문구를 추출하세요.\n2. Current Evidence Map: 현재 Android/매뉴얼/테스트 근거를 화면, 기능, 권한, 통신, 로그, 안전 체크, 제한사항으로 정리하세요.\n3. Change Map: Same, Modified, New, Removed, Unknown으로 비교하세요.\n4. Submission-ready Draft: 현재 버전 인허가 문서 초안을 작성하세요.\n5. Review Notes: 확인 필요 항목, 부족한 근거, 사용한 근거 파일을 모으세요.\n\n반환 JSON 스키마:\n{"title":"<현재 프로그램명> 인허가 문서 초안","blocks":[{"id":"b1","type":"heading","order":0,"content":{"level":1,"text":"제목"}},{"id":"b2","type":"paragraph","order":1,"content":{"text":"문단"}},{"id":"b3","type":"table","order":2,"content":{"caption":"표 제목","headers":["항목","내용"],"rows":[["값","값"]]}},{"id":"b4","type":"diagram","order":3,"content":{"title":"흐름도","code":"텍스트 다이어그램"}}]}\n\n필수 포함 블록:\n- Reference Structure\n- Current Evidence Map\n- Change Map 표(Area, Prior document, Current evidence, Action)\n- Submission-ready Draft\n- 검토 메모\n- 확인 필요 항목 표\n- 사용한 근거 파일 표\n\n첨부파일 추출 텍스트:\n${sourceText}`;
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
  const inventoryRows = files.map(file => [file.filename, classifyArtifact(file), file.extension, formatBytes(file.size), file.summary || "요약 없음"]);
  const referenceRows = buildReferenceFormatRows(referenceFiles);
  const androidRows = extractAndroidEvidenceRows(files);
  const missingRows = buildMissingInfoRows(profile, files, referenceFiles);
  const changeRows = [
    ["Same", "기존 승인/참조 문서 확인 필요", "현재 첨부 근거와 비교 필요", "[확인 필요: 유지 문구/안전 문구 확정]"],
    ["Modified", "이전 버전 화면/기능/시험 문구 확인 필요", "Android/매뉴얼 근거에서 변경 후보 추출", "변경 근거 확보 후 문구 수정"],
    ["New", "기존 문서에 없던 기능 확인 필요", "현재 코드/매뉴얼에서 신규 기능 후보 확인", "신규 기능 설명 및 제한사항 추가"],
    ["Removed", "이전 문서에 있던 기능 확인 필요", "현재 자료에서 보이지 않는 기능 확인", "삭제 기능은 제출 문안에서 제거"],
    ["Unknown", "성능/안전/시험 결과 근거 부족", "첨부 자료만으로 확정 불가", "[확인 필요: 시험 결과표/검증 로그]"],
  ];
  const blocks = [
    headingBlock(0, 1, `${profile.product_name || state.project.title || "현재 프로그램"} 인허가 문서 초안`),
    paragraphBlock(1, `${fallbackReason ? `Gemini 생성 실패 사유: ${fallbackReason}\n` : ""}본 초안은 첨부파일을 브라우저에서 읽어 생성한 인허가 문서 검토용 초안입니다. 참조파일이 있으면 해당 문서의 목차·문체·표 구성을 결과물 형식 기준으로 반영합니다. 규제/안전/성능/시험 결과는 제공된 근거 범위 내에서만 반영하며, 확인되지 않은 항목은 [확인 필요: ...]로 표시했습니다.`),
    headingBlock(2, 2, "0. 참조파일 형식 반영 기준"),
    tableBlock(3, "참조파일 형식 기준", ["파일명", "형식", "크기", "반영할 형식 요소"], referenceRows.length ? referenceRows : [["참조파일 없음", "-", "-", "기본 인허가 문서 구조로 생성"]]),
    headingBlock(4, 2, "1. Intake / 입력 자료 분류"),
    tableBlock(5, "첨부 자료 분류", ["파일명", "분류", "형식", "크기", "요약"], inventoryRows),
    headingBlock(6, 2, "2. 사용자 입력 제약"),
    tableBlock(7, "현재 버전 기본 정보", ["항목", "내용"], [
      ["프로그램명", profile.product_name || "[확인 필요: 현재 프로그램명]"],
      ["SW 버전/빌드", profile.software_version || "[확인 필요: SW 버전/빌드]"],
      ["대상 장비/하드웨어", profile.target_hardware || "[확인 필요: 대상 장비/하드웨어]"],
      ["대상 규제/기관", profile.target_regulator || "[확인 필요: 대상 규제/기관]"],
      ["사용 목적", profile.intended_use || "[확인 필요: 사용 목적]"],
    ]),
    headingBlock(8, 2, "3. Reference Structure"),
    paragraphBlock(9, "기존 승인/참조 문서가 첨부된 경우 섹션 순서, 반복 공식 문구, 안전 주의 문구, 정의, 시험 방법 문구를 유지 대상으로 검토해야 합니다. 기존 문서가 없거나 식별되지 않으면 [확인 필요: prior approved/reference document]로 남겨야 합니다."),
    headingBlock(10, 2, "4. Current Evidence Map"),
    tableBlock(11, "Android/현재 자료 근거 맵", ["구분", "추출 근거", "검토 포인트"], androidRows.length ? androidRows : [["현재 근거", "Android 프로젝트 ZIP 또는 매뉴얼/스크린샷 필요", "[확인 필요: 현재 화면/기능 근거]" ]]),
    headingBlock(12, 2, "5. Change Map"),
    tableBlock(13, "Old vs Current 변경 맵", ["Area", "Prior document", "Current evidence", "Action"], changeRows),
    headingBlock(14, 2, "6. Submission-ready Draft"),
    paragraphBlock(15, `제품명 ${profile.product_name || "[확인 필요: 프로그램명]"}의 현재 버전 소프트웨어는 ${profile.target_hardware || "[확인 필요: 대상 장비]"}와 함께 사용되는 소프트웨어로, ${profile.intended_use || "[확인 필요: 사용 목적]"}을 지원합니다. 본 문안은 첨부 자료 기준 초안이며, 최종 제출 전 기존 승인 문서의 공식 문구와 시험 결과표를 대조해야 합니다.`),
    headingBlock(16, 2, "7. 검토 메모"),
    tableBlock(17, "확인 필요 항목", ["항목", "필요 근거", "우선순위"], missingRows),
    tableBlock(18, "사용한 근거 파일", ["파일명", "근거 유형", "비고"], inventoryRows.map(row => [row[0], row[1], row[4]])),
  ];
  return { title: `${profile.product_name || state.project.title || "현재 프로그램"} 인허가 문서 초안`, blocks };
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
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
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
  zip.folder("word").folder("_rels").file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
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
  const bodyXml = draftToWordBodyXml(draft);
  zip.folder("word").file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function draftToWordBodyXml(draft) {
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
      gemini_model: !saved.gemini_model || saved.gemini_model === "gemini-2.5-flash" ? DEFAULT_MODEL : saved.gemini_model,
      document_mode: saved.document_mode || DEFAULT_DOCUMENT_MODE,
      product_name: saved.product_name || "",
      software_version: saved.software_version || "",
      target_hardware: saved.target_hardware || "",
      target_regulator: saved.target_regulator || "",
      intended_use: saved.intended_use || "",
    };
  } catch {
    return { gemini_api_key: "", gemini_model: DEFAULT_MODEL, document_mode: DEFAULT_DOCUMENT_MODE, product_name: "", software_version: "", target_hardware: "", target_regulator: "", intended_use: "" };
  }
}

function saveSettingsToStorage(settings) {
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify({
    gemini_api_key: settings.gemini_api_key || "",
    gemini_model: settings.gemini_model || DEFAULT_MODEL,
    document_mode: settings.document_mode || DEFAULT_DOCUMENT_MODE,
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
      "아래 파일은 결과물의 목차, 문체, 표 구성, 검토 메모 형식을 맞추기 위한 기준입니다. 현재 버전 사실관계는 첨부파일 근거가 있을 때만 반영하세요.",
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
  const text = String(file.text || "").slice(0, 6000).toLowerCase();
  if (file.extension === ".zip" || /androidmanifest\.xml|build\.gradle|res\/values|class .*activity|fun oncreate|extends activity/.test(text)) return "Current Android project evidence";
  if (/test|검증|시험|result|결과|validation|verification|로그/.test(name + " " + text)) return "Test notes/results";
  if (/manual|매뉴얼|사용자|화면|스크린샷|guide|procedure|절차/.test(name + " " + text)) return "Current manual/screenshots";
  if (/인허가|허가|승인|reference|prior|기존|previous|품목|의료기기|regulatory/.test(name + " " + text)) return "Reference regulatory document";
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
