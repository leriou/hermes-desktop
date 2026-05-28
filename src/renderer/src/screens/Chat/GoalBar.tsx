interface GoalBarProps { summary: string; progressLabel?: string; }
export function GoalBar({ summary, progressLabel }: GoalBarProps): React.JSX.Element {
  return (
    <div className="chat-goal-bar">
      <span className="chat-goal-bar-icon">🎯</span>
      <span className="chat-goal-bar-text">{summary}</span>
      {progressLabel && <span className="chat-goal-bar-progress">{progressLabel}</span>}
    </div>
  );
}
