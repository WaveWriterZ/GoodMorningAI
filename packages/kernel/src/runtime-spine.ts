/**
 * Module 64 — Autonomous Integration Spine & Durable State Boundary
 *
 * Provides the application composition root and persistence interfaces for the
 * autonomous kernel. Deployments provide durable repository implementations;
 * the included in-memory stores are deterministic reference implementations.
 */

import { authorizeDecision, markDecisionEvaluated, DecisionRecord } from './decision';
import { CapabilityGateway, GatewayExecutionRequest, GatewayPolicyContext } from './capability-gateway';
import { MissionExecution, MissionExecutionCoordinator } from './mission-execution';
import { MissionEvent, MissionEventStore, InMemoryMissionEventStore } from './mission-events';
import { ClosedLoopIntegration, MissionTelemetry } from './closed-loop';
import { LearningObservation } from './learning';
import { EvidenceBundle } from './trust';
import { EvidenceDecisionBridgeResult, evaluateEvidenceGroundedDecision } from './evidence-decision-bridge';
import { VerticalSliceReport, validateVerticalSlice } from './vertical-validation';

export interface EvidenceRepository {
  save(bundle: EvidenceBundle): void;
  get(id: string): EvidenceBundle | undefined;
  list(): EvidenceBundle[];
}

export interface MissionRepository {
  save(mission: MissionExecution): void;
  get(missionId: string): MissionExecution | undefined;
}

export interface LearningObservationRepository {
  save(observation: LearningObservation): void;
  listBySubject(subjectId: string): LearningObservation[];
}

export class InMemoryEvidenceRepository implements EvidenceRepository {
  private readonly records = new Map<string, EvidenceBundle>();
  save(bundle: EvidenceBundle): void {
    if (!bundle.evidence.id.trim()) throw new Error('evidence id is required');
    if (!bundle.source.id.trim()) throw new Error('evidence source id is required');
    this.records.set(bundle.evidence.id, bundle);
  }
  get(id: string): EvidenceBundle | undefined { return this.records.get(id); }
  list(): EvidenceBundle[] { return [...this.records.values()]; }
}

export class InMemoryMissionRepository implements MissionRepository {
  private readonly records = new Map<string, MissionExecution>();
  save(mission: MissionExecution): void {
    if (!mission.missionId.trim()) throw new Error('mission id is required');
    this.records.set(mission.missionId, { ...mission });
  }
  get(missionId: string): MissionExecution | undefined {
    const mission = this.records.get(missionId);
    return mission ? { ...mission } : undefined;
  }
}

export class InMemoryLearningObservationRepository implements LearningObservationRepository {
  private readonly records: LearningObservation[] = [];
  save(observation: LearningObservation): void {
    if (!observation.id.trim()) throw new Error('learning observation id is required');
    this.records.push({ ...observation, evidence: [...observation.evidence] });
  }
  listBySubject(subjectId: string): LearningObservation[] {
    return this.records.filter((item) => item.subjectId === subjectId)
      .map((item) => ({ ...item, evidence: [...item.evidence] }));
  }
}

export interface AutonomousRuntimeDependencies {
  evidence: EvidenceRepository;
  missions: MissionRepository;
  learning: LearningObservationRepository;
  events?: MissionEventStore;
  gateway: CapabilityGateway;
  actorId?: string;
}

export interface RuntimeDecisionResult {
  decision: DecisionRecord;
  grounding: EvidenceDecisionBridgeResult;
}

export interface RuntimeMissionResult {
  mission: MissionExecution;
  telemetry?: MissionTelemetry;
  events: MissionEvent[];
  learningObservation?: LearningObservation;
  validation: VerticalSliceReport;
}

/** Explicit application composition root for the autonomous kernel. */
export class AutonomousRuntime {
  private readonly events: MissionEventStore;
  private readonly closedLoop: ClosedLoopIntegration;
  private readonly coordinator: MissionExecutionCoordinator;
  private readonly actorId: string;
  private latestLearning?: LearningObservation;

  constructor(private readonly dependencies: AutonomousRuntimeDependencies) {
    this.actorId = dependencies.actorId ?? 'autonomous-runtime';
    this.events = dependencies.events ?? new InMemoryMissionEventStore();
    this.closedLoop = new ClosedLoopIntegration(this.events, {
      actorId: this.actorId,
      onLearningObservation: (observation) => {
        this.latestLearning = observation;
        this.dependencies.learning.save(observation);
      },
    });
    this.coordinator = new MissionExecutionCoordinator(this.dependencies.gateway, {
      onStateChange: (execution) => {
        this.dependencies.missions.save(execution);
        this.closedLoop.recordState(execution, execution.updatedAt);
      },
      onLearningSignal: (signal) => this.closedLoop.recordLearningSignal(signal),
    });
  }

  groundDecision(decision: DecisionRecord, now = Date.now()): RuntimeDecisionResult {
    const grounding = evaluateEvidenceGroundedDecision({
      decision,
      evidence: this.dependencies.evidence.list(),
      now,
    });
    const evaluated = markDecisionEvaluated(decision, grounding.evaluation);
    const authorized = authorizeDecision(evaluated, grounding.ready);
    return { decision: authorized, grounding };
  }

  runMission(
    missionId: string,
    grounded: RuntimeDecisionResult,
    request: GatewayExecutionRequest,
    policy: GatewayPolicyContext,
    now = Date.now()
  ): RuntimeMissionResult {
    const decision = grounded.decision;
    if (decision.status !== 'authorized') throw new Error('decision must be authorized before mission execution');
    if (!grounded.grounding.ready) throw new Error('decision grounding is not ready');
    if (request.decisionId !== decision.id) throw new Error('request decisionId must match authorized decision');

    this.latestLearning = undefined;
    this.coordinator.create(missionId, request, now);
    const mission = this.coordinator.execute(missionId, policy, now);
    const events = this.events.byMission(missionId);
    const learningObservation = this.latestLearning;
    const validation = validateVerticalSlice({
      decision,
      evaluation: grounded.grounding.evaluation,
      execution: mission,
      events,
      learningObservation,
    });

    return {
      mission,
      telemetry: this.closedLoop.telemetry(this.events, missionId),
      events,
      learningObservation,
      validation,
    };
  }
}
