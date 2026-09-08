/**
 * Module 61 — Autonomous Vertical Slice Validation & Evidence-to-Learning Loop
 *
 * Validates the contracts across Modules 53–60 without granting authority or
 * performing external side effects. It is a deterministic readiness gate for
 * the reference autonomous loop.
 */

import { DecisionRecord, DecisionEvaluation } from './decision';
import { LearningObservation } from './learning';
import { MissionExecution } from './mission-execution';
import { MissionEvent } from './mission-events';

export type ValidationCheck =
  | 'decision'
  | 'authorization'
  | 'execution'
  | 'verification'
  | 'events'
  | 'learning';

export interface VerticalSliceInput {
  decision: DecisionRecord;
  evaluation: DecisionEvaluation;
  execution: MissionExecution;
  events: MissionEvent[];
  learningObservation?: LearningObservation;
}

export interface VerticalSliceCheck {
  check: ValidationCheck;
  passed: boolean;
  reasons: string[];
}

export interface VerticalSliceReport {
  missionId: string;
  passed: boolean;
  checks: VerticalSliceCheck[];
  trace: string[];
}

function check(check: ValidationCheck, passed: boolean, reasons: string[]): VerticalSliceCheck {
  return { check, passed, reasons: [...reasons] };
}

/**
 * Validates one complete reference mission without changing its state.
 * A failed check never triggers recovery or execution; callers own orchestration.
 */
export function validateVerticalSlice(input: VerticalSliceInput): VerticalSliceReport {
  const { decision, evaluation, execution, events, learningObservation } = input;
  const checks: VerticalSliceCheck[] = [];

  checks.push(check('decision', evaluation.passed && decision.id === evaluation.decisionId, [
    ...(evaluation.passed ? [] : ['decision evaluation did not pass']),
    ...(decision.id === evaluation.decisionId ? [] : ['decision/evaluation IDs do not match']),
  ]));

  checks.push(check('authorization', decision.status === 'authorized,', decision.status === 'authorized,' ? [] : ['decision is not explicitly authorized']));

  const executionReady = execution.decisionId === decision.id && execution.request.decisionId === decision.id;
  checks.push(check('execution', executionReady, executionReady ? [] : ['execution is not linked to the decision']))

  const verified = execution.status === 'completed' && execution.verification?.status === 'verified';
  checks.push(check('verification', verified, verified ? [] : ['mission is not verified-complete']));

  const missionEvents = events.filter((event) => event.missionId === execution.missionId);
  const hasCreated = missionEvents.some((event) => event.eventType === 'MISSION_CREATED');
  const hasCompleted = missionEvents.some((event) => event.eventType === 'MISSION_COMPLETED');
  const eventsValid = missionEvents.length > 0 && hasCreated && hasCompleted;
  checks.push(check('events', eventsValid, eventsValid ? [] : ['mission event timeline is incomplete']));

  const learningValid = Boolean(
    learningObservation &&
    learningObservation.subjectId === execution.missionId &&
    learningObservation.outcome === 'success'
  );
  checks.push(check('learning', learningValid, learningValid ? [] : ['verified mission outcome is not represented as a success learning observation']));

  const trace = [
    `decision:${decision.id}`,
    `mission:${execution.missionId}`,
    `events:${missionEvents.length}`,
    `verified:${verified}`,
    `learning:${learningValid}`,
  ];

  return {
    missionId: execution.missionId,
    passed: checks.every((item) => item.passed),
    checks,
    trace,
  };
}
