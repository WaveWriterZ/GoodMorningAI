/**
 * Module 62 — Autonomous Reference Mission Harness
 *
 * Provides one deterministic, side-effect-free composition root for the
 * autonomous kernel. The harness proves the contracts across decision,
 * execution, mission telemetry, learning, and vertical validation without
 * connecting to external services.
 */

import {
  authorizeDecision,
  evaluateDecision,
  markDecisionEvaluated,
  DecisionRecord,
} from './decision';
import { CapabilityAdapter, CapabilityGateway, GatewayPolicyContext } from './capability-gateway';
import { MissionExecutionCoordinator } from './mission-execution';
import { MissionEventStore } from './mission-events';
import { ClosedLoopIntegration, MissionTelemetry } from './closed-loop';
import { LearningObservation } from './learning';
import { validateVerticalSlice, VerticalSliceReport } from './vertical-validation';

export interface ReferenceMissionConfig {
  now?: number;
  missionId?: string;
  decisionId?: string;
  requestId?: string;
  authorizationId?: string;
  actorId?: string;
  capabilityId?: string;
  target?: string;
  action?: string;
}

export interface ReferenceMissionResult {
  decision: DecisionRecord;
  evaluation: ReturnType<typeof evaluateDecision>;
  mission: NonNullable<ReturnType<MissionExecutionCoordinator['get']>>;
  telemetry?: MissionTelemetry;
  learningObservation?: LearningObservation;
  validation: VerticalSliceReport;
}

/** A deterministic adapter used only by the reference harness and tests. */
export function createReferenceAdapter(
  capabilityId = 'reference.echo',
  clock: () => number = () => Date.now()
): CapabilityAdapter {
  return {
    capabilityId,
    version: '1.0.0',
    preflight: () => ({ passed: true, reasons: [] }),
    execute: (request) => ({
      succeeded: true,
      output: `reference-executed:${request.action}`,
      completedAt: clock(),
    }),
    verify: (_request, result) => ({
      passed: result.succeeded,
      reasons: result.succeeded ? ['reference execution verified'] : ['reference execution failed'],
      verifiedAt: clock(),
    }),
  };
}

/**
 * Builds and executes a complete reference mission through the real kernel
 * contracts. No external side effect is performed by the harness adapter.
 */
export function runReferenceMission(config: ReferenceMissionConfig = {}): ReferenceMissionResult {
  const now = config.now ?? 1_700_000_000_000;
  const missionId = config.missionId ?? 'reference-mission-1';
  const decisionId = config.decisionId ?? 'reference-decision-1';
  const requestId = config.requestId ?? 'reference-request-1';
  const authorizationId = config.authorizationId ?? 'reference-authorization-1';
  const actorId = config.actorId ?? 'reference-harness';
  const capabilityId = config.capabilityId ?? 'reference.echo';

  const decision: DecisionRecord = {
    id: decisionId,
    goalId: 'reference-goal',
    objective: 'prove the autonomous kernel vertical slice',
    alternatives: [{
      id: 'reference-alternative',
      description: 'execute the deterministic reference capability',
      expectedOutcome: 'verified reference result',
      risk: 'low',
    }],
    selectedAlternativeId: 'reference-alternative',
    supportingEvidenceIds: ['reference-evidence-1'],
    contradictoryEvidenceIds: [],
    assumptions: ['reference adapter is deterministic'],
    constraints: ['no external side effects'],
    risk: 'low',
    confidence: 1,
    rationale: 'The reference mission exists to validate kernel composition.',
    expectedOutcome: 'verified reference result',
    verificationPlan: 'adapter verification must report verified',
    status: 'proposed',
    createdAt: now,
  };

  const evaluation = evaluateDecision(decision, ['reference-evidence-1']);
  const evaluatedDecision = markDecisionEvaluated(decision, evaluation);
  const authorizedDecision = authorizeDecision(evaluatedDecision, true);

  const gateway = new CapabilityGateway();
  gateway.register(createReferenceAdapter(capabilityId, () => now));

  const store = new MissionEventStore();
  let learningObservation: LearningObservation | undefined;
  const closedLoop = new ClosedLoopIntegration(store, {
    actorId,
    onLearningObservation: (observation) => {
      learningObservation = observation;
    },
  });

  const coordinator = new MissionExecutionCoordinator(gateway, {
    onStateChange: (execution) => closedLoop.recordState(execution, now),
    onLearningSignal: (signal) => closedLoop.recordLearningSignal(signal),
  });

  const request = {
    requestId,
    decisionId: authorizedDecision.id,
    authorizationId,
    actorId,
    capabilityId,
    target: config.target ?? 'reference://mission',
    action: config.action ?? 'prove-autonomous-loop',
  };

  coordinator.create(missionId, request, now);
  const policy: GatewayPolicyContext = {
    authorizationValid: authorizedDecision.status === 'authorized',
    permissionGranted: true,
    safetyPassed: true,
    targetUnchanged: true,
    requiredEvidenceValid: true,
  };
  const mission = coordinator.execute(missionId, policy, now);
  const events = store.byMission(missionId);

  const validation = validateVerticalSlice({
    decision: authorizedDecision,
    evaluation,
    execution: mission,
    events,
    learningObservation,
  });

  return {
    decision: authorizedDecision,
    evaluation,
    mission,
    telemetry: closedLoop.telemetry(store, missionId),
    learningObservation,
    validation,
  };
}
