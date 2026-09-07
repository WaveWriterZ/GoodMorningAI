/**
 * Module 58 — Autonomous Mission Execution Coordinator
 *
 * Coordinates authorized decisions through the Module 57 capability gateway,
 * records mission execution state, verifies outcomes, and emits bounded
 * learning signals. It does not grant authorization or bypass gateway policy.
 */

import {
  CapabilityGateway,
  GatewayExecutionRequest,
  GatewayPolicyContext,
  GatewayResult,
} from './capability-gateway';

export type MissionExecutionStatus =
  | 'created'
  | 'preparing'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'recovery_required';

export interface MissionExecution {
  missionId: string;
  decisionId: string;
  request: GatewayExecutionRequest;
  status: MissionExecutionStatus;
  createdAt: number;
  updatedAt: number;
  result?: GatewayResult;
  verification?: GatewayResult;
  learningSignal?: MissionLearningSignal;
}

export interface MissionLearningSignal {
  missionId: string;
  decisionId: string;
  outcome: 'success' | 'failure' | 'verification_failure' | 'blocked';
  evidence: string[];
  createdAt: number;
}

export interface MissionExecutionHooks {
  onStateChange?: (execution: MissionExecution) => void;
  onLearningSignal?: (signal: MissionLearningSignal) => void;
}

export class MissionExecutionCoordinator {
  private readonly executions = new Map<string, MissionExecution>();

  constructor(
    private readonly gateway: CapabilityGateway,
    private readonly hooks: MissionExecutionHooks = {}
  ) {}

  create(
    missionId: string,
    request: GatewayExecutionRequest,
    now = Date.now()
  ): MissionExecution {
    if (!missionId.trim()) throw new Error('missionId is required');
    if (!request.requestId.trim() || !request.decisionId.trim()) {
      throw new Error('requestId and decisionId are required');
    }
    if (this.executions.has(missionId)) throw new Error('mission execution already exists');

    const execution: MissionExecution = {
      missionId,
      decisionId: request.decisionId,
      request,
      status: 'created',
      createdAt: now,
      updatedAt: now,
    };
    this.executions.set(missionId, execution);
    this.emit(execution);
    return execution;
  }

  get(missionId: string): MissionExecution | undefined {
    return this.executions.get(missionId);
  }

  execute(
    missionId: string,
    policy: GatewayPolicyContext,
    now = Date.now()
  ): MissionExecution {
    const execution = this.require(missionId);
    if (execution.status !== 'created' && execution.status !== 'preparing') {
      throw new Error(`mission cannot execute from state: ${execution.status}`);
    }

    this.transition(execution, 'preparing', now);
    const preflight = this.gateway.preflight(execution.request, policy);
    if (preflight.status !== 'ready') {
      execution.result = preflight;
      this.transition(execution, 'blocked', now);
      this.publishLearning(execution, 'blocked', preflight.reasons, now);
      return execution;
    }

    this.transition(execution, 'executing', now);
    const result = this.gateway.execute(execution.request, policy);
    execution.result = result;

    if (result.status !== 'succeeded') {
      this.transition(execution, 'failed', now);
      this.publishLearning(execution, 'failure', result.reasons, now);
      return execution;
    }

    this.transition(execution, 'verifying', now);
    const verification = this.gateway.verify(execution.request, result);
    execution.verification = verification;

    if (verification.status === 'verified') {
      this.transition(execution, 'completed', now);
      this.publishLearning(execution, 'success', verification.reasons, now);
    } else {
      this.transition(execution, 'recovery_required', now);
      this.publishLearning(execution, 'verification_failure', verification.reasons, now);
    }

    return execution;
  }

  rollback(missionId: string, now = Date.now()): MissionExecution {
    const execution = this.require(missionId);
    if (!execution.result) throw new Error('mission has no execution result to roll back');
    this.gateway.rollback(execution.request, execution.result);
    this.transition(execution, 'recovery_required', now);
    return execution;
  }

  private require(missionId: string): MissionExecution {
    const execution = this.executions.get(missionId);
    if (!execution) throw new Error('mission execution not found');
    return execution;
  }

  private transition(execution: MissionExecution, status: MissionExecutionStatus, now: number): void {
    execution.status = status;
    execution.updatedAt = now;
    this.emit(execution);
  }

  private emit(execution: MissionExecution): void {
    this.hooks.onStateChange?.({ ...execution });
  }

  private publishLearning(
    execution: MissionExecution,
    outcome: MissionLearningSignal['outcome'],
    evidence: string[],
    now: number
  ): void {
    const signal: MissionLearningSignal = {
      missionId: execution.missionId,
      decisionId: execution.decisionId,
      outcome,
      evidence: [...evidence],
      createdAt: now,
    };
    execution.learningSignal = signal;
    this.hooks.onLearningSignal?.({ ...signal });
  }
}
