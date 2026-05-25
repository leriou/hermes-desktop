import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash,
  Refresh,
  X,
  Play,
  Pause,
  Zap,
  Alert,
  Pencil,
  Clock,
} from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import { cache } from "../../utils/prefetchCache";

const DELIVER_TARGETS = [
  { value: "local", label: "Local" },
  { value: "origin", label: "Origin" },
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
  { value: "slack", label: "Slack" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "signal", label: "Signal" },
  { value: "matrix", label: "Matrix" },
  { value: "mattermost", label: "Mattermost" },
  { value: "email", label: "Email" },
  { value: "webhook", label: "Webhook" },
  { value: "sms", label: "SMS" },
  { value: "homeassistant", label: "Home Assistant" },
  { value: "dingtalk", label: "DingTalk" },
  { value: "feishu", label: "Feishu" },
  { value: "wecom", label: "WeCom" },
];

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  state: "active" | "paused" | "completed";
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  repeat: { times: number | null; completed: number } | null;
  deliver: string[];
  skills: string[];
  script: string | null;
}

interface HistoryEntry {
  jobId: string;
  jobName: string;
  runAt: string;
  status: "ok" | "fail" | "empty";
  size: number;
  path: string;
}

type FrequencyType = "minutes" | "hourly" | "daily" | "weekly" | "custom";

interface SchedulesProps {
  profile?: string;
}

