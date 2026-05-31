import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as yaml from "js-yaml";
import { readConfigYaml, writeConfigYaml } from "@renderer/lib/hermes-tauri";
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Refresh,
  Trash,
  Save,
  Check,
} from "../../../assets/icons";

interface RawYamlTabProps {
  profile?: string;
}

const WARNING_BANNER =
  "Changes made here overwrite the entire config file. For individual setting changes, use the visual tabs. Model/Provider configuration should be managed in the Models page.";

function RawYamlTab({ profile }: RawYamlTabProps): React.JSX.Element {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [yamlError, setYamlError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [showWarning, setShowWarning] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const result = await readConfigYaml(profile);
      setContent(result.content);
      setOriginal(result.content);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  // Validate YAML
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

  // Focus search input
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
    const charOffset = content
      .split("\n")
      .slice(0, line)
      .join("\n").length;
    const lineEnd =
      charOffset + (content.split("\n")[line]?.length ?? 0);
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

  // Keyboard shortcuts
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
      if (!value.toLowerCase().includes(searchQuery.toLowerCase())) {
        setSearchQuery("");
      }
    }
  }

  const dirty = content !== original;

  // Outline: extract top-level YAML keys
  const outline = useMemo(() => {
    if (!content) return [];
    const lines = content.split("\n");
    const keys: Array<{ key: string; line: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
      if (m) {
        keys.push({ key: m[1], line: i });
      }
    }
    return keys;
  }, [content]);

  async function handleSave(): Promise<void> {
    if (yamlError) {
      setError(
        `YAML Error: ${yamlError.split("\n")[0]}`,
      );
      return;
    }
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
      <div className="config-tab-content">
        <div className="config-editor-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="config-tab-content config-tab-fill">
      {/* Warning Banner */}
      {showWarning && (
        <div className="config-warning-banner">
          <div className="config-warning-banner-content">
            <span className="config-warning-banner-icon">&#9888;</span>
            <span className="config-warning-banner-text">{WARNING_BANNER}</span>
          </div>
          <button
            className="config-warning-banner-close"
            onClick={() => setShowWarning(false)}
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="config-yaml-header">
        <div className="config-yaml-header-left">
          <button
            className="config-editor-search-btn"
            onClick={() => setSearchOpen(!searchOpen)}
            title="Ctrl+F"
          >
            <Search size={15} />
          </button>
        </div>
        <div className="config-editor-header-actions">
          <button
            className="btn btn-secondary"
            onClick={load}
            disabled={saving}
          >
            <Refresh size={14} style={{ marginRight: 4 }} />
            Reload
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={!dirty || saving}
          >
            <Trash size={14} style={{ marginRight: 4 }} />
            Discard
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={(!dirty && !saving) || !!yamlError}
          >
            {saving ? (
              <span>Saving...</span>
            ) : saved ? (
              <>
                <Check size={14} style={{ marginRight: 4 }} />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Save size={14} style={{ marginRight: 4 }} />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {searchOpen && (
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
            placeholder="Search..."
            spellCheck={false}
          />
          {searchQuery && (
            <>
              <span className="config-editor-search-count">
                {searchMatches.length > 0
                  ? `${searchIndex + 1} / ${searchMatches.length}`
                  : "No matches"}
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

      {/* Errors */}
      {(error || yamlError) && (
        <div className="config-editor-error">
          <span>
            {error || `YAML Error: ${yamlError.split("\n")[0]}`}
          </span>
          <button className="btn-ghost" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      {/* Editor Body */}
      <div className="config-editor-body">
        {outline.length > 0 && (
          <nav className="config-outline">
            {outline.map(({ key, line }) => (
              <button
                key={key}
                className="config-outline-item"
                onClick={() => scrollToLine(line)}
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

      {/* Footer */}
      {dirty && (
        <div className="config-yaml-footer">
          <span className="config-yaml-footer-text">
            You have unsaved changes.
          </span>
        </div>
      )}
    </div>
  );
}

export default RawYamlTab;
