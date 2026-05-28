import {
  readMemory,
  readSoul,
  resetSoul,
  writeMemory,
  writeSoul,
  writeUserProfile,
} from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useRef, useCallback } from "react";
import { Refresh } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";

type Tab = "soul" | "memory" | "user";

interface PersonaProps {
  profile?: string;
}

function Persona({ profile }: PersonaProps): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("soul");
  const [soulContent, setSoulContent] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [userContent, setUserContent] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    const [soul, mem] = await Promise.all([
      readSoul(profile),
      readMemory(profile),
    ]);
    setSoulContent(soul);
    setMemoryContent((mem as { memory: { content: string } }).memory.content);
    setUserContent((mem as { user: { content: string } }).user.content);
    setDraft(null);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getContent = (): string => {
    if (draft !== null) return draft;
    switch (tab) {
      case "soul":
        return soulContent;
      case "memory":
        return memoryContent;
      case "user":
        return userContent;
    }
  };

  const isEditing = draft !== null;

  function handleEdit(): void {
    setDraft(getContent());
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleCancel(): void {
    setDraft(null);
  }

  async function handleSave(): Promise<void> {
    if (draft === null) return;
    setSaving(true);
    if (tab === "soul") {
      await writeSoul(draft, profile);
      setSoulContent(draft);
    } else if (tab === "user") {
      await writeUserProfile(draft, profile);
      setUserContent(draft);
    } else {
      await writeMemory(draft, profile);
      setMemoryContent(draft);
    }
    setDraft(null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleResetSoul(): Promise<void> {
    const newContent = await resetSoul(profile);
    setSoulContent(newContent);
    setDraft(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div>
        <div className="soul-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  const charCounts: Record<Tab, number> = {
    soul: soulContent.length,
    memory: memoryContent.length,
    user: userContent.length,
  };

  const tabs: { key: Tab; label: string; file: string }[] = [
    { key: "soul", label: t("soul.title"), file: "soul.md" },
    { key: "memory", label: t("memory.agentMemory"), file: "memory.md" },
    { key: "user", label: t("memory.userProfile"), file: "user.md" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="soul-header" style={{ justifyContent: "flex-end", marginTop: 0, minHeight: 0, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flex: 1, justifyContent: "flex-end" }}>
          {saved && <span className="soul-saved">{t("common.saved")}</span>}
          {!isEditing && tab === "soul" && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleResetSoul}
              title={t("soul.resetTitle")}
            >
              <Refresh size={14} />
              {t("soul.reset")}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={loadData}>
            <Refresh size={14} />
          </button>
        </div>
      </div>

      <div className="pill-tabs" style={{ width: "100%", maxWidth: 600, display: "flex" }}>
        {tabs.map(({ key, label, file }) => (
          <button
            key={key}
            className={`pill-tab ${tab === key ? "active" : ""}`}
            style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}
            onClick={() => {
              if (isEditing) return;
              setTab(key);
            }}
            disabled={isEditing}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <span>{label}</span>
              <span className="persona-tab-file" style={{ marginLeft: 8, opacity: 0.6, fontSize: 11 }}>{file}</span>
            </div>
            <span style={{ opacity: 0.4, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
              ~{charCounts[key] * 3} tk
            </span>
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        className="soul-editor"
        value={getContent()}
        onChange={(e) => isEditing && setDraft(e.target.value)}
        placeholder={t(`persona.placeholder.${tab}`)}
        spellCheck={false}
        readOnly={!isEditing}
      />

      <div className="persona-actions">
        <div className="soul-hint">{t(`persona.hint.${tab}`)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isEditing ? (
            <button className="btn btn-primary btn-sm" onClick={handleEdit}>
              {t("persona.edit")}
            </button>
          ) : (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleCancel}
                disabled={saving}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t("persona.saving") : t("persona.save")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Persona;
