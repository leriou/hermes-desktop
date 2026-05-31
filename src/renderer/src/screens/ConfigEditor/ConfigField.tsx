import { useState, useEffect, useRef, useCallback } from "react";

export type FieldType =
  | "toggle"
  | "select"
  | "number"
  | "text"
  | "textarea"
  | "duration";

export interface SelectOption {
  value: string;
  label: string;
}

export interface ConfigFieldProps {
  label: string;
  configKey: string;
  value: string;
  type: FieldType;
  options?: SelectOption[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  helperText?: string;
  rows?: number;
  disabled?: boolean;
  debounceMs?: number;
  onChange: (key: string, value: string) => void;
  saving?: string | null;
  error?: string | null;
}

function ConfigField({
  label,
  configKey,
  value,
  type,
  options,
  min,
  max,
  step,
  placeholder,
  helperText,
  rows = 3,
  disabled = false,
  debounceMs = 500,
  onChange,
  saving,
  error,
}: ConfigFieldProps): React.JSX.Element {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInternalUpdate = useRef(false);

  // Sync external value changes (e.g., config reload)
  useEffect(() => {
    if (!isInternalUpdate.current) {
      setLocalValue(value);
    }
    isInternalUpdate.current = false;
  }, [value]);

  const flush = useCallback(
    (v: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (v !== value) {
        isInternalUpdate.current = true;
        onChange(configKey, v);
      }
    },
    [configKey, onChange, value],
  );

  const handleChange = useCallback(
    (next: string) => {
      setLocalValue(next);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (type === "textarea") {
        timerRef.current = setTimeout(() => flush(next), 1000);
      } else {
        timerRef.current = setTimeout(() => flush(next), debounceMs);
      }
    },
    [debounceMs, flush, type],
  );

  // Flush pending on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (localValue !== value) {
          onChange(configKey, localValue);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseId = `cfg-${configKey.replace(/\./g, "-")}`;
  const isSaving = saving === configKey;

  function renderControl(): React.JSX.Element {
    switch (type) {
      case "toggle":
        return (
          <label className="config-toggle-wrapper" htmlFor={baseId}>
            <input
              id={baseId}
              type="checkbox"
              className="config-toggle-input"
              checked={localValue === "true" || localValue === "true"}
              onChange={(e) => handleChange(e.target.checked ? "true" : "false")}
              disabled={disabled}
            />
            <span className="config-toggle-track" />
          </label>
        );

      case "select":
        return (
          <select
            id={baseId}
            className="config-select"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled}
          >
            {(options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case "number":
        return (
          <div className="config-number-wrapper">
            <input
              id={baseId}
              type="number"
              className="config-input"
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={() => flush(localValue)}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              placeholder={placeholder}
            />
            {helperText && (
              <span className="config-helper">{helperText}</span>
            )}
          </div>
        );

      case "text":
        return (
          <div className="config-text-wrapper">
            <input
              id={baseId}
              type="text"
              className="config-input"
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={() => flush(localValue)}
              disabled={disabled}
              placeholder={placeholder}
            />
            {helperText && (
              <span className="config-helper">{helperText}</span>
            )}
          </div>
        );

      case "duration":
        return (
          <div className="config-text-wrapper">
            <input
              id={baseId}
              type="text"
              className="config-input"
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={() => flush(localValue)}
              disabled={disabled}
              placeholder={placeholder || "1h"}
            />
            {helperText && (
              <span className="config-helper">{helperText}</span>
            )}
          </div>
        );

      case "textarea":
        return (
          <textarea
            id={baseId}
            className="config-textarea"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={() => flush(localValue)}
            rows={rows}
            disabled={disabled}
            placeholder={placeholder}
            spellCheck={false}
          />
        );

      default:
        return <span className="config-unsupported">Unsupported type: {type}</span>;
    }
  }

  return (
    <div
      className={`config-field ${type === "textarea" ? "config-field-full" : ""} ${error ? "config-field-error" : ""} ${isSaving ? "config-field-saving" : ""}`}
    >
      <label className="config-field-label" htmlFor={type !== "toggle" ? baseId : undefined}>
        {label}
      </label>
      <div className="config-field-control">
        {renderControl()}
        {isSaving && <span className="config-field-status saving">Saving...</span>}
        {error && <span className="config-field-status error">{error}</span>}
      </div>
    </div>
  );
}

export default ConfigField;
