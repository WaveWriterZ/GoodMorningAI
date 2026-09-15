/**
 * Module 67 — Idempotency, Recovery & Transaction Boundary
 *
 * Reserves an execution intent before the capability gateway can perform a side
 * effect. Retries resolve the durable intent first; a changed request using the
 * same key is rejected, and an interrupted non-terminal intent is surfaced for
 * reconciliation instead of being replayed automatically.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GatewayExecutionRequest, GatewayPolicyContext } from './capability-gateway';
import { MissionExecutionStatus } from './mission-execution';
import { PersistenceBackedRuntime, RuntimeDecisionResult, RuntimeMissionResult } from './runtime-entrypoint';

export type ExecutionIntentStatus =
  | 'reserved'
  | 'executing'
  | 'executed'
  | 'verification_pending'
  | 'verified'
  | 'failed'
  | 'recovery_required'
  | 'expired';

export interface ExecutionIntent {
  idempotencyKey: string;
  requestFingerprint: string;
  missionId: string;
  executionId: string;
  decisionId: string;
  authorizationId: string;
  capabilityId: string;
  target: string;
  action: string;
  status: ExecutionIntentStatus;
  receipt?: RuntimeMissionResult['mission']['result'];
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface IdempotencyPersistence {
  get(key: string): ExecutionIntent | undefined;
  save(intent: ExecutionIntent): void;
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, 'utf8');
  return raw.trim() ? (JSON.parse(raw) as T) : fallback;
}

function writeJson<T>(path: string, value: T): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  renameSync(temporary, path);
}

export class JsonExecutionIntentStore implements IdempotencyPersistence {
  constructor(private readonly path: string) {}

  get(key: string): ExecutionIntent | undefined {
    return readJson<Record<string, ExecutionIntent>>(this.path, {})[key];
  }

  save(intent: ExecutionIntent): void {
    if (!intent.idempotencyKey.trim()) throw new Error('idempotency key is required');
    if (!intent.requestFingerprint.trim()) throw new Error('request fingerprint is required');
    const records = readJson<Record<string, ExecutionIntent>>(this.path, {});
    records[intent.idempotencyKey] = intent;
    writeJson(this.path, records);
  }
}

export class InMemoryExecutionIntentStore implements IdempotencyPersistence {
  private readonly records = new Map<string, ExecutionIntent>();

  get(key: string): ExecutionIntent | undefined {
    const value = this.records.get(key);
    return value ? { ...value } : undefined;
  }

  save(intent: ExecutionIntent): void {
    this.records.set(intent.idempotencyKey, { ...intent });
  }
}

export interface IdempotentMissionResult {
  outcome: 'executed' | 'replayed' | 'blocked' | 'recovery_required';
  intent: ExecutionIntent;
  result?: RuntimeMissionResult;
  reason?: string;
}

const TERMINAL: ReadonlySet<ExecutionIntentStatus> = new Set([
  'verified',
  'failed',
  'expired',
]);

export function createRequestFingerprint(request: GatewayExecutionRequest): string {
  const canonical = JSON.stringify({
    decisionId: request.decisionId,
    authorizationId: request.authorizationId,
    actorId: request.actorId,
    capabilityId: request.capabilityId,
    target: request.target,
    action: request.action,
    payload: request.payload ?? '',
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function intentStatus(missionStatus: MissionExecutionStatus): ExecutionIntentStatus {
  switch (missionStatus) {
    case 'completed': return 'verified';
    case 'failed': return 'failed';
    case 'blocked': return 'failed';
    case 'recovery_required': return 'recovery_required';
    default: return 'executing';
  }
}

function outcomeFor(status: ExecutionIntentStatus): IdempotentMissionResult['outcome'] {
  if (status === 'failed') return 'blocked';
  if (status === 'recovery_required') return 'recovery_required';
  return 'executed';
}

export class IdempotentPersistenceBackedRuntime {
  constructor(
    readonly runtime: PersistenceBackedRuntime,
    readonly intents: IdempotencyPersistence,
  ) {}

  groundDecision(decision: Parameters<PersistenceBackedRuntime['groundDecision']>[0], now = Date.now()): RuntimeDecisionResult {
    return this.runtime.groundDecision(decision, now);
  }

  runMission(
    idempotencyKey: string,
    missionId: string,
    grounded: RuntimeDecisionResult,
    request: GatewayExecutionRequest,
    policy: GatewayPolicyContext,
    now = Date.now(),
    expiresAt?: number,
  ): IdempotentMissionResult {
    if (!idempotencyKey.trim()) throw new Error('idempotency key is required');

    const requestFingerprint = createRequestFingerprint(request);
    const existing = this.intents.get(idempotencyKey);

    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new Error(`idempotency key ${idempotencyKey} is bound to a different request fingerprint`);
      }
      if (TERMINAL.has(existing.status)) {
        return { outcome: 'replayed', intent: existing };
      }
      return {
        outcome: 'recovery_required',
        intent: existing,
        reason: 'existing non-terminal execution intent requires reconciliation before retry',
      };
    }

    const intent: ExecutionIntent = {
      idempotencyKey,
      requestFingerprint,
      missionId,
      executionId: request.requestId,
      decisionId: request.decisionId,
      authorizationId: request.authorizationId,
      capabilityId: request.capabilityId,
      target: request.target,
      action: request.action,
      status: 'reserved',
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    this.intents.save(intent);
    const executing: ExecutionIntent = { ...intent, status: 'executing', updatedAt: now };
    this.intents.save(executing);

    try {
      const result = this.runtime.runMission(missionId, grounded, request, policy, now);
      const finalIntent: ExecutionIntent = {
        ...executing,
        status: intentStatus(result.mission.status),
        updatedAt: result.mission.updatedAt,
        receipt: result.mission.result,
      };
      this.intents.save(finalIntent);
      return {
        outcome: outcomeFor(finalIntent.status),
        intent: finalIntent,
        result,
      };
    } catch (error) {
      const recovery: ExecutionIntent = {
        ...executing,
        status: 'recovery_required',
        updatedAt: Date.now(),
      };
      this.intents.save(recovery);
      throw error;
    }
  }

  recover(idempotencyKey: string): ExecutionIntent | undefined {
    return this.intents.get(idempotencyKey);
  }
}
