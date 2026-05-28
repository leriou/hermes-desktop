import { Target } from "lucide-react";
interface GoalBarProps { summary: string; progressLabel?: string; }
export function GoalBar({ summary, progressLabel }: GoalBarProps): React.JSX.Element {
  return (
    <div className="chat-goal-bar">
      <Target size={13} className="chat-goal-bar-icon" />
      <span className="chat-goal-bar-text">{summary}</span>
      {progressLabel && <span className="chat-goal-bar-progress">{progressLabel}</span>}
    </div>
  );
}