function Schedules({ profile }: SchedulesProps): React.JSX.Element {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingOutput, setViewingOutput] = useState<string | null>(null);
  const [outputContent, setOutputContent] = useState("");
  const [outputLoading, setOutputLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>("all");

  // Create form state
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newDeliver, setNewDeliver] = useState("local");

  // Schedule builder state
  const [frequency, setFrequency] = useState<FrequencyType>("daily");
  const [minutesInterval, setMinutesInterval] = useState("30");
  const [hourlyInterval, setHourlyInterval] = useState("1");
  const [dailyTime, setDailyTime] = useState("09:00");
  const [weeklyDay, setWeeklyDay] = useState("1");
  const [weeklyTime, setWeeklyTime] = useState("09:00");
  const [customCron, setCustomCron] = useState("");

  const loadJobs = useCallback(async (): Promise<void> => {
    try {
      const list = await cache.getOrFetch(`schedules:jobs:${profile ?? "default"}`, 20_000, async () =>
        (await window.hermesAPI.listCronJobs(true, profile)) ?? [],
      );
      setJobs(list);
    } catch {
      setError(t("schedules.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const loadHistory = useCallback(async (): Promise<void> => {
    setHistoryLoading(true);
    try {
      const list = await cache.getOrFetch(`schedules:history:${profile ?? "default"}`, 30_000, () =>
        window.hermesAPI.listCronHistory(profile),
      );
      setHistory(list ?? []);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }, [profile]);

  useEffect(() => {
    loadJobs();
    loadHistory();
  }, [loadJobs, loadHistory]);

  // Escape key to close modals
  useEffect(() => {
    if (!showCreate && !confirmDelete && !editingJob) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        if (confirmDelete) setConfirmDelete(null);
        else if (editingJob) closeEditModal();
        else if (showCreate) setShowCreate(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showCreate, confirmDelete, editingJob]);

  function resetForm(): void {
    setNewName("");
    setNewPrompt("");
    setNewDeliver("local");
    setFrequency("daily");
    setMinutesInterval("30");
    setHourlyInterval("1");
    setDailyTime("09:00");
    setWeeklyDay("1");
    setWeeklyTime("09:00");
    setCustomCron("");
  }

  function closeCreateModal(): void {
    setShowCreate(false);
    resetForm();
  }

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editSchedule, setEditSchedule] = useState("");
  const [editDeliver, setEditDeliver] = useState("local");

  function openEditModal(job: CronJob): void {
    setEditingJob(job);
    setEditName(job.name);
    setEditPrompt(job.prompt);
    setEditSchedule(job.schedule);
    setEditDeliver(
      job.deliver.length > 0 && !(job.deliver.length === 1 && job.deliver[0] === "local")
        ? job.deliver[0]
        : "local",
    );
  }

  function closeEditModal(): void {
    setEditingJob(null);
  }

  async function handleUpdate(): Promise<void> {
    if (!editingJob) return;
    setActionInProgress(editingJob.id);
    setError("");
    try {
      const result = await window.hermesAPI.updateCronJob(
        editingJob.id,
        editSchedule.trim() || undefined,
        editPrompt.trim() || undefined,
        editName.trim() || undefined,
        editDeliver !== "local" ? editDeliver : undefined,
        profile,
      );
      if (result.success) {
        closeEditModal();
        cache.invalidate(`schedules:jobs:${profile ?? "default"}`);
        await loadJobs();
      } else {
        setError(result.error || "Failed to update job");
      }
    } catch {
      setError("Failed to update job");
    } finally {
      setActionInProgress(null);
    }
  }

  function buildSchedule(): string {
    switch (frequency) {
      case "minutes":
        return `${minutesInterval}m`;
      case "hourly":
        return `${hourlyInterval}h`;
      case "daily": {
        const [h, m] = dailyTime.split(":");
        return `${m} ${h} * * *`;
      }
      case "weekly": {
        const [h, m] = weeklyTime.split(":");
        return `${m} ${h} * * ${weeklyDay}`;
      }
      case "custom":
        return customCron.trim();
    }
  }

  function isScheduleValid(): boolean {
    if (frequency === "custom") return customCron.trim().length > 0;
    if (frequency === "minutes") return parseInt(minutesInterval) > 0;
    if (frequency === "hourly") return parseInt(hourlyInterval) > 0;
    return true;
  }

  async function handleCreate(): Promise<void> {
    if (!isScheduleValid()) return;
    setActionInProgress("creating");
    setError("");
    try {
      const result = await window.hermesAPI.createCronJob(
        buildSchedule(),
        newPrompt.trim() || undefined,
        newName.trim() || undefined,
        newDeliver !== "local" ? newDeliver : undefined,
        profile,
      );
      if (result.success) {
        closeCreateModal();
        cache.invalidate(`schedules:jobs:${profile ?? "default"}`);
        await loadJobs();
      } else {
        setError(result.error || "Failed to create job");
      }
    } catch {
      setError("Failed to create job");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleRemove(jobId: string): Promise<void> {
    setActionInProgress(jobId);
    setError("");
    try {
      const result = await window.hermesAPI.removeCronJob(jobId, profile);
      setConfirmDelete(null);
      if (result.success) {
        cache.invalidate(`schedules:jobs:${profile ?? "default"}`);
        await loadJobs();
      } else {
        setError(result.error || "Failed to remove job");
      }
    } catch {
      setError("Failed to remove job");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleToggle(job: CronJob): Promise<void> {
    setActionInProgress(job.id);
    setError("");
    try {
      const result =
        job.state === "paused"
          ? await window.hermesAPI.resumeCronJob(job.id, profile)
          : await window.hermesAPI.pauseCronJob(job.id, profile);
      if (result.success) {
        cache.invalidate(`schedules:jobs:${profile ?? "default"}`);
        await loadJobs();
      } else {
        setError(result.error || "Failed to update job");
      }
    } catch {
      setError("Failed to update job");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleTrigger(jobId: string): Promise<void> {
    setActionInProgress(jobId);
    setError("");
    try {
      const result = await window.hermesAPI.triggerCronJob(jobId, profile);
      if (result.success) {
        cache.invalidate(`schedules:jobs:${profile ?? "default"}`);
        await loadJobs();
      } else {
        setError(result.error || "Failed to trigger job");
      }
    } catch {
      setError("Failed to trigger job");
    } finally {
      setActionInProgress(null);
    }
  }

  function formatTime(iso: string | null): string {
    if (!iso) return "--";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  if (loading) {
    return (
      <div className="schedules-container">
        <div className="schedules-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="schedules-container">
      {/* Create Modal */}
      {showCreate && (
        <div className="skills-detail-overlay" onClick={closeCreateModal}>
          <div
            className="schedules-modal schedules-modal-split"
            style={{ maxWidth: 680 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="schedules-modal-header">
              <h3>{t("schedules.newTask")}</h3>
              <button className="btn-ghost" onClick={closeCreateModal}>
                <X size={18} />
              </button>
            </div>
            <div className="schedules-modal-body">
              <div className="schedules-modal-left">
                <div className="schedules-field">
                  <label className="schedules-field-label">
                    {t("schedules.name")}
                  </label>
                  <input
                    className="input"
                    type="text"
                    placeholder={t("schedules.namePlaceholder")}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="schedules-field">
                  <label className="schedules-field-label">
                    {t("schedules.frequency")}{" "}
                    <span className="schedules-required">*</span>
                  </label>
                  <div className="schedules-freq-pills">
                    {(
                      [
                        ["minutes", t("schedules.frequencyMinutes")],
                        ["hourly", t("schedules.frequencyHourly")],
                        ["daily", t("schedules.frequencyDaily")],
                        ["weekly", t("schedules.frequencyWeekly")],
                        ["custom", t("schedules.frequencyCustom")],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        className={`schedules-freq-pill ${frequency === val ? "active" : ""}`}
                        onClick={() => setFrequency(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {frequency === "minutes" && (
                  <div className="schedules-field">
                    <label className="schedules-field-label">
                      {t("schedules.minutesInterval")}
                    </label>
                    <select
                      className="input"
                      value={minutesInterval}
                      onChange={(e) => setMinutesInterval(e.target.value)}
                    >
                      {["5", "10", "15", "30", "45"].map((v) => (
                        <option key={v} value={v}>
                          {t("schedules.everyNMinutes", { n: v })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {frequency === "hourly" && (
                  <div className="schedules-field">
                    <label className="schedules-field-label">
                      {t("schedules.hoursInterval")}
                    </label>
                    <select
                      className="input"
                      value={hourlyInterval}
                      onChange={(e) => setHourlyInterval(e.target.value)}
                    >
                      {["1", "2", "3", "4", "6", "8", "12"].map((v) => (
                        <option key={v} value={v}>
                          {t("schedules.everyNHours", { n: v })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {frequency === "daily" && (
                  <div className="schedules-field">
                    <label className="schedules-field-label">
                      {t("schedules.executionTime")}
                    </label>
                    <input
                      className="input"
                      type="time"
                      value={dailyTime}
                      onChange={(e) => setDailyTime(e.target.value)}
                    />
                  </div>
                )}

                {frequency === "weekly" && (
                  <>
                    <div className="schedules-field">
                      <label className="schedules-field-label">
                        {t("schedules.weekday")}
                      </label>
                      <select
                        className="input"
                        value={weeklyDay}
                        onChange={(e) => setWeeklyDay(e.target.value)}
                      >
                        {[
                          ["1", t("schedules.monday")],
                          ["2", t("schedules.tuesday")],
                          ["3", t("schedules.wednesday")],
                          ["4", t("schedules.thursday")],
                          ["5", t("schedules.friday")],
                          ["6", t("schedules.saturday")],
                          ["0", t("schedules.sunday")],
                        ].map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="schedules-field">
                      <label className="schedules-field-label">
                        {t("schedules.executionTime")}
                      </label>
                      <input
                        className="input"
                        type="time"
                        value={weeklyTime}
                        onChange={(e) => setWeeklyTime(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {frequency === "custom" && (
                  <div className="schedules-field">
                    <label className="schedules-field-label">
                      {t("schedules.cronExpression")}
                    </label>
                    <input
                      className="input"
                      type="text"
                      placeholder={t("schedules.cronPlaceholder")}
                      value={customCron}
                      onChange={(e) => setCustomCron(e.target.value)}
                    />
                    <div className="schedules-field-hint">
                      {t("schedules.cronHint")}
                    </div>
                  </div>
                )}

                <div className="schedules-field">
                  <label className="schedules-field-label">
                    {t("schedules.deliverTo")}
                  </label>
                  <select
                    className="input"
                    value={newDeliver}
                    onChange={(e) => setNewDeliver(e.target.value)}
                  >
                    {DELIVER_TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <div className="schedules-field-hint">
                    {t("schedules.deliverHint")}
                  </div>
                </div>
              </div>
              <div className="schedules-modal-right">
                <div className="schedules-field" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <label className="schedules-field-label">
                    {t("schedules.prompt")}
                  </label>
                  <textarea
                    className="input schedules-textarea"
                    placeholder={t("schedules.promptPlaceholder")}
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="schedules-modal-footer">
              <button className="btn btn-secondary" onClick={closeCreateModal}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!isScheduleValid() || actionInProgress === "creating"}
              >
                {actionInProgress === "creating"
                  ? t("schedules.creating")
                  : t("schedules.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingJob && (
        <div className="skills-detail-overlay" onClick={closeEditModal}>
          <div
            className="schedules-modal schedules-modal-split"
            style={{ maxWidth: 680 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="schedules-modal-header">
              <h3>{t("schedules.editTask")}</h3>
              <button className="btn-ghost" onClick={closeEditModal}>
                <X size={18} />
              </button>
            </div>
            <div className="schedules-modal-body">
              <div className="schedules-modal-left">
                <div className="schedules-field">
                  <label className="schedules-field-label">
                    {t("schedules.name")}
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="schedules-field">
                  <label className="schedules-field-label">
                    {t("schedules.schedule")}
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={editSchedule}
                    onChange={(e) => setEditSchedule(e.target.value)}
                    placeholder="e.g. 30 9 * * *"
                  />
                  <div className="schedules-field-hint">
                    {t("schedules.cronHint")}
                  </div>
                </div>
                <div className="schedules-field">
                  <label className="schedules-field-label">
                    {t("schedules.deliverTo")}
                  </label>
                  <select
                    className="input"
                    value={editDeliver}
                    onChange={(e) => setEditDeliver(e.target.value)}
                  >
                    {DELIVER_TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="schedules-modal-right">
                <div className="schedules-field" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <label className="schedules-field-label">
                    {t("schedules.prompt")}
                  </label>
                  <textarea
                    className="input schedules-textarea"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder={t("schedules.promptPlaceholder")}
                  />
                </div>
              </div>
            </div>
            <div className="schedules-modal-footer">
              <button className="btn btn-secondary" onClick={closeEditModal}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpdate}
                disabled={actionInProgress === editingJob.id}
              >
                {actionInProgress === editingJob.id
                  ? t("schedules.saving")
                  : t("schedules.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          className="skills-detail-overlay"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="schedules-modal schedules-modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="schedules-modal-header">
              <h3>{t("schedules.deleteTaskTitle")}</h3>
              <button
                className="btn-ghost"
                onClick={() => setConfirmDelete(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="schedules-modal-body">
              <p className="schedules-confirm-text">
                {t("schedules.deleteConfirmText")}
              </p>
            </div>
            <div className="schedules-modal-footer">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setConfirmDelete(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleRemove(confirmDelete)}
                disabled={actionInProgress === confirmDelete}
              >
                {actionInProgress === confirmDelete
                  ? t("schedules.deleting")
                  : t("schedules.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="schedules-header">
        <div>
          <h2 className="schedules-title">{t("schedules.title")}</h2>
          <p className="schedules-subtitle">{t("schedules.subtitle")}</p>
        </div>
        <div className="schedules-header-actions">
          <button className="btn btn-secondary" onClick={loadJobs}>
            <Refresh size={14} />
            {t("schedules.refresh")}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            {t("schedules.newTask")}
          </button>
        </div>
      </div>

      {error && (
        <div className="skills-error">
          {error}
          <button className="btn-ghost" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="schedules-empty">
          <p className="schedules-empty-text">{t("schedules.empty")}</p>
          <p className="schedules-empty-hint">{t("schedules.emptyHint")}</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} />
            {t("schedules.firstTask")}
          </button>
        </div>
      ) : (
        <div className="schedules-list">
          {jobs.map((job) => (
            <div key={job.id} className="schedules-card">
              <div className="schedules-card-top">
                <div className="schedules-card-info">
                  <div className="schedules-card-name">{job.name}</div>
                  <div className="schedules-card-schedule">{job.schedule}</div>
                </div>
                <div className="schedules-card-actions">
                  <span
                    className={`schedules-badge schedules-badge-${job.state}`}
                  >
                    {job.state === "active"
                      ? t("schedules.active")
                      : job.state === "paused"
                        ? t("schedules.paused")
                        : t("schedules.completed")}
                  </span>
                  {job.state !== "completed" && (
                    <button
                      className="btn-ghost schedules-action-btn"
                      data-tooltip={
                        job.state === "paused"
                          ? t("schedules.resume")
                          : t("schedules.pause")
                      }
                      onClick={() => handleToggle(job)}
                      disabled={actionInProgress === job.id}
                    >
                      {job.state === "paused" ? (
                        <Play size={14} />
                      ) : (
                        <Pause size={14} />
                      )}
                    </button>
                  )}
                  {job.state === "active" && (
                    <button
                      className="btn-ghost schedules-action-btn"
                      data-tooltip={t("schedules.triggerNow")}
                      onClick={() => handleTrigger(job.id)}
                      disabled={actionInProgress === job.id}
                    >
                      <Zap size={14} />
                    </button>
                  )}
                  <button
                    className="btn-ghost schedules-action-btn"
                    data-tooltip={t("schedules.edit")}
                    onClick={() => openEditModal(job)}
                    disabled={actionInProgress === job.id}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn-ghost schedules-action-btn schedules-action-danger"
                    data-tooltip={t("schedules.delete")}
                    onClick={() => setConfirmDelete(job.id)}
                    disabled={actionInProgress === job.id}
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </div>

              {job.prompt && (
                <div className="schedules-card-prompt">{job.prompt}</div>
              )}

              <div className="schedules-card-meta">
                <span>
                  {t("schedules.nextRun")}: {formatTime(job.next_run_at)}
                </span>
                {job.last_run_at && (
                  <span>
                    {t("schedules.lastRun")}: {formatTime(job.last_run_at)}
                    {job.last_status && job.last_status !== "ok" && (
                      <span className="schedules-card-error-icon">
                        <Alert size={12} />
                      </span>
                    )}
                  </span>
                )}
                {job.repeat && job.repeat.times && (
                  <span>
                    {t("schedules.runCount")}: {job.repeat.completed}/
                    {job.repeat.times}
                  </span>
                )}
                {job.deliver.length > 0 &&
                  !(job.deliver.length === 1 && job.deliver[0] === "local") && (
                    <span>
                      {t("schedules.deliveredTo")}: {job.deliver.join(", ")}
                    </span>
                  )}
                {job.skills.length > 0 && (
                  <span>
                    {t("schedules.skills")}: {job.skills.join(", ")}
                  </span>
                )}
              </div>

              {job.last_error && (
                <div className="schedules-card-error">{job.last_error}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Execution History */}
      <div className="schedules-history-section">
        <div className="schedules-history-header">
          <h3 className="schedules-history-title">
            <Clock size={14} />
            {t("schedules.history")}
          </h3>
          <div className="schedules-history-controls">
            <select
              className="input schedules-history-filter"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
            >
              <option value="all">{t("schedules.allJobs")}</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
            <button className="btn-ghost" onClick={loadHistory} disabled={historyLoading}>
              <Refresh size={13} />
            </button>
          </div>
        </div>

        {historyLoading ? (
          <div className="schedules-loading"><div className="loading-spinner" /></div>
        ) : history.length === 0 ? (
          <p className="schedules-empty-hint">{t("schedules.noHistory")}</p>
        ) : (
          <table className="schedules-history-table">
            <thead>
              <tr>
                <th>{t("schedules.colTask")}</th>
                <th>{t("schedules.colTime")}</th>
                <th>{t("schedules.colStatus")}</th>
                <th>{t("schedules.colSize")}</th>
              </tr>
            </thead>
            <tbody>
              {history
                .filter((h) => historyFilter === "all" || h.jobId === historyFilter)
                .slice(0, 100)
                .map((h) => (
                <tr
                  key={h.path}
                  className="schedules-history-row"
                  onClick={async () => {
                    setViewingOutput(h.path);
                    setOutputLoading(true);
                    setOutputContent("");
                    try {
                      const content = await window.hermesAPI.readCronOutput(h.path);
                      setOutputContent(content || "(empty)");
                    } catch {
                      setOutputContent("(failed to read)");
                    } finally {
                      setOutputLoading(false);
                    }
                  }}
                >
                  <td className="schedules-history-name">{h.jobName}</td>
                  <td>{formatTime(h.runAt)}</td>
                  <td>
                    <span className={`schedules-badge schedules-badge-${
                      h.status === "ok" ? "active" : h.status === "empty" ? "paused" : "error"
                    }`}>
                      {h.status === "ok" ? t("schedules.statusOk") : h.status === "empty" ? t("schedules.statusEmpty") : t("schedules.statusFail")}
                    </span>
                  </td>
                  <td className="schedules-history-size">
                    {h.size > 0 ? `${(h.size / 1024).toFixed(1)}KB` : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Output Viewer Modal */}
      {viewingOutput && (
        <div className="skills-detail-overlay" onClick={() => setViewingOutput(null)}>
          <div
            className="schedules-modal"
            style={{ maxWidth: 800, maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="schedules-modal-header">
              <h3>{t("schedules.outputTitle")}</h3>
              <button className="btn-ghost" onClick={() => setViewingOutput(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="schedules-output-body">
              {outputLoading ? (
                <div className="schedules-loading"><div className="loading-spinner" /></div>
              ) : (
                <pre className="schedules-output-pre">{outputContent}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Schedules;
