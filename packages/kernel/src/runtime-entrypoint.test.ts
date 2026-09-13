import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityGateway } from './capability-gateway';
import { createPersistenceBackedRuntime } from './runtime-entrypoint';
import { EvidenceBundle } from './trust';
import { DecisionRecord } from './decision';

function fixturePaths(root: string) {
  return {
    evidence: join(root, 'evidence.json'),
    missions: join(root, 'missions.json'),
    learning: join(root, 'learning.json'),
    events: join(root, 'events.json'),
  };
}

function adapter() {
  return {
    capabilityId: 'reference.echo',
    version: '1.0.0',
    preflight: () => ({ status: 'ready', reasons: ['ok'] }),
    execute: () => ({ status: 'succeeded', reasons: ['executed'] }),
    verify: () => ({ status: 'verified', reasons: ['verified'] }),
    rollback: () => ({ status: 'verified', reasons: ['rolled back'] }),
    health: () => ({ healthy: true, reasons: ['ok'] }),
  } as never;
}

describe('Module 66 persistence-backed runtime', () => {
  it('persists a mission and refuses replay after runtime restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'goodmorning-runtime-'));
    try {
      const paths = fixturePaths(root);
      const gateway = new CapabilityGateway({
        adapters: [adapter()],
      } as never);
      const runtimeA = createPersistenceBackedRuntime({ ...paths, gateway });

      const evidence: EvidenceBundle = {
        source: { id: 'source-1', name: 'Reference Source', trustScore: 1 },
        evidence: {
          id: 'evidence-1',
          statement: 'reference evidence',
          verified: true,
          confidence: 1,
          observedAt: 1000,
        },
        provenance: [{ sourceId: 'source-1', evidenceId: 'evidence-1', relation: 'supports' }],
      } as never;
      runtimeA.repositories.evidence.save(evidence);

      const decision: DecisionRecord = {
        id: 'decision-1',
        objective: 'run reference capability',
        status: 'proposed',
        alternatives: [],
        requiredEvidence: ['evidence-1'],
        rationale: 'deterministic reference mission',
        confidence: 1,
      } as never;

      const grounded = runtimeA.groundDecision(decision, 1000);
      const request = {
        requestId: 'request-1',
        decisionId: 'decision-1',
        capabilityId: 'reference.echo',
        target: 'reference',
        payload: { hello: 'world' },
      } as never;
      const policy = {
        authorizationValid: true,
        permissionGranted: true,
        safetyPassed: true,
        targetIntact: true,
        evidenceValid: true,
      } as never;

      const result = runtimeA.runMission('mission-1', grounded, request, policy, 2000);
      expect(result.mission.status).toBe('completed');
      expect(runtimeA.repositories.missions.get('mission-1')?.status).toBe('completed');

      const runtimeB = createPersistenceBackedRuntime({ ...paths, gateway });
      expect(runtimeB.repositories.missions.get('mission-1')?.status).toBe('completed');
      expect(() => runtimeB.runMission('mission-1', grounded, request, policy, 3000)).toThrow(/already persisted/);
      expect(runtimeB.recoverMission('mission-1').action).toBe('already_terminal');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
