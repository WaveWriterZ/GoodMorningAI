/**
 * Module 63 — Autonomous Evidence-to-Decision Runtime Bridge
 *
 * Connects the trust/provenance layer to decision evaluation without allowing
 * callers to declare evidence trusted. Evidence must pass the real Module 54
 * assessment before it can support a Module 55 decision.
 */

import {
  EvidenceBundle,
  EvidenceAssessment,
  assessEvidence,
  traceEvidence,
} from './trust';
import {
  DecisionEvaluation,
  DecisionRecord,
  evaluateDecision,
} from './decision';

export interface EvidenceDecisionBridgeInput {
  decision: DecisionRecord;
  evidence: EvidenceBundle[];
  now?: number;
}

export interface EvidenceDecisionBridgeResult {
  decision: DecisionRecord;
  assessments: EvidenceAssessment[];
  trustedEvidenceIds: string[];
  contradictoryEvidenceIds: string[];
  evaluation: DecisionEvaluation;
  ready: boolean;
  reasons: string[];
}

/**
 * Assess every evidence bundle first, then pass only usable evidence IDs into
 * the decision evaluator. No caller-provided trusted-ID shortcut is allowed.
 */
export function evaluateEvidenceGroundedDecision(
  input: EvidenceDecisionBridgeInput
): EvidenceDecisionBridgeResult {
  const now = input.now ?? Date.now();
  const assessments = input.evidence.map((bundle) => assessEvidence(bundle, now));
  const trustedEvidenceIds = assessments
    .filter((assessment) => assessment.usable)
    .map((assessment) => assessment.evidenceId);

  const contradictoryEvidenceIds = input.evidence
    .filter((bundle) => bundle.evidence.verificationStatus === 'contradicted')
    .map((bundle) => bundle.evidence.id);

  const evaluation = evaluateDecision(input.decision, trustedEvidenceIds);
  const reasons = [...evaluation.reasons];

  if (input.evidence.length === 0) reasons.push('no evidence bundles were supplied');
  if (trustedEvidenceIds.length === 0) reasons.push('no evidence passed Module 54 trust assessment');

  return {
    decision: input.decision,
    assessments,
    trustedEvidenceIds,
    contradictoryEvidenceIds,
    evaluation,
    ready: evaluation.passed && trustedEvidenceIds.length > 0,
    reasons: [...new Set(reasons)],
  };
}

/** Return auditable source → evidence → provenance traces for the bridge input. */
export function traceDecisionEvidence(
  evidence: EvidenceBundle[]
): ReturnType<typeof traceEvidence>[] {
  return evidence.map((bundle) => traceEvidence(bundle));
}
