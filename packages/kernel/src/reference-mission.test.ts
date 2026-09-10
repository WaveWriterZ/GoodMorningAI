import { runReferenceMission } from './reference-mission';

describe('Module 62/63 — reference mission harness', () => {
  it('runs the complete autonomous kernel slice deterministically', () => {
    const result = runReferenceMission({ now: 1_700_000_000_000 });

    expect(result.evaluation.evaluation.passed).toBe(true);
    expect(result.evaluation.ready).toBe(true);
    expect(result.evaluation.trustedEvidenceIds).toEqual(['reference-evidence-1']);
    expect(result.decision.status).toBe('authorized');
    expect(result.mission.status).toBe('completed');
    expect(result.mission.verification?.status).toBe('verified');
    expect(result.learningObservation?.outcome).toBe('success');
    expect(result.telemetry?.timeline.length).toBeGreaterThanOrEqual(5);
    expect(result.validation.passed).toBe(true);
    expect(result.validation.checks.every((item) => item.passed)).toBe(true);
  });

  it('produces a trace that identifies the mission, decision, events, and learning outcome', () => {
    const result = runReferenceMission({
      now: 1_700_000_000_000,
      missionId: 'mission-trace-test',
      decisionId: 'decision-trace-test',
    });

    expect(result.validation.trace).toEqual([
      'decision:decision-trace-test',
      'mission:mission-trace-test',
      expect.stringMatching(/^events:\d+$/),
      'verified:true',
      'learning:true',
    ]);
  });
});
