/**
 * Module 54 — Autonomous Trust, Provenance & Evidence Fabric
 *
 * Gives autonomous learning a typed, auditable evidence chain. Evidence is
 * assessed for provenance, freshness, relevance, and verification before it
 * can be treated as strong support for downstream learning or decisions.
 */

export type EvidenceSourceType =
  | 'user'
  | 'system'
  | 'agent'
  | 'external'
  | 'dataset'
  | 'document';

export type VerificationStatus =
  | 'unverified'
  | 'verified'
  | 'uncertain'
  | 'contradicted'
  | 'retracted';

export interface EvidenceSource {
  id: string;
  type: EvidenceSourceType;
  locator: string;
  provider?: string;
  capturedAt: number;
  trust: number;
}

export interface EvidenceRecord {
  id: string;
  sourceId: string;
  contentHash: string;
  observedAt: number;
  capturedAt: number;
  freshnessSeconds?: number;
  verificationStatus: VerificationStatus;
  confidence: number;
  supersedes?: string;
}

export interface ProvenanceRecord {
  id: string;
  evidenceId: string;
  origin: string;
  transformation?: string;
  actor: string;
  timestamp: number;
}

export interface EvidenceAssessment {
  evidenceId: string;
  validity: number;
  relevance: number;
  freshness: number;
  confidence: number;
  usable: boolean;
  reasons: string[];
}

export interface EvidenceBundle {
  evidence: EvidenceRecord;
  source: EvidenceSource;
  provenance: ProvenanceRecord[];
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function freshnessScore(ageSeconds: number, freshnessSeconds?: number): number {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return 0;
  if (!freshnessSeconds || freshnessSeconds <= 0) return ageSeconds === 0 ? 1 : 0;
  if (ageSeconds <= freshnessSeconds) return 1;
  return clamp(1 - (ageSeconds - freshnessSeconds) / freshnessSeconds);
}

/** Normalize trust-bearing fields without changing their semantic meaning. */
export function normalizeEvidenceSource(source: EvidenceSource): EvidenceSource {
  return { ...source, trust: clamp(source.trust) };
}

export function normalizeEvidence(record: EvidenceRecord): EvidenceRecord {
  return {
    ...record,
    confidence: clamp(record.confidence),
  };
}

/**
 * Assess evidence for use at a specific point in time. Retracted and
 * contradicted evidence is never considered usable.
 */
export function assessEvidence(
  bundle: EvidenceBundle,
  now = Date.now()
): EvidenceAssessment {
  const evidence = normalizeEvidence(bundle.evidence);
  const source = normalizeEvidenceSource(bundle.source);
  const ageSeconds = Math.max(0, (now - evidence.observedAt) / 1000);
  const freshness = freshnessScore(ageSeconds, evidence.freshnessSeconds);
  const validity = evidence.verificationStatus === 'verified'
    ? 1
    : evidence.verificationStatus === 'unverified'
      ? 0.5
      : 0;
  const relevance = 1;
  const confidence = clamp(evidence.confidence * source.trust * validity);
  const reasons: string[] = [];

  if (evidence.verificationStatus === 'retracted') reasons.push('evidence is retracted');
  if (evidence.verificationStatus === 'contradicted') reasons.push('evidence is contradicted');
  if (source.trust < 0.5) reasons.push('source trust is below the strong-support threshold');
  if (freshness < 0.5) reasons.push('evidence is stale for the declared freshness window');
  if (confidence < 0.5) reasons.push('combined confidence is below the usable threshold');

  return {
    evidenceId: evidence.id,
    validity,
    relevance,
    freshness,
    confidence,
    usable:
      validity > 0 &&
      relevance >= 0.5 &&
      freshness >= 0.5 &&
      confidence >= 0.5,
    reasons,
  };
}

/** Return the evidence chain in source → evidence → provenance order. */
export function traceEvidence(bundle: EvidenceBundle): {
  source: EvidenceSource;
  evidence: EvidenceRecord;
  provenance: ProvenanceRecord[];
} {
  return {
    source: normalizeEvidenceSource(bundle.source),
    evidence: normalizeEvidence(bundle.evidence),
    provenance: [...bundle.provenance].sort((a, b) => a.timestamp - b.timestamp),
  };
}

/** Require every supplied evidence item to pass its trust assessment. */
export function allEvidenceUsable(
  bundles: EvidenceBundle[],
  now = Date.now()
): boolean {
  return bundles.length > 0 && bundles.every((bundle) => assessEvidence(bundle, now).usable);
}
