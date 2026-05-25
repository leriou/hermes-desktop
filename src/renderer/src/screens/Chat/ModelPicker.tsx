import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import type { ModelGroup } from "./types";

interface ModelAlias {
  name: string;
  model: string;
  provider: string;
  baseUrl: string;
  contextLength?: number;
}

type Tab = "configured" | "available";

interface ModelPickerProps {
  currentModel: string;
  currentProvider: string;
  currentBaseUrl: string;
  displayModel: string;
  modelGroups: ModelGroup[];
  onOpen: () => void;
  onSelectAlias: (alias: ModelAlias) => void;
  onSelectModel: (provider: string, model: string, baseUrl: string) => void;
  aliases: ModelAlias[];
}

export const ModelPicker = memo(function ModelPicker({
  currentModel,
  currentBaseUrl,
  displayModel,
  modelGroups,
  onOpen,
  onSelectAlias,
  onSelectModel,
  aliases,
}: ModelPickerProps): React.JSX.Element {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("configured");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent): void {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  function toggle(): void {
    if (!isOpen) onOpen();
    setIsOpen((v) => !v);
  }

  function isAliasActive(alias: ModelAlias): boolean {
    return currentModel === alias.model && currentBaseUrl === alias.baseUrl;
  }

  // Build the "unconfigured" list: models from modelGroups that don't match
  // any alias.
  const configuredModelIds = useMemo(
    () => new Set(aliases.map((a) => `${a.provider}:${a.model}`)),
    [aliases],
  );

  const unconfiguredGroups = useMemo(
    () =>
      modelGroups
        .map((group) => ({
          ...group,
          models: group.models.filter(
            (m) => !configuredModelIds.has(`${m.provider}:${m.model}`),
          ),
        }))
        .filter((g) => g.models.length > 0),
    [modelGroups, configuredModelIds],
  );

  const hasConfigured = aliases.length > 0;
  const hasUnconfigured = unconfiguredGroups.length > 0;

  return (
    <div className="chat-model-bar" ref={pickerRef}>
      <button className="chat-model-trigger" onClick={toggle}>
        <span className="chat-model-name">{displayModel}</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && (hasConfigured || hasUnconfigured) && (
        <div className="chat-model-dropdown">
          <div className="chat-model-tabs">
            <button
              className={`chat-model-tab ${tab === "configured" ? "active" : ""}`}
              onClick={() => setTab("configured")}
            >
              {t("chat.configured")}
            </button>
            <button
              className={`chat-model-tab ${tab === "available" ? "active" : ""}`}
              onClick={() => setTab("available")}
            >
              {t("chat.available")}
            </button>
          </div>

          {tab === "configured" && (
            <div className="chat-model-tab-content">
              {aliases.length === 0 ? (
                <div className="chat-model-empty">
                  {t("chat.noConfiguredModels")}
                </div>
              ) : (
                aliases.map((alias) => (
                  <button
                    key={alias.name}
                    className={`chat-model-option ${isAliasActive(alias) ? "active" : ""}`}
                    onClick={() => {
                      onSelectAlias(alias);
                      setIsOpen(false);
                    }}
                  >
                    <span className="chat-model-option-label">{alias.name}</span>
                    <span className="chat-model-option-id">
                      {alias.model}
                      {alias.contextLength
                        ? ` (${(alias.contextLength / 1000).toFixed(0)}k)`
                        : ""}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {tab === "available" && (
            <div className="chat-model-tab-content">
              {unconfiguredGroups.length === 0 ? (
                <div className="chat-model-empty">
                  {t("chat.noAvailableModels")}
                </div>
              ) : (
                unconfiguredGroups.map((group) => (
                  <div key={group.provider} className="chat-model-group">
                    <div className="chat-model-group-label">
                      {t(group.providerLabel)}
                    </div>
                    {group.models.map((m) => (
                      <button
                        key={`${m.provider}:${m.model}`}
                        className="chat-model-option"
                        onClick={() => {
                          onSelectModel(m.provider, m.model, m.baseUrl);
                          setIsOpen(false);
                        }}
                      >
                        <span className="chat-model-option-label">{m.label}</span>
                        <span className="chat-model-option-id">{m.model}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
