import { describe, expect, it } from 'vitest';
import {
  authorizeDecision,
  evaluateDecision,
  markDecisionEvaluated,
  normalizeDecision,
  type DecisionRecord,
} from './decision';

const baseDecision: DecisionRecord = {
  id: 'decision-1',
  goalId: 'goal-1',
  objective: 'Choose a bounded next step',
  alternatives: [
    { id: 'a', description: 'Option A', expectedOutcome: 'A outcome', risk: 'low' },
    { id: 'b', description: 'Option B', expectedOutcome: 'B outcome', risk: 'medium' },
  ],
  selectedAlternativeId: 'a',
  supportingEvidenceIds: ['e1'],
  contradictoryEvidenceIds: [],
  assumptions: [],
  constraints: ['stay within authorized scope'],
  risk: 'low',
  confidence: 0.9,
  rationale: 'Evidence supports option A.',
  expectedOutcome: 'A outcome',
  verificationPlan: 'Verify the outcome after execution.',
  status: 'proposed',
  createdAt: 1000,
};

describe('Module 55 decision intelligence', () => {
  it('normalizes confidence and evidence identifiers', () => {
    const normalized = normalizeDecision({
      ...baseDecision,
      confidence: 2,
      supportingEvidenceIds: ['e1', 'e1', ''],
    });
    expect(normalized.confidence).toBe(1);
    expect(normalized.supportingEvidenceIds).toEqual(['e1']);
  });

  it('requires trusted supporting evidence', () => {
    expect(evaluateDecision(baseDecision, []).passed).toBe(false);
    expect(evaluateDecision(baseDecision, ['e1']).passed).toBe(true);
  });

  it('rejects unknown selected alternatives', () => {
    const evaluation = evaluateDecision(
      { ...baseDecision, selectedAlternativeId: 'missing' },
      ['e1']
    );
    expect(evaluation.passed).toBe(false);
    expect(evaluation.reasons).toContain('selected alternative is missing or unknown');
  });

  it('requires rationale and a verification plan', () => {
    const evaluation = evaluateDecision(
      { ...baseDecision, rationale: '', verificationPlan: '' },
      ['e1']
    );
    expect(evaluation.passed).toBe(false);
  });

  it('keeps contradictory evidence visible instead of treating it as absent', () => {
    const evaluation = evaluateDecision(
      { ...baseDecision, contradictoryEvidenceIds: ['e2'] },
      ['e1']
    );
    expect(evaluation.passed).toBe(true);
    expect(evaluation.reasons).toContain('contradictory evidence is present and must be considered');
  });

  it('separates evaluation from authorization', () => {
    const evaluated = markDecisionEvaluated(baseDecision, evaluateDecision(baseDecision, ['e1']));
    expect(evaluated.status).toBe('evaluated');
    expect(authorizeDecision(evaluated, false).status).toBe('evaluated');
    expect(authorizeDecision(evaluated, true).status).toBe('authorized');
  });

  it('cannot authorize a decision that has not passed evaluation', () => {
    const rejected = markDecisionEvaluated(
      baseDecision,
      evaluateDecision(baseDecision, [])
    );
    expect(rejected.status).toBe('rejected');
    expect(authorizeDecision(rejected, true).status).toBe('rejected');
  });
});
