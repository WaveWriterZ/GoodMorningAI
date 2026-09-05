import {
  allEvidenceUsable,
  assessEvidence,
  traceEvidence,
  EvidenceBundle,
} from './trust';

describe('Module 54 — Trust, Provenance & Evidence', () => {
  const bundle: EvidenceBundle = {
    source: {
      id: 'source-1',
      type: 'document',
      locator: 'doc://example',
      provider: 'test-provider',
      capturedAt: 1_000,
      trust: 0.9,
    },
    evidence: {
      id: 'evidence-1',
      sourceId: 'source-1',
      contentHash: 'sha256:test',
      observedAt: 1_000,
      capturedAt: 1_000,
      freshnessSeconds: 100,
      verificationStatus: 'verified',
      confidence: 0.9,
    },
    provenance: [
      { id: 'p-2', evidenceId: 'evidence-1', origin: 'transform-2', actor: 'agent', timestamp: 3 },
      { id: 'p-1', evidenceId: 'evidence-1', origin: 'source', actor: 'system', timestamp: 2 },
    ],
  };

  it('accepts fresh verified evidence from a trusted source', () => {
    const assessment = assessEvidence(bundle, 1_050);
    expect(assessment.usable).toBe(true);
    expect(assessment.confidence).toBeGreaterThan(0.7);
  });

  it('rejects retracted or contradicted evidence', () => {
    expect(
      assessEvidence({
        ...bundle,
        evidence: { ...bundle.evidence, verificationStatus: 'retracted' },
      }, 1_050).usable,
    ).toBe(false);

    expect(
      assessEvidence({
        ...bundle,
        evidence: { ...bundle.evidence, verificationStatus: 'contradicted' },
      }, 1_050).usable,
    ).toBe(false);
  });

  it('rejects evidence that is stale for its declared freshness window', () => {
    const assessment = assessEvidence(bundle, 1_500);
    expect(assessment.usable).toBe(false);
    expect(assessment.reasons).toContain('evidence is stale for the declared freshness window');
  });

  it('requires every evidence item to be usable', () => {
    expect(allEvidenceUsable([bundle], 1_050)).toBe(true);
    expect(
      allEvidenceUsable([
        bundle,
        {
          ...bundle,
          evidence: { ...bundle.evidence, id: 'evidence-2', verificationStatus: 'unverified' },
        },
      ], 1_050),
    ).toBe(false);
  });

  it('returns an ordered provenance chain', () => {
    const trace = traceEvidence(bundle);
    expect(trace.provenance.map((item) => item.id)).toEqual(['p-1', 'p-2']);
  });
});
