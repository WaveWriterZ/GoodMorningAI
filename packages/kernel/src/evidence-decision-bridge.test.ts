import {
  evaluateEvidenceGroundedDecision,
  traceDecisionEvidence,
} from './evidence-decision-bridge';
import { DecisionRecord } from './decision';
import { EvidenceBundle } from './trust';

const now = 1_700_000_000_000;

function decision(): DecisionRecord {
  return {
    id: 'decision-63',
    goalId: 'goal-63',
    objective: 'prove evidence-grounded evaluation',
    alternatives: [{
      id: 'alt-63',
      description: 'use verified evidence',
      expectedOutcome: 'decision is ready',
      risk: 'low',
    }],
    selectedAlternativeId: 'alt-63',
    supportingEvidenceIds: ['evidence-63'],
    contradictoryEvidenceIds: [],
    assumptions: [],
    constraints: ['no external side effects'],
    risk: 'low',
    confidence: 0.9,
    rationale: 'verified evidence is required before evaluation',
    expectedOutcome: 'decision is ready',
    verificationPlan: 'verify downstream execution outcome',
    status: 'proposed',
    createdAt: now,
  };
}

function bundle(status: EvidenceBundle['evidence']['verificationStatus'] = 'verified'): EvidenceBundle {
  return {
    source: {
      id: 'source-63',
      type: 'document',
      locator: 'reference://module-63',
      capturedAt: now,
      trust: 1,
    },
    evidence: {
      id: 'evidence-63',
      sourceId: 'source-63',
      contentHash: 'hash-63',
      observedAt: now,
      capturedAt: now,
      freshnessSeconds: 3600,
      verificationStatus: status,
      confidence: 1,
    },
    provenance: [{
      id: 'prov-63',
      evidenceId: 'evidence-63',
      origin: 'reference',
      actor: 'module-63-test',
      timestamp: now,
    }],
  };
}

describe('Module 63 evidence-to-decision bridge', () => {
  it('uses Module 54 assessment instead of caller-declared trust', () => {
    const result = evaluateEvidenceGroundedDecision({
      decision: decision(),
      evidence: [bundle('verified')],
      now,
    });

    expect(result.trustedEvidenceIds).toEqual(['evidence-63']);
    expect(result.assessments[0].usable).toBe(true);
    expect(result.ready).toBe(true);
    expect(result.evaluation.passed).toBe(true);
  });

  it('rejects contradicted evidence before decision evaluation', () => {
    const result = evaluateEvidenceGroundedDecision({
      decision: decision(),
      evidence: [bundle('contradicted')],
      now,
    });

    expect(result.trustedEvidenceIds).toEqual([]);
    expect(result.contradictoryEvidenceIds).toEqual(['evidence-63']);
    expect(result.ready).toBe(false);
    expect(result.evaluation.evidenceSufficient).toBe(false);
  });

  it('fails closed when evidence is absent', () => {
    const result = evaluateEvidenceGroundedDecision({
      decision: decision(),
      evidence: [],
      now,
    });

    expect(result.ready).toBe(false);
    expect(result.trustedEvidenceIds).toEqual([]);
    expect(result.evaluation.passed).toBe(false);
  });

  it('preserves auditable provenance traces', () => {
    const traces = traceDecisionEvidence([bundle()]);
    expect(traces[0].source.id).toBe('source-63');
    expect(traces[0].evidence.id).toBe('evidence-63');
    expect(traces[0].provenance[0].id).toBe('prov-63');
  });
});
