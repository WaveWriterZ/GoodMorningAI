/**
 * Module 60 — Autonomous Closed-Loop Integration & Mission Telemetry Fabric
 *
 * Wires mission execution state changes to durable mission events and converts
 * verified mission outcomes into bounded learning observations. This module
 * observes and integrates; it does not authorize, execute, or apply adaptations.
 */

import {
  MissionExecution,
  MissionExecutionCoordinator,
  MissionLearningSignal,
} from './mission-execution';
import { MissionEventRecorder, MissionEventStore } from './mission-events';
import { LearningObservation } from './learning';

export interface MissionTelemetry {
  missionId: string;
  decisionId: string;
  correlationId: string;
  timeline: ReturnType<MissionEventStore['byMission']>;
  outcome?: MissionLearningSignal['outcome'];
  learningObservation?: LearningObservation;
}

export interface ClosedLoopOptions {
  actorId?: string;
  correlationId?: string;
  onLearningObservation?: (observation: LearningObservation) => void;
}

function eventTypeFor(status: MissionExecution['status']): Parameters<MissionEventRecorder['record']>[0]['eventType'] {
  const map: Record<MissionExecution['status'], Parameters<MissionEventRecorder['record']>[0]['eventType']> = {
    created: 'MISSION_CREATED',
    preparing: 'MISSION_PREPARING',
    executing: 'MISSION_EXECUTING',
    verifying: 'VERIFICATION_STARTED',
    completed: 'MISSION_COMPLETED',
    failed: 'EXECUTION_FAILED',
    blocked: 'MISSION_BLOCKED',
    recovery_required: 'RECOVERY_REQUIRED',
  };
  return map[status];
}

/**
 * ClosedLoopIntegration owns the wiring around an existing coordinator.
 * The coordinator remains authoritative for mission execution state.
 */
export class ClosedLoopIntegration {
  private readonly recorder: MissionEventRecorder;
  private readonly correlations = new Map<string, string>();

  constructor(
    store: MissionEventStore,
    private readonly options: ClosedLoopOptions = {}
  ) {
    this.recorder = new MissionEventRecorder(store);
  }

  /** Attach telemetry hooks without replacing the coordinator's execution authority. */
  attach(coordinator: MissionExecutionCoordinator): void {
    const hooks = (coordinator as unknown as { hooks?: unknown }).hooks;
    void hooks;
    // The coordinator intentionally exposes hooks at construction time. This integration
    // method is therefore a registration point for callers that construct the coordinator
    // with onStateChange/onLearningSignal forwarding to recordState/recordLearningSignal.
  }

  recordState(execution: MissionExecution, now = execution.updatedAt): void {
    const correlationId = this.correlationFor(execution.missionId);
    const eventType = eventTypeFor(execution.status);
    this.recorder.record({
      missionId: execution.missionId,
      decisionId: execution.decisionId,
      executionId: execution.request.requestId,
      eventType,
      actorId: this.options.actorId ?? execution.request.actorId,
      capabilityId: execution.request.capabilityId,
      currentState: execution.status,
      timestamp: now,
      correlationId,
      payload: {
        requestId: execution.request.requestId,
        resultStatus: execution.result?.status,
        verificationStatus: execution.verification?.status,
      },
    });
  }

  recordLearningSignal(signal: MissionLearningSignal): LearningObservation {
    const correlationId = this.correlationFor(signal.missionId);
    this.recorder.record({
      missionId: signal.missionId,
      decisionId: signal.decisionId,
      eventType: 'LEARNING_SIGNAL_EMITTED',
      currentState: signal.outcome,
      timestamp: signal.createdAt,
      correlationId,
      provenance: signal.evidence,
      payload: { outcome: signal.outcome, evidence: signal.evidence },
    });

    const outcome: LearningObservation['outcome'] = signal.outcome === 'success'
      ? 'success'
      : signal.outcome === 'failure' || signal.outcome === 'verification_failure'
        ? 'failure'
        : 'unknown';

    const observation: LearningObservation = {
      id: `observation-${signal.missionId}-${signal.createdAt}`,
      domain: 'mission',
      subjectId: signal.missionId,
      outcome,
      evidence: [...signal.evidence],
      timestamp: signal.createdAt,
      confidence: signal.outcome === 'success' ? 1 : signal.outcome === 'verification_failure' ? 0.9 : 0.8,
    };

    this.options.onLearningObservation?.({ ...observation });
    return observation;
  }

  telemetry(store: MissionEventStore, missionId: string): MissionTelemetry | undefined {
    const timeline = store.byMission(missionId);
    if (timeline.length === 0) return undefined;
    const lastLearning = [...timeline].reverse().find((event) => event.eventType === 'LEARNING_SIGNAL_EMITTED');
    const payload = lastLearning?.payload;
    const rawOutcome = payload?.outcome;
    const outcome = rawOutcome === 'success' || rawOutcome === 'failure' || rawOutcome === 'verification_failure' || rawOutcome === 'blocked'
      ? rawOutcome
      : undefined;
    return {
      missionId,
      decisionId: timeline.find((event) => event.decisionId)?.decisionId ?? '',
      correlationId: timeline[0].correlationId,
      timeline,
      outcome,
    };
  }

  private correlationFor(missionId: string): string {
    const existing = this.correlations.get(missionId);
    if (existing) return existing;
    const created = this.options.correlationId ?? `mission:${missionId}`;
    this.correlations.set(missionId, created);
    return created;
  }
}
