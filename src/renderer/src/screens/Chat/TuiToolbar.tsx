import { memo, useCallback, useEffect, useRef, useState } from "react";

interface TuiToolbarProps {
  onSetGoal: (goal: string) => void;
  onSetModel: (model: string) => void;
  onSteer: (prompt: string) => void;
  onCompress: () => void;
  steerEnabled?: boolean;
}

function PopoverInput({
  placeholder,
  submitLabel,
  onSubmit,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState("");
  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }, [value, onSubmit]);
  return (
    <div className="tui-popover">
      <input
        className="tui-popover-input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        autoFocus
      />
      <button
        className="tui-popover-btn tui-popover-submit"
        disabled={!value.trim()}
        onClick={submit}
      >
        {submitLabel}
      </button>
    </div>
  );
}

export const TuiToolbar = memo(function TuiToolbar({
  onSetGoal,
  onSetModel,
  onSteer,
  onCompress,
  steerEnabled = false,
}: TuiToolbarProps): React.JSX.Element {
  const [open, setOpen] = useState<"goal" | "model" | "steer" | "compress" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const toggle = useCallback(
    (which: "goal" | "model" | "steer" | "compress") => () =>
      setOpen((prev) => (prev === which ? null : which)),
    [],
  );

  const handleGoal = useCallback(
    (goal: string) => {
      setOpen(null);
      onSetGoal(goal);
    },
    [onSetGoal],
  );

  const handleModel = useCallback(
    (model: string) => {
      setOpen(null);
      onSetModel(model);
    },
    [onSetModel],
  );

  const handleSteer = useCallback(
    (prompt: string) => {
      setOpen(null);
      onSteer(prompt);
    },
    [onSteer],
  );

  return (
    <div className="tui-toolbar" ref={ref}>
      <div className="tui-toolbar-item">
        <button
          className={`tui-btn ${open === "goal" ? "tui-btn-active" : ""}`}
          onClick={toggle("goal")}
        >
          🎯 Goal
        </button>
        {open === "goal" && (
          <PopoverInput
            placeholder="Enter new goal..."
            submitLabel="Set"
            onSubmit={handleGoal}
          />
        )}
      </div>
      <div className="tui-toolbar-item">
        <button
          className={`tui-btn ${open === "model" ? "tui-btn-active" : ""}`}
          onClick={toggle("model")}
        >
          🤖 Model
        </button>
        {open === "model" && (
          <PopoverInput
            placeholder="e.g. gpt-4o"
            submitLabel="Switch"
            onSubmit={handleModel}
          />
        )}
      </div>
      <div className="tui-toolbar-item">
        <button
          className={`tui-btn ${open === "steer" ? "tui-btn-active" : ""}`}
          onClick={toggle("steer")}
          disabled={!steerEnabled}
          title={steerEnabled ? "Steer the current run" : "Start a run before steering"}
        >
          ↪ Steer
        </button>
        {open === "steer" && (
          <PopoverInput
            placeholder="Steer the current run..."
            submitLabel="Queue"
            onSubmit={handleSteer}
          />
        )}
      </div>
      <div className="tui-toolbar-item">
        <button
          className={`tui-btn ${open === "compress" ? "tui-btn-active" : ""}`}
          onClick={toggle("compress")}
        >
          🗜️ Compress
        </button>
        {open === "compress" && (
          <div className="tui-popover tui-popover-confirm">
            <span>Compress to save tokens?</span>
            <div className="tui-popover-actions">
              <button
                className="tui-popover-btn tui-popover-submit"
                onClick={() => {
                  setOpen(null);
                  onCompress();
                }}
              >
                Yes
              </button>
              <button
                className="tui-popover-btn tui-popover-cancel"
                onClick={() => setOpen(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
