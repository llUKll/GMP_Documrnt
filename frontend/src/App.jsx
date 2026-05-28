import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

function App() {
  const [project, setProject] = useState(null);
  const [title, setTitle] = useState("팀 내부 분석 문서");
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [status, setStatus] = useState("");
  const [toasts, setToasts] = useState([]);
  const [settings, setSettings] = useState({ has_gemini_api_key: false, gemini_model: "gemini-2.5-pro" });
  const [limits, setLimits] = useState({
    supported_extensions: [".docx", ".pdf", ".xlsx", ".txt", ".md", ".csv", ".zip", ".hwpx", ".hwp", ".kt", ".java", ".xml", ".gradle", ".kts", ".json", ".yml", ".yaml"],
    max_files_per_project: 10,
    max_file_size_bytes: 200 * 1024 * 1024,
    max_file_size_label: "200MB",
  });
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-pro");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");
    const shareToken = params.get("share");
    if (projectId) {
      loadProject(projectId);
    } else if (shareToken) {
      loadSharedProject(shareToken);
    }
    loadSettings();
  }, []);

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || "요청 처리에 실패했습니다.");
    }
    return response.json();
  }

  function notify(type, titleText, message) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, type, title: titleText, message }].slice(-4));
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, type === "error" ? 10000 : 8000);
  }

  function beginWork(message) {
    setBusy(true);
    setBusyMessage(message);
    setStatus(message);
    notify("info", "진행 중", message);
  }

  function finishWork(message) {
    setStatus(message);
    notify("success", "완료", message);
  }

  function failWork(error) {
    const message = error.message || "요청 처리에 실패했습니다.";
    setStatus(message);
    notify("error", "오류", message);
  }

  function endWork() {
    setBusy(false);
    setBusyMessage("");
  }

  async function createProject() {
    beginWork("프로젝트를 만드는 중입니다.");
    try {
      const data = await request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setProject(data.project);
      window.history.replaceState({}, "", `?project=${data.project.id}`);
      finishWork("프로젝트가 준비되었습니다.");
    } catch (error) {
      failWork(error);
    } finally {
      endWork();
    }
  }

  async function loadProject(projectId) {
    setBusy(true);
    try {
      const data = await request(`/api/projects/${projectId}`);
      setProject(data.project);
      setTitle(data.project.title);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSharedProject(shareToken) {
    setBusy(true);
    try {
      const data = await request(`/api/share/${shareToken}`);
      setProject(data.project);
      setTitle(data.project.title);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadSettings() {
    try {
      const [data, uploadLimits] = await Promise.all([
        request("/api/settings"),
        request("/api/upload-limits"),
      ]);
      setSettings(data);
      setLimits(uploadLimits);
      setGeminiModel(data.gemini_model);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function saveSettings() {
    beginWork("Gemini 설정을 저장하는 중입니다.");
    try {
      const payload = { gemini_model: geminiModel };
      if (geminiKey.trim()) payload.gemini_api_key = geminiKey.trim();
      const data = await request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings(data);
      setGeminiKey("");
      finishWork(data.gemini_check_message || "Gemini 확인 후 설정이 저장되었습니다.");
    } catch (error) {
      failWork(error);
    } finally {
      endWork();
    }
  }

  async function uploadFiles(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const validation = validateSelectedFiles(files);
    if (validation) {
      notify("error", "업로드 제한", validation);
      event.target.value = "";
      return;
    }
    beginWork("파일을 업로드하는 중입니다.");
    try {
      let current = project;
      if (!current) {
        setStatus("프로젝트를 만든 뒤 파일을 업로드하는 중입니다.");
        const created = await request("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        current = created.project;
        window.history.replaceState({}, "", `?project=${created.project.id}`);
      }
      for (const file of files) {
        setStatus(`${file.name} 파일을 업로드하고 파싱하는 중입니다.`);
        const formData = new FormData();
        formData.append("file", file);
        const data = await request(`/api/projects/${current.id}/files`, {
          method: "POST",
          body: formData,
        });
        current = data.project;
      }
      setProject(current);
      finishWork("첨부파일 파싱이 끝났습니다.");
    } catch (error) {
      failWork(error);
    } finally {
      event.target.value = "";
      endWork();
    }
  }

  function validateSelectedFiles(files) {
    const currentCount = project?.files?.length || 0;
    if (currentCount + files.length > limits.max_files_per_project) {
      return `프로젝트당 첨부파일은 최대 ${limits.max_files_per_project}개까지 분석할 수 있습니다. 현재 ${currentCount}개, 추가 선택 ${files.length}개입니다.`;
    }
    const supported = new Set(limits.supported_extensions.map((item) => item.toLowerCase()));
    for (const file of files) {
      const suffix = `.${file.name.split(".").pop() || ""}`.toLowerCase();
      if (!supported.has(suffix)) {
        return `${file.name}은 지원하지 않는 형식입니다. 지원 형식: ${limits.supported_extensions.join(", ")}`;
      }
      if (file.size > limits.max_file_size_bytes) {
        return `${file.name}의 용량이 너무 큽니다. 파일당 최대 ${limits.max_file_size_label}까지 가능합니다.`;
      }
    }
    return "";
  }

  async function analyze() {
    if (!project) return;
    beginWork("첨부파일 기반 초안을 생성하는 중입니다.");
    try {
      const data = await request(`/api/projects/${project.id}/analyze`, { method: "POST" });
      setProject(data.project);
      finishWork("초안이 생성되었습니다. 편집 후 Word로 다운로드할 수 있습니다.");
    } catch (error) {
      failWork(error);
    } finally {
      endWork();
    }
  }

  async function saveDraft(nextDraft) {
    if (!project?.draft) return;
    beginWork("Gemini가 초안을 검토한 뒤 저장하는 중입니다.");
    try {
      const data = await request(`/api/projects/${project.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextDraft),
      });
      setProject(data.project);
      finishWork(data.message || "초안이 저장되었습니다.");
    } catch (error) {
      failWork(error);
    } finally {
      endWork();
    }
  }

  async function downloadDocx() {
    if (!project?.draft) return;
    beginWork("Word 문서를 생성하는 중입니다.");
    try {
      const response = await fetch(`${API_BASE}/api/projects/${project.id}/export/docx`, { method: "POST" });
      if (!response.ok) throw new Error("Word 다운로드 생성에 실패했습니다.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.draft.title}.docx`;
      link.click();
      URL.revokeObjectURL(url);
      finishWork("Word 다운로드를 시작했습니다.");
    } catch (error) {
      failWork(error);
    } finally {
      endWork();
    }
  }

  const shareUrl = useMemo(() => {
    if (!project) return "";
    return `${window.location.origin}${window.location.pathname}?share=${project.share_token}`;
  }, [project]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">DI</span>
          <div>
            <h1>Document Insight OS</h1>
            <p>첨부파일을 문서 초안으로 변환</p>
          </div>
        </div>

        <section className="panel">
          <label className="label" htmlFor="title">프로젝트 이름</label>
          <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <button onClick={createProject} disabled={busy}>{project ? "새 프로젝트" : "프로젝트 만들기"}</button>
        </section>

        <section className="panel">
          <label className="label" htmlFor="gemini-key">Gemini API Key</label>
          <input
            id="gemini-key"
            type="password"
            placeholder={settings.has_gemini_api_key ? "저장된 키 사용 중" : "AIza..."}
            value={geminiKey}
            onChange={(event) => setGeminiKey(event.target.value)}
          />
          <label className="label" htmlFor="gemini-model">Gemini 모델 선택</label>
          <select id="gemini-model" value={geminiModel} onChange={(event) => setGeminiModel(event.target.value)}>
            <option value="gemini-2.5-pro">gemini-2.5-pro · 최고품질 / 이미지 분석·상세설계 권장</option>
            <option value="gemini-2.5-flash">gemini-2.5-flash · 속도/품질 균형</option>
            <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite · 간단 요약 / 저비용</option>
          </select>
          <button onClick={saveSettings} disabled={busy}>Gemini 설정 저장</button>
          <small>{settings.has_gemini_api_key ? "Gemini 분석이 켜져 있습니다." : "키가 없으면 로컬 분석기로 생성합니다."}</small>
        </section>

        <section className="panel">
          <label className="label" htmlFor="files">첨부파일</label>
          <p className="helper-text">분석에 사용할 엑셀, Word, PDF, HWPX/HWP, ZIP, Android 소스/설정 자료를 첨부하세요. ZIP 내부 파일도 근거 목록과 추출 텍스트로 반영합니다.</p>
          <div className="limit-grid">
            <span>지원 형식: {limits.supported_extensions.join(", ")}</span>
            <span>최대 개수: {project?.files?.length || 0}/{limits.max_files_per_project}개</span>
            <span>파일당 용량: {limits.max_file_size_label}</span>
          </div>
          <input id="files" type="file" multiple accept=".xlsx,.docx,.pdf,.txt,.md,.csv,.zip,.hwpx,.hwp,.png,.jpg,.jpeg,.webp,.kt,.java,.xml,.gradle,.kts,.json,.yml,.yaml" onChange={uploadFiles} disabled={busy} />
          <button onClick={analyze} disabled={!project || project.files.length === 0 || busy}>분석 및 초안 생성</button>
          <button className="secondary" onClick={downloadDocx} disabled={!project?.draft || busy}>Word 다운로드</button>
        </section>

        {project && (
          <section className="panel meta">
            <span>공유 링크</span>
            <button className="copy" onClick={async () => {
              await navigator.clipboard.writeText(shareUrl);
              notify("success", "복사 완료", "공유 링크를 클립보드에 복사했습니다.");
            }}>복사</button>
            <small>{shareUrl}</small>
          </section>
        )}

        <p className="status">{status || (busy ? "처리 중입니다." : "준비되었습니다.")}</p>
      </aside>

      <section className="workspace">
        <FileList project={project} />
        {project?.draft ? (
          <Editor draft={project.draft} onSave={saveDraft} />
        ) : (
          <EmptyState />
        )}
      </section>
      <ToastStack toasts={toasts} />
      {busy && <BusyOverlay message={busyMessage || status} />}
    </main>
  );
}

function ToastStack({ toasts }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast ${toast.type}`} key={toast.id}>
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

function BusyOverlay({ message }) {
  return (
    <div className="busy-overlay">
      <div className="busy-card">
        <span className="spinner" />
        <strong>처리 중</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

function FileList({ project }) {
  const files = project?.files || [];
  return (
    <section className="file-summary" aria-label="첨부파일 목록">
      <div className="section-heading">
        <div>
          <span className="eyebrow">첨부파일</span>
          <h2>문서 작성에 사용할 자료</h2>
        </div>
        <span className="count-badge">{files.length}개</span>
      </div>
      <p className="helper-text">파일명을 확인한 뒤 분석을 실행하세요. 파싱 실패 파일은 목록에 failed로 표시됩니다.</p>
      <div className="file-strip">
        {files.map((file) => (
          <div className="file-chip" key={file.id}>
            <span className="file-label">파일명</span>
            <strong title={file.filename}>{file.filename}</strong>
            <span className={file.parsed_status === "parsed" ? "ok" : "fail"}>{file.parsed_status}</span>
          </div>
        ))}
        {files.length === 0 && <span className="muted">아직 첨부파일이 없습니다. 왼쪽에서 파일을 선택하세요.</span>}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <h2>파일을 첨부하면 초안 편집기가 열립니다.</h2>
      <p>표, 차트, 다이어그램, 보고서 문단을 생성한 뒤 이 화면에서 직접 수정할 수 있습니다.</p>
    </div>
  );
}

function Editor({ draft, onSave }) {
  const [localDraft, setLocalDraft] = useState(draft);
  const [saving, setSaving] = useState(false);

  useEffect(() => setLocalDraft(draft), [draft]);

  function updateBlock(blockId, content) {
    setLocalDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, content } : block)),
    }));
  }

  function moveBlock(blockId, direction) {
    setLocalDraft((current) => {
      const blocks = [...current.blocks];
      const index = blocks.findIndex((block) => block.id === blockId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= blocks.length) return current;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...current, blocks: blocks.map((block, order) => ({ ...block, order })) };
    });
  }

  function deleteBlock(blockId) {
    setLocalDraft((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== blockId).map((block, order) => ({ ...block, order })),
    }));
  }

  async function persist() {
    setSaving(true);
    await onSave({ title: localDraft.title, blocks: localDraft.blocks });
    setSaving(false);
  }

  return (
    <article className="editor">
      <header className="editor-toolbar">
        <div className="title-field">
          <label htmlFor="draft-title">파일명</label>
          <input
            id="draft-title"
            className="doc-title"
            value={localDraft.title}
            onChange={(event) => setLocalDraft({ ...localDraft, title: event.target.value })}
          />
          <p className="helper-text">다운로드될 Word 문서의 파일명과 첫 제목으로 사용됩니다.</p>
        </div>
        <button className="save-button" onClick={persist}>{saving ? "검토 중" : "검토 및 저장"}</button>
      </header>

      <div className="paper">
        {[...localDraft.blocks].sort((a, b) => a.order - b.order).map((block) => (
          <BlockEditor
            key={block.id}
            block={block}
            onChange={(content) => updateBlock(block.id, content)}
            onMove={(direction) => moveBlock(block.id, direction)}
            onDelete={() => deleteBlock(block.id)}
          />
        ))}
      </div>
    </article>
  );
}

function BlockEditor({ block, onChange, onMove, onDelete }) {
  return (
    <section className="block">
      <div className="block-actions">
        <span>{block.type}</span>
        <button onClick={() => onMove(-1)} aria-label="위로 이동">↑</button>
        <button onClick={() => onMove(1)} aria-label="아래로 이동">↓</button>
        <button onClick={onDelete} aria-label="삭제">×</button>
      </div>
      {block.type === "heading" && (
        <input
          className={`heading h${block.content.level || 2}`}
          value={block.content.text || ""}
          onChange={(event) => onChange({ ...block.content, text: event.target.value })}
        />
      )}
      {block.type === "paragraph" && (
        <textarea
          className="paragraph"
          value={block.content.text || ""}
          onChange={(event) => onChange({ ...block.content, text: event.target.value })}
        />
      )}
      {block.type === "table" && <TableEditor content={block.content} onChange={onChange} />}
      {block.type === "chart" && <ChartEditor content={block.content} onChange={onChange} />}
      {block.type === "diagram" && <DiagramEditor content={block.content} onChange={onChange} />}
      {block.type === "image" && (
        <input value={block.content.alt || ""} onChange={(event) => onChange({ ...block.content, alt: event.target.value })} />
      )}
    </section>
  );
}

function TableEditor({ content, onChange }) {
  const headers = content.headers || [];
  const rows = content.rows || [];
  function setCell(rowIndex, cellIndex, value) {
    const nextRows = rows.map((row, index) =>
      index === rowIndex ? row.map((cell, column) => (column === cellIndex ? value : cell)) : row
    );
    onChange({ ...content, rows: nextRows });
  }
  return (
    <>
      <input className="caption" value={content.caption || ""} onChange={(event) => onChange({ ...content, caption: event.target.value })} />
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>
                    <input value={cell ?? ""} onChange={(event) => setCell(rowIndex, cellIndex, event.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ChartEditor({ content, onChange }) {
  const max = Math.max(...(content.values || []).map((item) => Number(item.value) || 0), 1);
  return (
    <div>
      <input className="caption" value={content.title || ""} onChange={(event) => onChange({ ...content, title: event.target.value })} />
      <div className="bars">
        {(content.values || []).map((item, index) => (
          <div className="bar-row" key={`${item.label}-${index}`}>
            <span>{item.label}</span>
            <div><i style={{ width: `${Math.max(4, ((Number(item.value) || 0) / max) * 100)}%` }} /></div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagramEditor({ content, onChange }) {
  return (
    <div>
      <input className="caption" value={content.title || ""} onChange={(event) => onChange({ ...content, title: event.target.value })} />
      <textarea className="code" value={content.code || ""} onChange={(event) => onChange({ ...content, code: event.target.value })} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
