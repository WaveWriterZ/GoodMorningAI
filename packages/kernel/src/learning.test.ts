import {
  deriveLesson,
  proposeAdaptation,
  evaluateAdaptation,
  approveAndApply,
  canAdapt,
  LearningObservation,
} from './learning';

describe('Module 53 — Autonomous Learning & Adaptation', () => {
  const observations: LearningObservation[] = [
    {
      id: 'obs-1',
      domain: 'mission',
      subjectId: 'mission-1',
      outcome: 'success',
      evidence: ['evidence-1'],
      timestamp: 1,
      confidence: 0.9,
    },
    {
      id: 'obs-2',
      domain: 'mission',
      subjectId: 'mission-1',
      outcome: 'success',
      evidence: ['evidence-2'],
      timestamp: 2,
      confidence: 0.8,
    },
  ];

  it('requires repeated evidence before deriving a lesson', () => {
    expect(deriveLesson([observations[0]])).toBeNull();
    expect(deriveLesson(observations)).not.toBeNull();
  });

  it('keeps low-confidence learning under approval', () => {
    const lesson = deriveLesson(observations)!;
    const proposal = proposeAdaptation(
      { ...lesson, confidence: 0.6 },
      'routing',
      'prefer the higher-performing route',
      'improve mission completion',
    );
    expect(proposal.requiresApproval).toBe(true);
  });

  it('requires evaluation before application', () => {
    const lesson = deriveLesson(observations)!;
    const proposal = proposeAdaptation(
      lesson,
      'workflow',
      'reuse the validated workflow',
      'reduce repeated planning work',
    );
    expect(approveAndApply(proposal)).toMatchObject({ status: 'rejected' });

    const evaluated = evaluateAdaptation(proposal, true);
    expect(approveAndApply(evaluated)).toMatchObject({ status: 'applied' });
  });

  it('does not permit protected system domains', () => {
    expect(canAdapt('identity')).toBe(false);
    expect(canAdapt('consent')).toBe(false);
    expect(canAdapt('safety-policy')).toBe(false);
    expect(canAdapt('authorization')).toBe(false);
    expect(canAdapt('routing')).toBe(true);
  });
});
