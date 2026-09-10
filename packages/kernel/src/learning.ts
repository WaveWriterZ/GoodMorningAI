/**
 * Module 53 — Autonomous Learning & Adaptation Fabric
 *
 * Governs how observed experience becomes bounded adaptation.
 * Learning can update models, routing, recommendations, and preferences;
 * it must not mutate identity, consent, safety policy, or authorization.
 */

export type LearningDomain =
  | 'behavior'
  | 'mission'
  | 'agent'
  | 'forecast'
  | 'capability'
  | 'personalization';

export type AdaptationTarget =
  | 'model'
  | 'routing'
  | 'recommendation'
  | 'preference'
  | 'workflow';

export type LearningStatus = 'proposed' | 'evaluated' | 'approved' | 'applied' | 'rejected';

export interface LearningObservation {
  id: string;
  domain: LearningDomain;
  subjectId: string;
  outcome: 'success' | 'failure' | 'partial' | 'unknown';
  evidence: string[];
  timestamp: number;
  confidence: number;
}

export interface LearningLesson {
  id: string;
  domain: LearningDomain;
  subjectId: string;
  pattern: string;
  evidenceIds: string[];
  confidence: number;
  createdAt: number;
}

export interface AdaptationProposal {
  id: string;
  lessonId: string;
  target: AdaptationTarget;
  change: string;
  expectedBenefit: string;
  risk: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  status: LearningStatus;
  createdAt: number;
}

const PROTECTED_TARGETS = new Set([
  'identity',
  'consent',
  'safety-policy',
  'authorization',
]);

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Normalize an observation without changing its meaning. */
export function normalizeObservation(observation: LearningObservation): LearningObservation {
  return {
    ...observation,
    confidence: clampConfidence(observation.confidence),
    evidence: [...new Set(observation.evidence)].filter(Boolean),
  };
}

/**
 * Convert repeated observations into a lesson only when the evidence supports a pattern.
 * A single observation is deliberately insufficient for autonomous adaptation.
 */
export function deriveLesson(
  observations: LearningObservation[],
  minimumObservations = 2
): LearningLesson | null {
  if (observations.length < minimumObservations) return null;

  const normalized = observations.map(normalizeObservation);
  const first = normalized[0];
  const sameSubject = normalized.every(
    (item) => item.subjectId === first.subjectId && item.domain === first.domain
  );
  if (!sameSubject) return null;

  const successes = normalized.filter((item) => item.outcome === 'success').length;
  const failures = normalized.filter((item) => item.outcome === 'failure').length;
  const outcome = successes > failures ? 'successful' : failures > successes ? 'unsuccessful' : 'mixed';
  const confidence = normalized.reduce((sum, item) => sum + item.confidence, 0) / normalized.length;

  return {
    id: `lesson-${first.domain}-${first.subjectId}-${Date.now()}`,
    domain: first.domain,
    subjectId: first.subjectId,
    pattern: `${outcome} outcome pattern observed across ${normalized.length} observations`,
    evidenceIds: normalized.flatMap((item) => item.evidence),
    confidence: clampConfidence(confidence),
    createdAt: Date.now(),
  };
}

/** Create a bounded adaptation proposal from a validated lesson. */
export function proposeAdaptation(
  lesson: LearningLesson,
  target: AdaptationTarget,
  change: string,
  expectedBenefit: string,
  risk: AdaptationProposal['risk'] = 'low'
): AdaptationProposal {
  const requiresApproval = risk !== 'low' || lesson.confidence < 0.75;

  return {
    id: `adapt-${lesson.id}-${Date.now()}`,
    lessonId: lesson.id,
    target,
    change,
    expectedBenefit,
    risk,
    requiresApproval,
    status: 'proposed',
    createdAt: Date.now(),
  };
}

/**
 * Enforce the autonomy boundary. Protected system domains can never be changed by
 * the learning fabric through an adaptation proposal.
 */
export function canAdapt(target: string): boolean {
  return !PROTECTED_TARGETS.has(target);
}

/** Mark a proposal evaluated without silently applying it. */
export function evaluateAdaptation(
  proposal: AdaptationProposal,
  passed: boolean
): AdaptationProposal {
  return {
    ...proposal,
    status: passed ? 'evaluated' : 'rejected',
  };
}

/** Apply only an evaluated, non-protected adaptation that does not require approval. */
export function approveAndApply(
  proposal: AdaptationProposal,
  approved = false
): AdaptationProposal {
  if (!canAdapt(proposal.target)) {
    return { ...proposal, status: 'rejected' };
  }

  if (proposal.status !== 'evaluated') {
    return { ...proposal, status: 'rejected' };
  }

  if (proposal.requiresApproval && !approved) {
    return { ...proposal, status: 'evaluated' };
  }

  return { ...proposal, status: 'applied' };
}
