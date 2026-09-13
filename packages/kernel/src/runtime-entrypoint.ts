/**
 * Module 66 — Persistence-Backed Runtime Entrypoint & Restart Safety
 *
 * Composes AutonomousRuntime with the durable repository boundary and adds a
 * restart-safe admission check. A persisted terminal mission cannot be
 * executed again, and an interrupted in-flight mission is surfaced as
 * recovery_required instead of being replayed automatically.
 */

import { AutonomousRuntime, AutonomousRuntimeDependencies, RuntimeDecisionResult, RuntimeMissionResult } from './runtime-spine';
import { createJsonRepositories, DurablePersistencePaths, DurableRepositories } from './durable-persistence';
import { GatewayExecutionRequest, GatewayPolicyContext, CapabilityGateway } from './capability-gateway';
import { DecisionRecord } from './decision';
import { MissionExecution, MissionExecutionStatus } from './mission-execution';

export interface RuntimeEntrypointConfig extends DurablePersistencePaths {
  gateway: CapabilityGateway;
  actorId?: string;
}

export interface RuntimeRecoveryResult {
  mission: MissionExecution;
  action: 'safe_to_retry' | 'already_terminal' | 'manual_recovery_required';
}

const TERMINAL: ReadonlySet<MissionExecutionStatus> = new Set([
  'completed',
  'failed',
  'blocked',
  'recovery_required',
]);

export class PersistenceBackedRuntime {
  readonly repositories: DurableRepositories;
  readonly runtime: AutonomousRuntime;

  constructor(config: RuntimeEntrypointConfig) {
    this.repositories = createJsonRepositories(config);
    const dependencies: AutonomousRuntimeDependencies = {
      evidence: this.repositories.evidence,
      missions: this.repositories.missions,
      learning: this.repositories.learning,
      events: this.repositories.events,
      gateway: config.gateway,
      actorId: config.actorId,
    };
    this.runtime = new AutonomousRuntime(dependencies);
  }

  groundDecision(decision: DecisionRecord, now = Date.now()): RuntimeDecisionResult {
    return this.runtime.groundDecision(decision, now);
  }

  runMission(
    missionId: string,
    grounded: RuntimeDecisionResult,
    request: GatewayExecutionRequest,
    policy: GatewayPolicyContext,
    now = Date.now()
  ): RuntimeMissionResult {
    const persisted = this.repositories.missions.get(missionId);
    if (persisted) {
      throw new Error(`mission ${missionId} already persisted in state: ${persisted.status}`);
    }
    return this.runtime.runMission(missionId, grounded, request, policy, now);
  }

  recoverMission(missionId: string): RuntimeRecoveryResult {
    const mission = this.repositories.missions.get(missionId);
    if (!mission) throw new Error(`mission ${missionId} not found`);
    if (TERMINAL.has(mission.status)) {
      return { mission, action: mission.status === 'recovery_required' ? 'manual_recovery_required' : 'already_terminal' };
    }
    return { mission, action: 'manual_recovery_required' };
  }
}

export function createPersistenceBackedRuntime(config: RuntimeEntrypointConfig): PersistenceBackedRuntime {
  return new PersistenceBackedRuntime(config);
}
