/**
 * Module 55 — Autonomous Decision Intelligence & Evidence-Grounded Reasoning Fabric
 *
 * Builds bounded, auditable decisions from trusted evidence. This module
 * evaluates alternatives and constraints but never grants authorization or
 * executes external side effects by itself.
 */

export type DecisionRisk = 'low' | 'medium' | 'high' | 'critical';
export type DecisionStatus = 'proposed' | 'evaluated' | 'authorized' | 'rejected';

export interface DecisionAlternative {
  id: string;
  description: string;
  expectedOutcome: string;
  risk: DecisionRisk;
}

export interface DecisionRecord {
  id: string;
  goalId: string;
  objective: string;
  alternatives: DecisionAlternative[];
  selectedAlternativeId?: string;
  supportingEvidenceIds: string[];
  contradictoryEvidenceIds: string[];
  assumptions: string[];
  constraints: string[];
  risk: DecisionRisk;
  confidence: number;
  rationale: string;
  expectedOutcome: string;
  verificationPlan: string;
  status: DecisionStatus;
  createdAt: number;
}

export interface DecisionEvaluation {
  decisionId: string;
  evidenceSufficient: boolean;
  selectedAlternativeValid: boolean;
  confidence: number;
  reasons: string[];
  passed: boolean;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeDecision(decision: DecisionRecord): DecisionRecord {
  return {
    ...decision,
    confidence: clamp(decision.confidence),
    supportingEvidenceIds: [...new Set(decision.supportingEvidenceIds)].filter(Boolean),
    contradictoryEvidenceIds: [...new Set(decision.contradictoryEvidenceIds)].filter(Boolean),
    assumptions: [...decision.assumptions],
    constraints: [...decision.constraints],
    alternatives: decision.alternatives.map((alternative) => ({ ...alternative })),
  };
}

/** A decision must have a selected, known alternative and at least one support item. */
export function evaluateDecision(
  decision: DecisionRecord,
  trustedEvidenceIds: string[]
): DecisionEvaluation {
  const normalized = normalizeDecision(decision);
  const trusted = new Set(trustedEvidenceIds);
  const selected = normalized.alternatives.find(
    (alternative) => alternative.id === normalized.selectedAlternativeId
  );
  const evidenceSufficient = normalized.supportingEvidenceIds.some((id) => trusted.has(id));
  const selectedAlternativeValid = Boolean(selected);
  const reasons: string[] = [];

  if (!selectedAlternativeValid) reasons.push('selected alternative is missing or unknown');
  if (!evidenceSufficient) reasons.push('no supporting evidence passed the trust gate');
  if (normalized.contradictoryEvidenceIds.length > 0) {
    reasons.push('contradictory evidence is present and must be considered');
  }
  if (normalized.confidence < 0.5) reasons.push('decision confidence is below the evaluation threshold');
  if (!normalized.rationale.trim()) reasons.push('decision rationale is missing');
  if (!normalized.verificationPlan.trim()) reasons.push('verification plan is missing');

  return {
    decisionId: normalized.id,
    evidenceSufficient,
    selectedAlternativeValid,
    confidence: normalized.confidence,
    reasons,
    passed:
      evidenceSufficient &&
      selectedAlternativeValid &&
      normalized.confidence >= 0.5 &&
      normalized.rationale.trim().length > 0 &&
      normalized.verificationPlan.trim().length > 0,
  };
}

/** Evaluation records readiness; it does not authorize or execute the decision. */
export function markDecisionEvaluated(
  decision: DecisionRecord,
  evaluation: DecisionEvaluation
): DecisionRecord {
  return {
    ...normalizeDecision(decision),
    status: evaluation.passed ? 'evaluated' : 'rejected',
  };
}

/** Authorization is explicit and separate from evaluation. */
export function authorizeDecision(
  decision: DecisionRecord,
  authorized: boolean
): DecisionRecord {
  const normalized = normalizeDecision(decision);
  if (normalized.status !== 'evaluated' || !authorized) {
    return { ...normalized, status: authorized ? 'rejected' : normalized.status };
  }
  return { ...normalized, status: 'authorized' };
}
