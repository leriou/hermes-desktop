import {
  getSkillContent,
  installSkill,
  listBundledSkills,
  listInstalledSkills,
  uninstallSkill,
} from "@renderer/lib/hermes-tauri";
import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Download, Trash, Refresh } from "../../assets/icons";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { useI18n } from "../../components/useI18n";
import { cache } from "../../utils/prefetchCache";

interface InstalledSkill {
  name: string;
  entry_name: string;
  category: string;
  description: string;
  path: string;
  usage_count?: number;
}

interface BundledSkill {
  name: string;
  entry_name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
  usage_count?: number;
}

interface SkillsProps {
  profile?: string;
}

type Tab = "installed" | "browse" | "stats";

function Skills({ profile }: SkillsProps): React.JSX.Element {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("stats");
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [bundledSkills, setBundledSkills] = useState<BundledSkill[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [installedCategoryFilter, setInstalledCategoryFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "usage">("usage");
  const [loading, setLoading] = useState(true);

  const [detailWidth, setDetailWidth] = useState<number>(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = window.localStorage.getItem("skills-detail-width");
        return saved ? parseInt(saved, 10) : 800;
      }
    } catch (e) {
      // Ignore
    }
    return 800;
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const screenCenterX = window.innerWidth / 2;
      const calculatedWidth = (moveEvent.clientX - screenCenterX) * 2;
      const finalWidth = Math.max(400, Math.min(window.innerWidth * 0.95, calculatedWidth));
      setDetailWidth(finalWidth);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsResizing(false);
      
      const screenCenterX = window.innerWidth / 2;
      const calculatedWidth = (upEvent.clientX - screenCenterX) * 2;
      const finalWidth = Math.max(400, Math.min(window.innerWidth * 0.95, calculatedWidth));
      
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("skills-detail-width", finalWidth.toString());
        }
      } catch (err) {
        // Ignore
      }

      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, []);
  const [detailSkill, setDetailSkill] = useState<InstalledSkill | null>(null);
  const [detailContent, setDetailContent] = useState("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const loadInstalled = useCallback(async (): Promise<void> => {
    const list = await cache.getOrFetch(
      `skills:installed:${profile ?? "default"}`,
      20_000,
      async () => (await listInstalledSkills(profile)) ?? [],
    );
    setInstalledSkills(list);
  }, [profile]);

  const loadBundled = useCallback(async (): Promise<void> => {
    const list = await cache.getOrFetch(
      "skills:bundled",
      120_000,
      async () => (await listBundledSkills()) ?? [],
    );
    setBundledSkills(list);
  }, []);

  const loadAll = useCallback(async (): Promise<void> => {
    setLoading(true);
    await Promise.all([loadInstalled(), loadBundled()]);
    setLoading(false);
  }, [loadInstalled, loadBundled]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleViewDetail(skill: InstalledSkill): Promise<void> {
    setDetailSkill(skill);
    const content = await getSkillContent(skill.path);
    setDetailContent(content);
  }

  async function handleInstall(entryName: string): Promise<void> {
    setActionInProgress(entryName);
    setError("");
    const result = await installSkill(entryName, profile);
    setActionInProgress(null);
    if (result.success) {
      cache.invalidate(`skills:installed:${profile ?? "default"}`);
      await loadInstalled();
    } else {
      setError(result.error || t("skills.installFailed"));
    }
  }

  async function handleUninstall(entryName: string): Promise<void> {
    setActionInProgress(entryName);
    setError("");
    const result = await uninstallSkill(entryName, profile);
    setActionInProgress(null);
    if (result.success) {
      setDetailSkill(null);
      cache.invalidate(`skills:installed:${profile ?? "default"}`);
      await loadInstalled();
    } else {
      setError(result.error || t("skills.uninstallFailed"));
    }
  }

  const installedNames = new Set(
    installedSkills.map((s) => s.entry_name.toLowerCase()),
  );

  // Calculate statistics for dashboard
  const categoryStats = installedSkills.reduce(
    (acc, skill) => {
      const cat = skill.category || "Unknown";
      const usage = skill.usage_count || 0;
      if (!acc[cat]) {
        acc[cat] = { count: 0, totalUsage: 0 };
      }
      acc[cat].count += 1;
      acc[cat].totalUsage += usage;
      return acc;
    },
    {} as Record<string, { count: number; totalUsage: number }>,
  );

  const totalInstalledCount = installedSkills.length;
  const totalUsageCount = installedSkills.reduce(
    (sum, s) => sum + (s.usage_count || 0),
    0,
  );
  const totalCategoriesCount = Object.keys(categoryStats).length;

  const topSkills = [...installedSkills]
    .filter((s) => (s.usage_count || 0) > 0)
    .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
    .slice(0, 5);

  // Filter and sort logic for installed
  const filteredInstalled = installedSkills
    .filter((s) => {
      let matches = true;
      if (search) {
        const q = search.toLowerCase();
        matches =
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q);
      }
      if (installedCategoryFilter) {
        matches = matches && s.category === installedCategoryFilter;
      }
      return matches;
    })
    .sort((a, b) => {
      if (sortBy === "usage") {
        const diff = (b.usage_count || 0) - (a.usage_count || 0);
        if (diff !== 0) return diff;
      }
      return a.name.localeCompare(b.name);
    });

  // Filter and sort logic for bundled
  const filteredBundled = bundledSkills
    .filter((s) => {
      let matches = true;
      if (search) {
        const q = search.toLowerCase();
        matches =
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q);
      }
      if (categoryFilter) {
        matches = matches && s.category === categoryFilter;
      }
      return matches;
    })
    .sort((a, b) => {
      if (sortBy === "usage") {
        const diff = (b.usage_count || 0) - (a.usage_count || 0);
        if (diff !== 0) return diff;
      }
      return a.name.localeCompare(b.name);
    });

  // Get unique categories for filter pills
  const categories = Array.from(
    new Set(bundledSkills.map((s) => s.category)),
  ).sort();

  const installedCategories = Array.from(
    new Set(installedSkills.map((s) => s.category)),
  ).sort();

  if (loading) {
    return (
      <div className="skills-container">
        <div className="skills-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="skills-container">
      {/* Detail Panel */}
      {detailSkill && (
        <div
          className="skills-detail-overlay"
          onClick={() => setDetailSkill(null)}
        >
          <div
            className="skills-detail"
            style={{ width: `${detailWidth}px`, maxWidth: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Resize handle */}
            <div
              className={`skills-detail-resize-handle ${isResizing ? "resizing" : ""}`}
              onMouseDown={handleResizeMouseDown}
            />

            <div className="skills-detail-header">
              <div>
                <div className="skills-detail-name">{detailSkill.name}</div>
                <div className="skills-detail-category">
                  {detailSkill.category}
                </div>
              </div>
              <div className="skills-detail-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleUninstall(detailSkill.entry_name)}
                  disabled={actionInProgress === detailSkill.entry_name}
                >
                  {actionInProgress === detailSkill.entry_name ? (
                    t("skills.removing")
                  ) : (
                    <>
                      <Trash size={13} />
                      {t("skills.uninstall")}
                    </>
                  )}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setDetailSkill(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="skills-detail-content">
              <AgentMarkdown>{detailContent}</AgentMarkdown>
            </div>
          </div>
        </div>
      )}

      <div className="skills-header">
        <div>
          <h2 className="skills-title">{t("skills.title")}</h2>
          <p className="skills-subtitle">{t("skills.subtitle")}</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadAll}>
          <Refresh size={14} />
          {t("skills.refresh")}
        </button>
      </div>

      {error && (
        <div className="skills-error">
          {error}
          <button className="btn-ghost" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="skills-tabs">
        <button
          className={`skills-tab ${tab === "stats" ? "active" : ""}`}
          onClick={() => setTab("stats")}
        >
          {t("skills.statsTab") || "使用分析"}
        </button>
        <button
          className={`skills-tab ${tab === "installed" ? "active" : ""}`}
          onClick={() => setTab("installed")}
        >
          {t("skills.installedTab")} ({installedSkills.length})
        </button>
        <button
          className={`skills-tab ${tab === "browse" ? "active" : ""}`}
          onClick={() => setTab("browse")}
        >
          {t("skills.browseTab")} ({bundledSkills.length})
        </button>
      </div>

      {/* Stats Tab */}
      {tab === "stats" && (
        <div className="skills-dashboard">
          <div className="skills-dashboard-title">
            {t("skills.statsDashboard") || "技能分类与使用频次概览"}
          </div>
          <div className="skills-stat-cards">
            <div className="skills-stat-card">
              <span className="skills-stat-val">{totalUsageCount}</span>
              <span className="skills-stat-label">
                {t("skills.totalUsage") || "总调用频次"}
              </span>
            </div>
            <div className="skills-stat-card">
              <span className="skills-stat-val">{totalInstalledCount}</span>
              <span className="skills-stat-label">
                {t("skills.totalInstalled") || "已安装技能数"}
              </span>
            </div>
            <div className="skills-stat-card">
              <span className="skills-stat-val">{totalCategoriesCount}</span>
              <span className="skills-stat-label">
                {t("skills.totalCategories") || "技能分类数"}
              </span>
            </div>
          </div>

          <div className="skills-dashboard-detail">
            <div className="skills-dashboard-section">
              <div className="skills-section-header">
                {t("skills.categorySummary") || "分类统计详情"}
              </div>
              <div className="skills-table-container">
                <table className="skills-table">
                  <thead>
                    <tr>
                      <th>{t("skills.category") || "分类"}</th>
                      <th>{t("skills.count") || "技能数"}</th>
                      <th>{t("skills.usage") || "总频次"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(categoryStats).map(([cat, stat]) => (
                      <tr key={cat}>
                        <td>{cat}</td>
                        <td>{stat.count}</td>
                        <td>{stat.totalUsage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="skills-dashboard-section">
              <div className="skills-section-header">
                {t("skills.hotRanking") || "热门使用排行 (Top 5)"}
              </div>
              <div className="skills-hot-list">
                {topSkills.length === 0 ? (
                  <div
                    className="skills-hot-item"
                    style={{
                      color: "var(--text-muted)",
                      justifyContent: "center",
                    }}
                  >
                    {t("skills.noUsageRecord") || "暂无查看记录"}
                  </div>
                ) : (
                  topSkills.map((skill) => (
                    <div key={skill.name} className="skills-hot-item">
                      <span className="skills-hot-name">{skill.name}</span>
                      <span className="skills-hot-count">
                        👁️ {skill.usage_count} 次
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Installed Tab */}
      {tab === "installed" && (
        <>
          {/* Search & Sort Controls */}
          <div className="skills-controls">
            <div className="skills-controls-left">
              <div className="skills-search" style={{ margin: 0, flex: 1 }}>
                <Search size={15} />
                <input
                  ref={searchRef}
                  className="skills-search-input"
                  type="text"
                  placeholder={t("skills.filterInstalled")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="btn-ghost skills-search-clear"
                    onClick={() => {
                      setSearch("");
                      searchRef.current?.focus();
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="skills-controls-right">
              <select
                className="skills-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "name" | "usage")}
              >
                <option value="usage">
                  {t("skills.sortByUsage") || "按频次排序"}
                </option>
                <option value="name">
                  {t("skills.sortByName") || "按名称排序"}
                </option>
              </select>
            </div>
          </div>

          {/* Category filter pills (installed tab) */}
          {installedCategories.length > 0 && (
            <div className="skills-category-pills">
              <button
                className={`skills-pill ${installedCategoryFilter === null ? "active" : ""}`}
                onClick={() => setInstalledCategoryFilter(null)}
              >
                {t("skills.all")}
              </button>
              {installedCategories.map((cat) => (
                <button
                  key={cat}
                  className={`skills-pill ${installedCategoryFilter === cat ? "active" : ""}`}
                  onClick={() =>
                    setInstalledCategoryFilter(
                      installedCategoryFilter === cat ? null : cat,
                    )
                  }
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {filteredInstalled.length === 0 ? (
            <div className="skills-empty">
              <p className="skills-empty-text">
                {search
                  ? t("skills.noMatchingInstalled")
                  : t("skills.noInstalled")}
              </p>
              <p className="skills-empty-hint">
                {search
                  ? t("skills.noMatchingHint")
                  : t("skills.noInstalledHint")}
              </p>
            </div>
          ) : (
            <div className="skills-grid">
              {filteredInstalled.map((skill) => (
                <button
                  key={`${skill.category}/${skill.name}`}
                  className="skills-card"
                  onClick={() => handleViewDetail(skill)}
                >
                  <div className="skills-card-category">{skill.category}</div>
                  <div className="skills-card-name">{skill.name}</div>
                  {skill.description && (
                    <div className="skills-card-description">
                      {skill.description}
                    </div>
                  )}
                  <span className="skills-card-usage">
                    👁️ {skill.usage_count || 0} {t("skills.times") || "次查看"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Browse Tab */}
      {tab === "browse" && (
        <>
          {/* Search & Sort Controls */}
          <div className="skills-controls">
            <div className="skills-controls-left">
              <div className="skills-search" style={{ margin: 0, flex: 1 }}>
                <Search size={15} />
                <input
                  ref={searchRef}
                  className="skills-search-input"
                  type="text"
                  placeholder={t("skills.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="btn-ghost skills-search-clear"
                    onClick={() => {
                      setSearch("");
                      searchRef.current?.focus();
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="skills-controls-right">
              <select
                className="skills-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "name" | "usage")}
              >
                <option value="usage">
                  {t("skills.sortByUsage") || "按频次排序"}
                </option>
                <option value="name">
                  {t("skills.sortByName") || "按名称排序"}
                </option>
              </select>
            </div>
          </div>

          {/* Category filter pills (browse tab) */}
          {categories.length > 0 && (
            <div className="skills-category-pills">
              <button
                className={`skills-pill ${categoryFilter === null ? "active" : ""}`}
                onClick={() => setCategoryFilter(null)}
              >
                {t("skills.all")}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`skills-pill ${categoryFilter === cat ? "active" : ""}`}
                  onClick={() =>
                    setCategoryFilter(categoryFilter === cat ? null : cat)
                  }
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {filteredBundled.length === 0 ? (
            <div className="skills-empty">
              <p className="skills-empty-text">{t("skills.noBrowseResults")}</p>
              <p className="skills-empty-hint">{t("skills.noBrowseResultsHint")}</p>
            </div>
          ) : (
            <div className="skills-grid">
              {filteredBundled.map((skill) => {
                const isInstalled = installedNames.has(skill.entry_name.toLowerCase());
                const isActioning = actionInProgress === skill.entry_name;
                return (
                  <div
                    key={`${skill.category}/${skill.name}`}
                    className="skills-card"
                  >
                    <div className="skills-card-category">{skill.category}</div>
                    <div className="skills-card-name">{skill.name}</div>
                    {skill.description && (
                      <div className="skills-card-description">
                        {skill.description}
                      </div>
                    )}
                    <span className="skills-card-usage">
                      👁️ {skill.usage_count || 0} {t("skills.times") || "次查看"}
                    </span>
                    <div className="skills-card-footer">
                      {isInstalled ? (
                        <span className="skills-card-installed-badge">
                          {t("skills.installedBadge")}
                        </span>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm skills-card-install-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInstall(skill.entry_name);
                          }}
                          disabled={isActioning}
                        >
                          {isActioning ? (
                            t("skills.installing")
                          ) : (
                            <>
                              <Download size={13} />
                              {t("skills.install")}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Skills;
