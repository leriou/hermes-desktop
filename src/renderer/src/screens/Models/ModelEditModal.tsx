import { useState } from "react";
import { X } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import { ALL_CATEGORIES, CATEGORY_META } from "../../lib/model-types";
import type { BusinessCategory, ClientModel } from "../../lib/model-types";

interface ModelEditModalProps {
  model: ClientModel;
  profile?: string;
  onClose: () => void;
  onSave: (modelId: string, updates: {
    alias?: string;
    categories?: BusinessCategory[];
    contextLength?: number;
  }) => Promise<void>;
}

export default function ModelEditModal({
  model,
  onClose,
  onSave,
}: ModelEditModalProps) {
  const { t } = useI18n();

  const [alias, setAlias] = useState(model.alias);
  const [contextLength, setContextLength] = useState(
    model.contextLength > 0 ? String(model.contextLength) : "",
  );
  const [categories, setCategories] = useState<Set<BusinessCategory>>(
    new Set(model.categories),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleCategory(cat: BusinessCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      const parsedLength = contextLength.trim()
        ? Math.min(Math.max(parseInt(contextLength, 10) || 0, 0), 1000000)
        : 0;

      await onSave(model.id, {
        alias: alias.trim(),
        categories: Array.from(categories),
        contextLength: parsedLength,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
      setSaving(false);
    }
  }

  return (
    <div className="models-modal-overlay" onClick={onClose}>
      <div className="models-modal" onClick={(e) => e.stopPropagation()}>
        <div className="models-modal-header">
          <h2 className="models-modal-title">{t("models.editModel")}</h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="models-modal-body">
          {/* Model ID (readonly) */}
          <div className="models-modal-field">
            <label className="models-modal-label">
              {t("models.modelId")}
            </label>
            <input
              className="input"
              type="text"
              value={model.modelId}
              readOnly
              disabled
              style={{ opacity: 0.6 }}
            />
            <div className="models-modal-hint">
              {model.discovered
                ? "通过提供商自动发现"
                : "手动添加"}
            </div>
          </div>

          {/* Alias */}
          <div className="models-modal-field">
            <label className="models-modal-label">
              {t("models.aliasLabel")} ({t("common.optional")})
            </label>
            <input
              className="input"
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t("models.aliasPlaceholder")}
              autoFocus
            />
            <div className="models-modal-hint">{t("models.aliasHint")}</div>
          </div>

          {/* Context Length */}
          <div className="models-modal-field">
            <label className="models-modal-label">
              {t("models.contextLength")} ({t("common.optional")})
            </label>
            <input
              className="input"
              type="number"
              value={contextLength}
              onChange={(e) => setContextLength(e.target.value)}
              placeholder={t("models.contextLengthPlaceholder")}
              min={0}
              max={1000000}
            />
          </div>

          {/* Business Categories */}
          <div className="models-modal-field">
            <label className="models-modal-label">
              业务类别
            </label>
            <div className="models-category-grid">
              {ALL_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const checked = categories.has(cat);
                return (
                  <label
                    key={cat}
                    className={`models-category-chip ${checked ? "models-category-chip--active" : ""}`}
                    style={{
                      borderColor: checked ? meta.color : undefined,
                      backgroundColor: checked
                        ? `${meta.color}20`
                        : undefined,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCategory(cat)}
                      style={{ display: "none" }}
                    />
                    <span style={{ marginRight: 4 }}>{meta.icon}</span>
                    {t(meta.labelKey)}
                  </label>
                );
              })}
            </div>
          </div>

          {error && <div className="models-error">{error}</div>}
        </div>

        <div className="models-modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            {t("models.cancel")}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t("common.loading") : t("models.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
