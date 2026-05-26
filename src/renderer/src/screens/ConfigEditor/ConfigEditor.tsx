import { readConfigYaml, writeConfigYaml } from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as yaml from "js-yaml";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { useI18n } from "../../components/useI18n";

interface ConfigEditorProps {
  profile?: string;
}

type ViewMode = "yaml" | "structured";

const FOCUSED_TOP_KEYS = [
  "model",
  "model_aliases",
  "providers",
  "fallback_providers",
  "display",
  "approvals",
] as const;

const FOCUSED_TOP_KEY_SET = new Set<string>(FOCUSED_TOP_KEYS);

const COMMON_TYPOS: Record<string, string> = {
  fallback_provider: "fallback_providers",
  model_alias: "model_aliases",
  provider: "providers",
  fallback: "fallback_providers",
  approval: "approvals",
};

function ConfigEditor({ profile }: ConfigEditorProps): React.JSX.Element {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [yamlError, setYamlError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("yaml");
  const [outlineActive, setOutlineActive] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const result = await readConfigYaml(profile);
      setContent(result.content);
      setOriginal(result.content);
      setPath(result.path);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (content) {
      try {
        yaml.load(content);
        setYamlError("");
      } catch (err: any) {
        setYamlError(err.message);
      }
    } else {
      setYamlError("");
    }
  }, [content]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const searchMatches = useMemo(() => {
    if (!searchQuery) return [];
    const matches: number[] = [];
    const lines = content.split("\n");
    const q = searchQuery.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        matches.push(i);
      }
    }
    return matches;
  }, [content, searchQuery]);

  useEffect(() => {
    if (searchMatches.length > 0 && searchIndex >= searchMatches.length) {
      setSearchIndex(0);
    }
  }, [searchMatches.length, searchIndex]);

  function scrollToLine(line: number): void {
    const ta = textareaRef.current;
    if (!ta) return;
    const lineCount = content.split("\n").length;
    if (line >= lineCount) return;
    const lineH = ta.scrollHeight / lineCount;
    ta.scrollTop = line * lineH - ta.clientHeight / 2;
    const charOffset = content.split("\n").slice(0, line).join("\n").length;
    const lineEnd = charOffset + (content.split("\n")[line]?.length ?? 0);
    ta.focus();
    ta.setSelectionRange(charOffset, lineEnd);
  }

  function handleSearchNav(direction: 1 | -1): void {
    if (searchMatches.length === 0) return;
    let next = searchIndex + direction;
    if (next < 0) next = searchMatches.length - 1;
    if (next >= searchMatches.length) next = 0;
    setSearchIndex(next);
    scrollToLine(searchMatches[next]);
  }

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) {
        e.preventDefault();
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    ta.addEventListener("keydown", handler);
    return () => ta.removeEventListener("keydown", handler);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || !searchInputRef.current) return;
    const input = searchInputRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearchNav(e.shiftKey ? -1 : 1);
      }
    };
    input.addEventListener("keydown", handler);
    return () => input.removeEventListener("keydown", handler);
  }, [searchOpen, searchMatches, searchIndex]);

  function handleReset(): void {
    setContent(original);
    setError("");
    setSaved(false);
  }

  function handleTextChange(value: string): void {
    setContent(value);
    setSaved(false);
    if (searchQuery && value) {
      const q = searchQuery.toLowerCase();
      if (!value.toLowerCase().includes(q)) {
        setSearchQuery("");
      }
    }
  }

  const dirty = content !== original;

  // ── Outline: extract top-level YAML keys and their line numbers ──
  const outline = useMemo(() => {
    if (!content) return [];
    const lines = content.split("\n");
    const keys: Array<{ key: string; line: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
      if (m && FOCUSED_TOP_KEY_SET.has(m[1])) {
        keys.push({ key: m[1], line: i });
      }
    }
    return keys;
  }, [content]);

  function handleOutlineClick(line: number, key: string): void {
    setOutlineActive(key);
    if (viewMode === "yaml") {
      scrollToLine(line);
    }
  }

  // ── Structured view: parse YAML into sections ──
  const parsedYaml = useMemo(() => {
    if (!content) return null;
    try {
      return yaml.load(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [content]);

  // ── Diff: compute changed top-level keys ──
  const diffKeys = useMemo(() => {
    if (!dirty || !content || !original) return [];
    let parsedContent: Record<string, unknown>;
    let parsedOriginal: Record<string, unknown>;
    try {
      parsedContent = (yaml.load(content) as Record<string, unknown>) || {};
      parsedOriginal = (yaml.load(original) as Record<string, unknown>) || {};
    } catch {
      return [];
    }
    const allKeys = new Set([
      ...Object.keys(parsedContent),
      ...Object.keys(parsedOriginal),
    ]);
    const changed: string[] = [];
    for (const k of allKeys) {
      const cv = yaml.dump(parsedContent[k], { lineWidth: -1, noRefs: true });
      const ov = yaml.dump(parsedOriginal[k], { lineWidth: -1, noRefs: true });
      if (cv !== ov) changed.push(k);
    }
    return changed;
  }, [content, original, dirty]);

  // ── Schema hints: detect common miskeys ──
  const schemaHints = useMemo(() => {
    if (!parsedYaml) return [];
    const hints: Array<{ key: string; suggestion: string }> = [];
    for (const k of Object.keys(parsedYaml)) {
      if (COMMON_TYPOS[k]) {
        hints.push({ key: k, suggestion: `Did you mean "${COMMON_TYPOS[k]}"?` });
      }
    }
    return hints;
  }, [parsedYaml]);

  async function handleSave(): Promise<void> {
    if (yamlError) {
      setError(t("config.yamlError", { message: yamlError.split("\n")[0] }));
      return;
    }
    if (dirty && diffKeys.length > 0 && !showDiff) {
      setShowDiff(true);
      return;
    }
    setShowDiff(false);
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await writeConfigYaml(content, profile);
      setOriginal(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="config-editor-container">
        <div className="config-editor-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="config-editor-container">
      <div className="config-editor-header">
        <div className="config-editor-header-left">
          <h2 className="config-editor-title">{t("config.title")}</h2>
          <span className="config-editor-path">{path}</span>
        </div>
        <div className="config-editor-header-actions">
          <div className="config-view-toggle">
            <button
              className={`config-view-btn ${viewMode === "structured" ? "active" : ""}`}
              onClick={() => setViewMode("structured")}
            >
              {t("config.viewStructured", { defaultValue: "Structured" })}
            </button>
            <button
              className={`config-view-btn ${viewMode === "yaml" ? "active" : ""}`}
              onClick={() => setViewMode("yaml")}
            >
              YAML
            </button>
          </div>
          {viewMode === "yaml" && (
            <button
              className="btn btn-ghost config-editor-search-btn"
              onClick={() => setSearchOpen(!searchOpen)}
              title="Ctrl+F"
            >
              <Search size={15} />
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={load}
            disabled={saving}
          >
            {t("config.reload")}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={!dirty || saving}
          >
            {t("config.discard")}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? t("config.saving") : saved ? t("config.saved") : t("config.save")}
          </button>
        </div>
      </div>

      {searchOpen && viewMode === "yaml" && (
        <div className="config-editor-search">
          <Search size={14} className="config-editor-search-icon" />
          <input
            ref={searchInputRef}
            className="config-editor-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchIndex(0);
            }}
            placeholder={t("config.searchPlaceholder")}
            spellCheck={false}
          />
          {searchQuery && (
            <>
              <span className="config-editor-search-count">
                {searchMatches.length > 0
                  ? t("config.matchCount", { current: searchIndex + 1, total: searchMatches.length })
                  : t("config.noMatch")}
              </span>
              <button
                className="btn-ghost config-editor-search-nav"
                onClick={() => handleSearchNav(-1)}
                disabled={searchMatches.length === 0}
              >
                <ChevronUp size={14} />
              </button>
              <button
                className="btn-ghost config-editor-search-nav"
                onClick={() => handleSearchNav(1)}
                disabled={searchMatches.length === 0}
              >
                <ChevronDown size={14} />
              </button>
            </>
          )}
          <button
            className="btn-ghost config-editor-search-close"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {(error || yamlError) && (
        <div className="config-editor-error">
          <span>
            {error || t("config.yamlError", { message: yamlError.split("\n")[0] })}
          </span>
          <button className="btn-ghost" onClick={() => setError("")}>×</button>
        </div>
      )}

      {schemaHints.length > 0 && (
        <div className="config-schema-hints">
          {schemaHints.map((h) => (
            <div key={h.key} className="config-schema-hint">
              <span className="config-schema-hint-key">{h.key}</span>
              <span className="config-schema-hint-msg">{h.suggestion}</span>
            </div>
          ))}
        </div>
      )}

      {showDiff && diffKeys.length > 0 && (
        <div className="config-diff-preview">
          <div className="config-diff-title">
            {t("config.diffTitle", { defaultValue: "Changes to save" })}
          </div>
          <div className="config-diff-keys">
            {diffKeys.map((k) => (
              <span key={k} className="config-diff-key">{k}</span>
            ))}
          </div>
          <div className="config-diff-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setShowDiff(false);
                setSaving(true);
                setError("");
                writeConfigYaml(content, profile)
                  .then(() => {
                    setOriginal(content);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  })
                  .catch((err) => setError(String(err)))
                  .finally(() => setSaving(false));
              }}
            >
              {t("config.confirmSave", { defaultValue: "Confirm Save" })}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowDiff(false)}
            >
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </div>
      )}

      {viewMode === "yaml" ? (
        <div className="config-editor-body">
          {outline.length > 0 && (
            <nav className="config-outline">
              {outline.map(({ key, line }) => (
                <button
                  key={key}
                  className={`config-outline-item ${outlineActive === key ? "active" : ""}`}
                  onClick={() => handleOutlineClick(line, key)}
                >
                  {key}
                </button>
              ))}
            </nav>
          )}
          <textarea
            ref={textareaRef}
            className="config-editor-textarea"
            value={content}
            onChange={(e) => handleTextChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
      ) : (
        <div className="config-editor-body config-structured">
          {outline.length === 0 && (
            <div className="config-structured-empty">
              {t("config.emptyConfig", { defaultValue: "No supported sections found." })}
            </div>
          )}
          {outline.map(({ key }) => {
            const value = parsedYaml?.[key];
            return (
              <div key={key} className="config-structured-section">
                <div className="config-structured-section-header">
                  <span className="config-structured-section-key">{key}</span>
                  <button
                    className="btn-ghost config-structured-goto"
                    onClick={() => {
                      const line = outline.find((o) => o.key === key)?.line ?? 0;
                      setViewMode("yaml");
                      setTimeout(() => {
                        setOutlineActive(key);
                        scrollToLine(line);
                      }, 50);
                    }}
                  >
                    {t("config.gotoYaml", { defaultValue: "View YAML" })}
                  </button>
                </div>
                {FOCUSED_TOP_KEY_SET.has(key) && value != null ? (
                  <StructuredBlock
                    sectionKey={key}
                    value={value}
                    onUpdate={(newValue) => {
                      if (!parsedYaml) return;
                      const updated = { ...parsedYaml, [key]: newValue };
                      setContent(yaml.dump(updated, { lineWidth: -1, noRefs: true }));
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ConfigEditor;

/* ── Structured block editor for common config sections ── */

function StructuredBlock({
  sectionKey,
  value,
  onUpdate,
}: {
  sectionKey: string;
  value: unknown;
  onUpdate: (newValue: unknown) => void;
}): React.JSX.Element {
  if (sectionKey === "model" && typeof value === "object" && value !== null) {
    return <ModelBlock value={value as Record<string, unknown>} onUpdate={onUpdate} />;
  }
  if (
    sectionKey === "model_aliases" &&
    typeof value === "object" &&
    value !== null
  ) {
    return <AliasBlock value={value as Record<string, unknown>} />;
  }
  if (sectionKey === "fallback_providers" && Array.isArray(value)) {
    return <FallbackBlock value={value} onUpdate={onUpdate} />;
  }
  if (
    (sectionKey === "display" || sectionKey === "approvals") &&
    typeof value === "object" &&
    value !== null
  ) {
    return <ScalarMapBlock value={value as Record<string, unknown>} onUpdate={onUpdate} />;
  }
  if (sectionKey === "providers" && typeof value === "object" && value !== null) {
    return <ProvidersBlock value={value as Record<string, unknown>} onUpdate={onUpdate} />;
  }
  return (
    <pre className="config-structured-raw">
      {yaml.dump(value, { lineWidth: -1, noRefs: true })}
    </pre>
  );
}

function ModelBlock({
  value,
  onUpdate,
}: {
  value: Record<string, unknown>;
  onUpdate: (v: unknown) => void;
}): React.JSX.Element {
  const fields = ["default", "provider", "base_url", "max_tokens"];
  return (
    <div className="config-struct-fields">
      {fields.map((f) => (
        <div key={f} className="config-struct-field">
          <label className="config-struct-label">{f}</label>
          <input
            className="input config-struct-input"
            type={f === "max_tokens" ? "number" : "text"}
            value={String(value[f] ?? "")}
            onChange={(e) =>
              onUpdate({ ...value, [f]: e.target.value })
            }
            placeholder={f}
          />
        </div>
      ))}
    </div>
  );
}

function AliasBlock({
  value,
}: {
  value: Record<string, unknown>;
}): React.JSX.Element {
  const entries = Object.entries(value);
  return (
    <div className="config-struct-alias-list">
      {entries.map(([alias, config]) => (
        <div key={alias} className="config-struct-alias-row">
          <span className="config-struct-alias-name">{alias}</span>
          <span className="config-struct-alias-arrow">→</span>
          <span className="config-struct-alias-value">
            {typeof config === "string"
              ? config
              : yaml.dump(config, { lineWidth: -1, noRefs: true }).trim()}
          </span>
        </div>
      ))}
      {entries.length === 0 && (
        <div className="config-struct-empty">{t2("config.noAliases", { defaultValue: "No aliases configured" })}</div>
      )}
    </div>
  );
}

function t2(key: string, opts?: Record<string, unknown>): string {
  return opts?.defaultValue as string || key;
}

function FallbackBlock({
  value,
  onUpdate,
}: {
  value: unknown[];
  onUpdate: (v: unknown) => void;
}): React.JSX.Element {
  return (
    <div className="config-struct-fallback-list">
      {(value as Array<Record<string, unknown>>).map((fb, i) => (
        <div key={i} className="config-struct-fallback-row">
          <span className="config-struct-fallback-idx">{i + 1}</span>
          <span className="config-struct-fallback-model">{String(fb.model ?? "")}</span>
          <span className="config-struct-fallback-provider">{String(fb.provider ?? "")}</span>
          <button
            className="btn-ghost config-struct-fallback-remove"
            onClick={() => onUpdate(value.filter((_, idx) => idx !== i))}
          >
            ×
          </button>
        </div>
      ))}
      {value.length === 0 && (
        <div className="config-struct-empty">No fallback providers</div>
      )}
    </div>
  );
}

function ScalarMapBlock({
  value,
  onUpdate,
}: {
  value: Record<string, unknown>;
  onUpdate: (v: unknown) => void;
}): React.JSX.Element {
  return (
    <div className="config-struct-fields">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className="config-struct-field">
          <label className="config-struct-label">{k}</label>
          <input
            className="input config-struct-input"
            type="text"
            value={String(v)}
            onChange={(e) =>
              onUpdate({ ...value, [k]: e.target.value })
            }
          />
        </div>
      ))}
      {Object.keys(value).length === 0 && (
        <div className="config-struct-empty">No entries</div>
      )}
    </div>
  );
}

function ProvidersBlock({
  value,
  onUpdate,
}: {
  value: Record<string, unknown>;
  onUpdate: (v: unknown) => void;
}): React.JSX.Element {
  function handleProviderFieldChange(
    provName: string,
    field: string,
    fieldValue: string,
  ): void {
    const next = { ...value };
    const prov = { ...(next[provName] as Record<string, unknown> || {}) };
    prov[field] = fieldValue;
    next[provName] = prov;
    onUpdate(next);
  }

  function handleModelChange(
    provName: string,
    oldModelId: string,
    newModelId: string,
    newConfig: Record<string, unknown>,
  ): void {
    const next = { ...value };
    const prov = { ...(next[provName] as Record<string, unknown> || {}) };
    const models = { ...(prov.models as Record<string, unknown> || {}) };
    if (oldModelId !== newModelId) delete models[oldModelId];
    models[newModelId] = newConfig;
    prov.models = models;
    next[provName] = prov;
    onUpdate(next);
  }

  function handleAddModel(provName: string): void {
    const next = { ...value };
    const prov = { ...(next[provName] as Record<string, unknown> || {}) };
    const models = { ...(prov.models as Record<string, unknown> || {}) };
    const baseId = "new-model";
    let id = baseId;
    let n = 1;
    while (models[id]) {
      n++;
      id = `${baseId}-${n}`;
    }
    models[id] = {};
    prov.models = models;
    next[provName] = prov;
    onUpdate(next);
  }

  function handleRemoveModel(provName: string, modelId: string): void {
    const next = { ...value };
    const prov = { ...(next[provName] as Record<string, unknown> || {}) };
    const models = { ...(prov.models as Record<string, unknown> || {}) };
    delete models[modelId];
    prov.models = models;
    next[provName] = prov;
    onUpdate(next);
  }

  function handleRemoveProvider(provName: string): void {
    const next = { ...value };
    delete next[provName];
    onUpdate(next);
  }

  return (
    <div className="config-struct-providers">
      {Object.entries(value).map(([name, config]) => {
        const prov = config as Record<string, unknown>;
        const models = (prov.models || {}) as Record<string, unknown>;
        const baseUrl = String(prov.base_url ?? "");
        const modelEntries = Object.entries(models);
        return (
          <div key={name} className="config-struct-provider-card">
            <div className="config-struct-provider-header">
              <span className="config-struct-provider-name">{name}</span>
              <button
                className="btn-ghost config-struct-provider-remove"
                onClick={() => handleRemoveProvider(name)}
                title="Remove provider"
              >
                ×
              </button>
            </div>
            <div className="config-struct-fields">
              <div className="config-struct-field">
                <label className="config-struct-label">base_url</label>
                <input
                  className="input config-struct-input"
                  type="text"
                  value={baseUrl}
                  onChange={(e) =>
                    handleProviderFieldChange(name, "base_url", e.target.value)
                  }
                  placeholder="https://api.example.com/v1"
                />
              </div>
            </div>
            {modelEntries.length > 0 && (
              <div className="config-struct-provider-models">
                <div className="config-struct-provider-models-label">
                  Models ({modelEntries.length})
                </div>
                {modelEntries.map(([modelId, modelConfig]) => (
                  <div key={modelId} className="config-struct-model-row">
                    <input
                      className="input config-struct-model-id"
                      type="text"
                      value={modelId}
                      onChange={(e) =>
                        handleModelChange(
                          name,
                          modelId,
                          e.target.value,
                          (modelConfig || {}) as Record<string, unknown>,
                        )
                      }
                    />
                    <button
                      className="btn-ghost config-struct-model-remove"
                      onClick={() => handleRemoveModel(name, modelId)}
                      title="Remove model"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleAddModel(name)}
              style={{ marginTop: 6 }}
            >
              + Model
            </button>
          </div>
        );
      })}
      {Object.keys(value).length === 0 && (
        <div className="config-struct-empty">No providers configured</div>
      )}
    </div>
  );
}
