import { memo, useState, useMemo, useEffect } from "react";
import { 
  Search, 
  Clock, 
  Mail, 
  ChartLine, 
  Bell, 
  Sparkles, 
  FileText, 
  Terminal, 
  Settings, 
  ChevronRight,
  Pin,
  History,
  FileCode,
  MessageSquare,
  FolderOpen,
  X
} from "lucide-react";
import icon from "../../assets/icon.png";
import { useI18n } from "../../components/useI18n";
import { listSessions } from "@renderer/lib/hermes-tauri";
import { getStoreItem, setStoreItem } from "../../utils/store";

interface WorkbenchTask {
  id: string;
  category: "recommended" | "office" | "code" | "system" | "scheduling" | "files";
  icon: any;
  label: string;
  prompt: string;
}

const TASKS: WorkbenchTask[] = [
  // Recommended
  { id: "web-search", category: "recommended", icon: Search, label: "Search Web", prompt: "Search the web for today's top tech news" },
  { id: "daily-summary", category: "recommended", icon: Sparkles, label: "Daily Summary", prompt: "Summarize my active projects and notifications for today" },
  
  // Office
  { id: "email-summary", category: "office", icon: Mail, label: "Summarize Emails", prompt: "Read my latest emails and summarize key action items" },
  { id: "document-draft", category: "office", icon: FileText, label: "Draft Document", prompt: "Help me draft a project proposal based on our previous discussion" },
  
  // Code
  { id: "python-script", category: "code", icon: Terminal, label: "Python Script", prompt: "Write a Python script to automate file organization" },
  { id: "code-review", category: "code", icon: FileCode, label: "Code Review", prompt: "Review the code in the current folder for potential bugs" },
  
  // Files
  { id: "find-docs", category: "files", icon: FolderOpen, label: "Find Documents", prompt: "Find all PDF and Word documents I modified in the last 7 days" },
  { id: "analyze-csv", category: "files", icon: ChartLine, label: "Analyze CSV", prompt: "Analyze the structure and contents of the CSV files in my Downloads folder" },

  // Scheduling
  { id: "set-reminder", category: "scheduling", icon: Bell, label: "Set Reminder", prompt: "Set a reminder to check emails every day at 9 AM" },
  { id: "cron-backup", category: "scheduling", icon: Clock, label: "Schedule Backup", prompt: "Schedule a cron job to back up my workspace every night" },
  
  // System
  { id: "check-system", category: "system", icon: Settings, label: "System Health", prompt: "Check my system resources and running processes" },
  { id: "update-agent", category: "system", icon: Sparkles, label: "Update Agent", prompt: "Check for Hermes Agent updates and show changelog" },
];

interface ChatEmptyStateProps {
  onSelectSuggestion: (text: string) => void;
}

export const ChatEmptyState = memo(function ChatEmptyState({
  onSelectSuggestion,
}: ChatEmptyStateProps): React.JSX.Element {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<string>("recommended");
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [pinnedPrompts, setPinnedPrompts] = useState<string[]>([]);

  useEffect(() => {
    // Load recent
    const loadRecent = async () => {
      try {
        const sessions = await listSessions(undefined, 20);
        const useful = sessions
          .filter(s => s.title && s.title.length > 2)
          .slice(0, 5);
        setRecentSessions(useful);
      } catch (e) {
        console.error(e);
      }
    };
    loadRecent();

    // Load pinned
    const saved = getStoreItem("workbench.pinnedPrompts", "[]");
    try {
      setPinnedPrompts(JSON.parse(saved));
    } catch {
      setPinnedPrompts([]);
    }
  }, []);

  const handlePinTask = (prompt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newPinned = [...pinnedPrompts];
    if (newPinned.includes(prompt)) {
      const idx = newPinned.indexOf(prompt);
      newPinned.splice(idx, 1);
    } else {
      newPinned.push(prompt);
    }
    setPinnedPrompts(newPinned);
    setStoreItem("workbench.pinnedPrompts", JSON.stringify(newPinned));
  };

  const categories = [
    { id: "recommended", label: "Recommended", icon: Sparkles },
    { id: "office", label: "Office & Docs", icon: FileText },
    { id: "files", label: "Local Files", icon: FolderOpen },
    { id: "code", label: "Code & Dev", icon: Terminal },
    { id: "scheduling", label: "Scheduling", icon: Clock },
    { id: "system", label: "System", icon: Settings },
  ];

  const filteredTasks = useMemo(() => 
    TASKS.filter(task => task.category === activeCategory),
    [activeCategory]
  );

  return (
    <div className="chat-workbench">
      <div className="workbench-hero">
        <div className="workbench-identity">
          <img src={icon} width={48} height={48} alt="" className="workbench-logo" />
          <div className="workbench-welcome">
            <h2>{t("chat.emptyTitle") || "Workbench"}</h2>
            <p>{t("chat.emptyHint") || "Select a task to get started"}</p>
          </div>
        </div>
      </div>

      <div className="workbench-content">
        <aside className="workbench-nav">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`workbench-nav-item ${activeCategory === cat.id ? "active" : ""}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <cat.icon size={16} />
              <span>{cat.label}</span>
              {activeCategory === cat.id && <ChevronRight size={14} className="nav-arrow" />}
            </button>
          ))}
        </aside>

        <main className="workbench-grid">
          <div className="workbench-section-header">
            <h3 className="capitalize">{activeCategory} Tasks</h3>
          </div>
          <div className="workbench-tasks">
            {filteredTasks.map(task => {
              const isPinned = pinnedPrompts.includes(task.prompt);
              return (
                <button
                  key={task.id}
                  className="workbench-task-card"
                  onClick={() => onSelectSuggestion(task.prompt)}
                >
                  <div className="task-icon-wrapper">
                    <task.icon size={20} />
                  </div>
                  <div className="task-info">
                    <span className="task-label">{task.label}</span>
                    <span className="task-preview">{task.prompt}</span>
                  </div>
                  <button 
                    className={`task-pin-btn ${isPinned ? "active" : ""}`}
                    onClick={(e) => handlePinTask(task.prompt, e)}
                  >
                    <Pin size={12} />
                  </button>
                </button>
              );
            })}
          </div>

          <div className="workbench-footer-sections">
             <section className="workbench-footer-column">
                <h4><Pin size={14} /> Pinned Prompts</h4>
                {pinnedPrompts.length > 0 ? (
                  <div className="workbench-recent-list">
                    {pinnedPrompts.map(prompt => (
                      <div key={prompt} className="workbench-recent-item-wrapper">
                        <button 
                          className="workbench-recent-item flex-1"
                          onClick={() => onSelectSuggestion(prompt)}
                        >
                          <Pin size={12} className="text-accent" />
                          <span>{prompt}</span>
                        </button>
                        <button 
                          className="btn-ghost workbench-item-remove"
                          onClick={(e) => handlePinTask(prompt, e)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="workbench-empty-list">No pinned prompts yet</div>
                )}
             </section>
             <section className="workbench-footer-column">
                <h4><History size={14} /> Recent Tasks</h4>
                {recentSessions.length > 0 ? (
                  <div className="workbench-recent-list">
                    {recentSessions.map(s => (
                      <button 
                        key={s.id} 
                        className="workbench-recent-item"
                        onClick={() => onSelectSuggestion(s.title || "")}
                      >
                        <MessageSquare size={12} />
                        <span>{s.title}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="workbench-empty-list">Start a chat to see history</div>
                )}
             </section>
          </div>
        </main>
      </div>
    </div>
  );
});
