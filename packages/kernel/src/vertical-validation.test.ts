import { validateVerticalSlice } from './vertical-validation';
import { DecisionRecord } from './decision';
import { MissionExecution } from './mission-execution';
import { MissionEvent } from './mission-events';
import { LearningObservation } from './learning';

describe('Module 61 — vertical slice validation', () => {
  const decision: DecisionRecord = {
    id: 'decision-1',
    goalId: 'goal-1',
    objective: 'complete reference mission',
    alternatives: [{ id: 'a', description: 'approved path', expectedOutcome: 'done', risk: 'low' }],
    selectedAlternativeId: 'a',
    supportingEvidenceIds: ['e1'],
    contradictoryEvidenceIds: [],
    assumptions: [],
    constraints: [],
    risk: 'low',
    confidence: 0.9,
    rationale: 'trusted evidence supports the selected path',
    expectedOutcome: 'done',
    verificationPlan: 'verify completion',
    status: 'authorized',
    createdAt: 100,
  };

  const evaluation = {
    decisionId: 'decision-1',
    evidenceSufficient: true,
    selectedAlternativeValid: true,
    confidence: 0.9,
    reasons: [],
    passed: true,
  };

  const execution: MissionExecution = {
    missionId: 'mission-1',
    decisionId: 'decision-1',
    request: {
      requestId: 'request-1',
      decisionId: 'decision-1',
      actorId: 'actor-1',
      capabilityId: 'capability-1',
      target: 'reference-target',
      action: 'reference-action',
    } as MissionExecution['request'],
    status: 'completed',
    createdAt: 100,
    updatedAt: 200,
    verification: { status: 'verified', reasons: [], receiptId: 'receipt-1' } as MissionExecution['verification'],
  };

  const events: MissionEvent[] = [
    { eventId: '1', missionId: 'mission-1', decisionId: 'decision-1', eventType: 'MISSION_CREATED', currentState: 'created', timestamp: 100, correlationId: 'c1' },
    { eventId: '2', missionId: 'mission-1', decisionId: 'decision-1', eventType: 'MISSION_COMPLETED', currentState: 'completed', timestamp: 200, correlationId: 'c1' },
  ];

  const learningObservation: LearningObservation = {
    id: 'observation-1',
    domain: 'mission',
    subjectId: 'mission-1',
    outcome: 'success',
    evidence: ['e1'],
    timestamp: 200,
    confidence: 1,
  };

  it('passes a complete authorized, verified, observable learning slice', () => {
    const report = validateVerticalSlice({ decision, evaluation, execution, events, learningObservation });
    expect(report.passed).toBe(true);
    expect(report.checks.every((item) => item.passed)).toBe(true);
    expect(report.trace).toEqual(['decision:decision-1', 'mission:mission-1', 'events:2', 'verified:true', 'learning:true']);
  });

  it('fails closed when verification is not complete', () => {
    const report = validateVerticalSlice({
      decision,
      evaluation,
      execution: { ...execution, status: 'recovery_required', verification: { status: 'failed', reasons: ['mismatch'] } as MissionExecution['verification'] },
      events,
      learningObservation: { ...learningObservation, outcome: 'failure' },
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((item) => item.check === 'verification')?.passed).toBe(false);
    expect(report.checks.find((item) => item.check === 'learning')?.passed).toBe(false);
  });
});
