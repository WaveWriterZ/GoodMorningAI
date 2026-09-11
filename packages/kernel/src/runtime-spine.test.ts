import { describe, expect, it } from '@jest/globals';
import { CapabilityAdapter, CapabilityGateway } from './capability-gateway';
import { DecisionRecord } from './decision';
import { EvidenceBundle } from './trust';
import {
  AutonomousRuntime,
  InMemoryEvidenceRepository,
  InMemoryLearningObservationRepository,
  InMemoryMissionRepository,
} from './runtime-spine';

const now = 1_700_000_000_000;

const decision: DecisionRecord = {
  id: 'decision-64',
  goalId: 'goal-64',
  objective: 'run the reference runtime spine',
  alternatives: [{
    id: 'alternative-64',
    description: 'execute the approved reference capability',
    expectedOutcome: 'verified result',
    risk: 'low',
  }],
  selectedAlternativeId: 'alternative-64',
  supportingEvidenceIds: ['evidence-64'],
  contradictoryEvidenceIds: [],
  assumptions: ['reference adapter is deterministic'],
  constraints: ['no external side effects'],
  risk: 'low',
  confidence: 1,
  rationale: 'Validate the composed autonomous runtime.',
  expectedOutcome: 'verified result',
  verificationPlan: 'adapter verification must pass',
  status: 'proposed',
  createdAt: now,
};

const evidence: EvidenceBundle = {
  source: {
    id: 'source-64',
    type: 'document',
    locator: 'reference://module-64',
    provider: 'goodmorning-reference',
    capturedAt: now,
    trust: 1,
  },
  evidence: {
    id: 'evidence-64',
    sourceId: 'source-64',
    contentHash: 'hash-64',
    observedAt: now,
    capturedAt: now,
    freshnessSeconds: 3600,
    verificationStatus: 'verified',
    confidence: 1,
  },
  provenance: [{
    id: 'provenance-64',
    evidenceId: 'evidence-64',
    origin: 'reference-harness',
    actor: 'test',
    timestamp: now,
  }],
};

function createAdapter(): CapabilityAdapter {
  return {
    capabilityId: 'reference.64',
    version: '1.0.0',
    preflight: () => ({ passed: true, reasons: [] }),
    execute: (request) => ({ succeeded: true, output: `ok:${request.action}`, completedAt: now }),
    verify: () => ({ passed: true, reasons: ['verified'], verifiedAt: now }),
  };
}

describe('Module 64 autonomous runtime spine', () => {
  it('composes evidence, decision, mission, telemetry, persistence, and validation', () => {
    const evidenceRepo = new InMemoryEvidenceRepository();
    const missionRepo = new InMemoryMissionRepository();
    const learningRepo = new InMemoryLearningObservationRepository();
    evidenceRepo.save(evidence);

    const gateway = new CapabilityGateway();
    gateway.register(createAdapter());
    const runtime = new AutonomousRuntime({
      evidence: evidenceRepo,
      missions: missionRepo,
      learning: learningRepo,
      gateway,
      actorId: 'runtime-test',
    });

    const grounded = runtime.groundDecision(decision, now);
    expect(grounded.grounding.ready).toBe(true);
    expect(grounded.decision.status).toBe('authorized');
    expect(grounded.grounding.trustedEvidenceIds).toEqual(['evidence-64']);

    const result = runtime.runMission(
      'mission-64',
      grounded,
      {
        requestId: 'request-64',
        decisionId: grounded.decision.id,
        authorizationId: 'authorization-64',
        actorId: 'runtime-test',
        capabilityId: 'reference.64',
        target: 'reference://mission-64',
        action: 'prove-spine',
      },
      {
        authorizationValid: true,
        permissionGranted: true,
        safetyPassed: true,
        targetUnchanged: true,
        requiredEvidenceValid: true,
      },
      now,
    );

    expect(result.mission.status).toBe('completed');
    expect(result.mission.verification?.status).toBe('verified');
    expect(result.validation.passed).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.telemetry?.missionId).toBe('mission-64');
    expect(missionRepo.get('mission-64')?.status).toBe('completed');
    expect(learningRepo.listBySubject('mission-64')).toHaveLength(1);
  });

  it('fails closed when repository evidence is unusable', () => {
    const evidenceRepo = new InMemoryEvidenceRepository();
    evidenceRepo.save({
      ...evidence,
      evidence: { ...evidence.evidence, verificationStatus: 'retracted' },
    });
    const gateway = new CapabilityGateway();
    gateway.register(createAdapter());
    const runtime = new AutonomousRuntime({
      evidence: evidenceRepo,
      missions: new InMemoryMissionRepository(),
      learning: new InMemoryLearningObservationRepository(),
      gateway,
    });

    const grounded = runtime.groundDecision(decision, now);
    expect(grounded.grounding.ready).toBe(false);
    expect(grounded.decision.status).toBe('rejected');
    expect(grounded.grounding.trustedEvidenceIds).toEqual([]);
  });

  it('requires the mission request to reference the authorized decision', () => {
    const evidenceRepo = new InMemoryEvidenceRepository();
    evidenceRepo.save(evidence);
    const gateway = new CapabilityGateway();
    gateway.register(createAdapter());
    const runtime = new AutonomousRuntime({
      evidence: evidenceRepo,
      missions: new InMemoryMissionRepository(),
      learning: new InMemoryLearningObservationRepository(),
      gateway,
    });
    const grounded = runtime.groundDecision(decision, now);

    expect(() => runtime.runMission(
      'mission-mismatch',
      grounded,
      {
        requestId: 'request-mismatch', decisionId: 'wrong-decision', authorizationId: 'auth',
        actorId: 'test', capabilityId: 'reference.64', target: 'reference://x', action: 'x',
      },
      {
        authorizationValid: true, permissionGranted: true, safetyPassed: true,
        targetUnchanged: true, requiredEvidenceValid: true,
      },
      now,
    )).toThrow('request decisionId must match authorized decision');
  });
});
