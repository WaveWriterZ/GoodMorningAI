/**
 * Module 56 — Autonomous Execution & Verification Fabric
 *
 * Provides a bounded execution boundary for explicitly authorized decisions.
 * The kernel prepares and records execution; side-effecting adapters remain
 * outside this module and must enforce the returned execution contract.
 */

export type ExecutionStatus =
  | 'requested'
  | 'preflight_failed'
  | 'ready'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'verified'
  | 'verification_failed'
  | 'rolled_back';

export interface ExecutionRequest {
  id: string;
  decisionId: string;
  authorizationId: string;
  actorId: string;
  capabilityId: string;
  target: string;
  action: string;
  requestedAt: number;
  status: ExecutionStatus;
}

export interface PreflightContext {
  authorizationValid: boolean;
  capabilityAvailable: boolean;
  permissionGranted: boolean;
  safetyPassed: boolean;
  targetUnchanged: boolean;
  requiredEvidenceValid: boolean;
}

export interface PreflightResult {
  requestId: string;
  passed: boolean;
  reasons: string[];
}

export interface ExecutionResult {
  requestId: string;
  status: 'succeeded' | 'failed';
  output?: string;
  error?: string;
  completedAt: number;
}

export interface VerificationResult {
  requestId: string;
  passed: boolean;
  verifiedAt: number;
  reasons: string[];
}

export interface ExecutionReceipt {
  requestId: string;
  decisionId: string;
  authorizationId: string;
  actorId: string;
  capabilityId: string;
  target: string;
  action: string;
  status: ExecutionStatus;
  createdAt: number;
  completedAt?: number;
  verifiedAt?: number;
  rollbackReference?: string;
}

/** Fail closed: every required preflight control must pass. */
export function preflightExecution(
  request: ExecutionRequest,
  context: PreflightContext
): PreflightResult {
  const reasons: string[] = [];
  if (!request.authorizationId.trim()) reasons.push('authorization is missing');
  if (!context.authorizationValid) reasons.push('authorization is invalid or stale');
  if (!context.capabilityAvailable) reasons.push('required capability is unavailable');
  if (!context.permissionGranted) reasons.push('required permission is not granted');
  if (!context.safetyPassed) reasons.push('safety preflight failed');
  if (!context.targetUnchanged) reasons.push('execution target changed unexpectedly');
  if (!context.requiredEvidenceValid) reasons.push('required evidence is no longer valid');

  return {
    requestId: request.id,
    passed: reasons.length === 0,
    reasons,
  };
}

export function markExecutionReady(
  request: ExecutionRequest,
  preflight: PreflightResult
): ExecutionRequest {
  return {
    ...request,
    status: preflight.passed ? 'ready' : 'preflight_failed',
  };
}

/** Execution may only begin after a successful preflight. */
export function startExecution(request: ExecutionRequest): ExecutionRequest {
  if (request.status !== 'ready') return { ...request };
  return { ...request, status: 'executing' };
}

export function recordExecution(
  request: ExecutionRequest,
  result: ExecutionResult
): ExecutionRequest {
  if (request.status !== 'executing') return { ...request };
  return {
    ...request,
    status: result.status,
  };
}

/** Verification is a separate state transition from execution success. */
export function verifyExecution(
  request: ExecutionRequest,
  verification: VerificationResult
): ExecutionRequest {
  if (request.status !== 'succeeded') return { ...request };
  return {
    ...request,
    status: verification.passed ? 'verified' : 'verification_failed',
  };
}

export function createExecutionReceipt(
  request: ExecutionRequest,
  completedAt?: number,
  verifiedAt?: number,
  rollbackReference?: string
): ExecutionReceipt {
  return {
    requestId: request.id,
    decisionId: request.decisionId,
    authorizationId: request.authorizationId,
    actorId: request.actorId,
    capabilityId: request.capabilityId,
    target: request.target,
    action: request.action,
    status: request.status,
    createdAt: request.requestedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(verifiedAt === undefined ? {} : { verifiedAt }),
    ...(rollbackReference === undefined ? {} : { rollbackReference }),
  };
}

/** Rollback is explicit and records the rollback reference; it never happens silently. */
export function markRolledBack(
  request: ExecutionRequest,
  rollbackReference: string
): ExecutionRequest {
  if (!rollbackReference.trim()) return { ...request };
  if (!['failed', 'verification_failed'].includes(request.status)) return { ...request };
  return { ...request, status: 'rolled_back' };
}
