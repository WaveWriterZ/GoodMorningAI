import { runReferenceMission } from './reference-mission';

describe('Module 62 — reference mission harness', () => {
  it('runs the complete autonomous kernel slice deterministically', () => {
    const result = runReferenceMission({ now: 1_700_000_000_000 });

    expect(result.evaluation.passed).toBe(true);
    expect(result.decision.status).toBe('authorized');
    expect(result.mission.status).toBe('completed');
    expect(result.mission.verification?.status).toBe('verified');
    expect(result.learningObservation?.outcome).toBe('success');
    expect(result.telemetry?.timeline.length).toBeGreaterThanOrEqual(5);
    expect(result.validation.passed).toBe(true);
    expect(result.validation.checks.every((item) => item.passed)).toBe(true);
  });

  it('fails closed when authorization is removed before execution', () => {
    const result = runReferenceMission({ now: 1_700_000_000_000 });
    const authorizationCheck = result.validation.checks.find((item) => item.check === 'authorization');

    expect(authorizationCheck?.passed).toBe(true);
  });
});
