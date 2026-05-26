import { useState, memo } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type { TodoItem } from "../../screens/Chat/types";

interface TodoPanelProps {
  todos: TodoItem[];
  defaultCollapsed?: boolean;
}

export const TodoPanel = memo(function TodoPanel({
  todos,
  defaultCollapsed = true,
}: TodoPanelProps): React.JSX.Element | null {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!todos || todos.length === 0) {
    return null;
  }

  const completedCount = todos.filter((t) => t.status === "completed").length;
  const inProgressCount = todos.filter((t) => t.status === "in_progress").length;
  const isAllDone = completedCount === todos.length;

  let briefStatus = "ready";
  if (isAllDone) {
    briefStatus = "completed";
  } else if (inProgressCount > 0) {
    briefStatus = "in_progress";
  }

  return (
    <div className={`todo-panel ${isAllDone ? "todo-panel-done" : ""}`}>
      <button
        type="button"
        className="todo-panel-header"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="todo-panel-arrow">
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
        <span className="todo-panel-title">Tasks</span>
        <span className="todo-panel-count">
          ({completedCount}/{todos.length})
        </span>
        {briefStatus === "in_progress" && (
          <span className="todo-panel-status-tag todo-panel-status-running">
            <Loader2 size={12} className="animate-spin mr-1 inline" />
            running
          </span>
        )}
        {isAllDone && (
          <span className="todo-panel-status-tag todo-panel-status-complete">
            complete
          </span>
        )}
      </button>

      {!collapsed && (
        <ul className="todo-panel-list">
          {todos.map((todo) => {
            let icon = <Circle size={14} className="todo-icon-pending" />;
            if (todo.status === "completed") {
              icon = <CheckCircle2 size={14} className="todo-icon-completed" />;
            } else if (todo.status === "in_progress") {
              icon = <Loader2 size={14} className="todo-icon-in-progress animate-spin" />;
            } else if (todo.status === "cancelled") {
              icon = <XCircle size={14} className="todo-icon-cancelled" />;
            }

            return (
              <li
                key={todo.id}
                className={`todo-panel-item todo-item-${todo.status}`}
              >
                <span className="todo-item-icon">{icon}</span>
                <span className="todo-item-content">{todo.content}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
