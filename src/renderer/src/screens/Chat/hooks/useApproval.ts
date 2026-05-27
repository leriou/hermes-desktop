import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_JUDGMENT_SETTINGS,
  createRuleBasedJudgmentEngine,
  type JudgmentAdvice,
} from "../judgmentEngine";
import {
  createApprovalHistoryEntry,
  getImmediateApprovalDecision,
  loadApprovalHistory,
  loadApprovalPolicy,
  normalizeApprovalPolicy,
  pruneApprovalHistory,
  saveApprovalHistory,
  saveApprovalPolicy,
  type ApprovalDecision,
  type ApprovalDecisionSource,
  type ApprovalPolicy,
} from "../approvalPolicy";
import type { ApprovalRequest } from "../types";

interface UseApprovalOptions {
  sessionId: string | null;
  hermesSessionId: string | null;
  pendingApproval: ApprovalRequest | null;
  onSessionStateChange?: (patch: { pendingApproval?: ApprovalRequest | null }) => void;
  respondApproval: (sid: string, decision: ApprovalDecision, auto: boolean) => Promise<void>;
  addErrorEvent: (error: unknown) => void;
  currentModel: string;
  displayModel: string;
}

export function useApproval({
  sessionId,
  hermesSessionId,
  pendingApproval,
  onSessionStateChange,
  respondApproval,
  addErrorEvent,
  currentModel,
  displayModel,
}: UseApprovalOptions) {
  const [approvalPolicy, setApprovalPolicyState] = useState<ApprovalPolicy>(
    () => loadApprovalPolicy(),
  );
  const [approvalHistory, setApprovalHistory] = useState(() =>
    loadApprovalHistory(sessionId || ""),
  );
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [dismissedApproval, setDismissedApproval] =
    useState<ApprovalRequest | null>(null);
  const [approvalJudgment, setApprovalJudgment] =
    useState<JudgmentAdvice | null>(null);
  const approvalSubmittingRef = useRef(false);
  const judgmentEngine = useMemo(() => createRuleBasedJudgmentEngine(), []);

  const setApprovalPolicy = useCallback(
    (next: ApprovalPolicy) => {
      const normalized = normalizeApprovalPolicy(next);
      setApprovalPolicyState(normalized);
      saveApprovalPolicy(normalized);
      setApprovalHistory((prev) => {
        const pruned = pruneApprovalHistory(
          prev,
          Date.now(),
          normalized.historyTtlMinutes,
        );
        saveApprovalHistory(sessionId || "", pruned);
        return pruned;
      });
    },
    [sessionId],
  );

  const visibleApproval =
    pendingApproval && pendingApproval !== dismissedApproval
      ? pendingApproval
      : null;

  const recordApprovalDecision = useCallback(
    (
      request: NonNullable<ApprovalRequest>,
      decision: ApprovalDecision,
      source: ApprovalDecisionSource,
    ) => {
      const judgment = approvalJudgment
        ? {
            reason: approvalJudgment.reason,
            confidence: approvalJudgment.confidence,
            risk: approvalJudgment.risk,
          }
        : undefined;
      const entry = createApprovalHistoryEntry(
        request,
        decision,
        source,
        Date.now(),
        judgment,
      );
      setApprovalHistory((prev) => {
        const next = pruneApprovalHistory(
          [...prev, entry],
          Date.now(),
          approvalPolicy.historyTtlMinutes,
        );
        saveApprovalHistory(sessionId || "", next);
        return next;
      });
    },
    [approvalJudgment, approvalPolicy.historyTtlMinutes, sessionId],
  );

  const handleDismissApprovalHistory = useCallback(() => {
    setApprovalHistory([]);
    saveApprovalHistory(sessionId || "", []);
  }, [sessionId]);

  const handleApprovalDecision = useCallback(
    async (
      decision: ApprovalDecision,
      source: ApprovalDecisionSource,
    ) => {
      const request = visibleApproval;
      const sid = hermesSessionId ?? sessionId;
      if (!request || !sid || approvalSubmittingRef.current) return;
      approvalSubmittingRef.current = true;
      setApprovalSubmitting(true);
      setDismissedApproval(request);
      setApprovalJudgment(null);
      onSessionStateChange?.({ pendingApproval: null });
      recordApprovalDecision(request, decision, source);
      try {
        await respondApproval(sid, decision, false);
      } catch (err) {
        addErrorEvent(err);
      } finally {
        approvalSubmittingRef.current = false;
        setApprovalSubmitting(false);
      }
    },
    [
      addErrorEvent,
      hermesSessionId,
      onSessionStateChange,
      recordApprovalDecision,
      respondApproval,
      sessionId,
      visibleApproval,
    ],
  );

  useEffect(() => {
    if (!visibleApproval) return;
    const immediate = getImmediateApprovalDecision(approvalPolicy);
    if (!immediate) return;
    void handleApprovalDecision(immediate.decision, immediate.source);
  }, [approvalPolicy, handleApprovalDecision, visibleApproval]);

  useEffect(() => {
    let cancelled = false;
    if (!visibleApproval) {
      setApprovalJudgment(null);
      return;
    }
    void judgmentEngine
      .judgeApproval({
        request: visibleApproval,
        settings: {
          ...DEFAULT_JUDGMENT_SETTINGS,
          enabled: true,
          model: currentModel || displayModel,
          allowAutoDecision: false,
        },
      })
      .then((advice) => {
        if (!cancelled) setApprovalJudgment(advice);
      })
      .catch(() => {
        if (!cancelled) setApprovalJudgment(null);
      });
    return () => {
      cancelled = true;
    };
  }, [judgmentEngine, currentModel, displayModel, visibleApproval]);

  return {
    approvalPolicy,
    approvalHistory,
    approvalSubmitting,
    approvalJudgment,
    visibleApproval,
    setApprovalPolicy,
    handleDismissApprovalHistory,
    handleApprovalDecision,
  };
}
