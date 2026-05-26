import { memo, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ModelGroup } from "./types";

interface ModelPickerProps {
  currentModel: string;
  currentProvider: string;
  currentBaseUrl: string;
  displayModel: string;
  modelGroups: ModelGroup[];
  onOpen: () => void;
  onSelectModel: (provider: string, model: string, baseUrl: string) => void;
}

export const ModelPicker = memo(function ModelPicker({
  currentModel,
  currentBaseUrl,
  displayModel,
  modelGroups,
  onOpen,
  onSelectModel,
}: ModelPickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
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

  return (
    <div className="chat-model-bar" ref={pickerRef}>
      <button className="chat-model-trigger" onClick={toggle}>
        <span className="chat-model-name">{displayModel}</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && modelGroups.length > 0 && (
        <div className="chat-model-dropdown">
          {modelGroups.map((group) => (
            <div key={group.provider} className="chat-model-group">
              <div className="chat-model-group-label">
                {group.providerLabel}
              </div>
              {group.models.map((m) => (
                <button
                  key={`${m.provider}:${m.model}`}
                  className={`chat-model-option ${
                    currentModel === m.model && currentBaseUrl === m.baseUrl
                      ? "active"
                      : ""
                  }`}
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
          ))}
        </div>
      )}
    </div>
  );
});
