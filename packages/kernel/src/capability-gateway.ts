/**
 * Module 57 — Autonomous Adapter & Capability Execution Gateway
 *
 * Connects the bounded Module 56 execution contract to capability adapters
 * without allowing adapters to bypass authorization, preflight, or safety.
 * The gateway coordinates; adapters perform the side effect.
 */

export interface CapabilityAdapter {
  capabilityId: string;
  version: string;
  preflight: (request: GatewayExecutionRequest) => AdapterPreflightResult;
  execute: (request: GatewayExecutionRequest) => AdapterExecutionResult;
  verify?: (request: GatewayExecutionRequest, result: AdapterExecutionResult) => AdapterVerificationResult;
  rollback?: (request: GatewayExecutionRequest, result: AdapterExecutionResult) => AdapterRollbackResult;
  health?: () => AdapterHealthResult;
}

export interface GatewayExecutionRequest {
  requestId: string;
  decisionId: string;
  authorizationId: string;
  actorId: string;
  capabilityId: string;
  target: string;
  action: string;
  payload?: string;
}

export interface AdapterPreflightResult {
  passed: boolean;
  reasons: string[];
}

export interface AdapterExecutionResult {
  succeeded: boolean;
  output?: string;
  error?: string;
  completedAt: number;
}

export interface AdapterVerificationResult {
  passed: boolean;
  reasons: string[];
  verifiedAt: number;
}

export interface AdapterRollbackResult {
  rolledBack: boolean;
  reference?: string;
  error?: string;
}

export interface AdapterHealthResult {
  healthy: boolean;
  details?: string;
}

export interface GatewayPolicyContext {
  authorizationValid: boolean;
  permissionGranted: boolean;
  safetyPassed: boolean;
  targetUnchanged: boolean;
  requiredEvidenceValid: boolean;
}

export interface GatewayResult {
  requestId: string;
  status: 'blocked' | 'ready' | 'succeeded' | 'failed' | 'verified' | 'verification_failed';
  reasons: string[];
  output?: string;
  receipt?: GatewayReceipt;
}

export interface GatewayReceipt {
  requestId: string;
  capabilityId: string;
  adapterVersion: string;
  decisionId: string;
  authorizationId: string;
  actorId: string;
  target: string;
  action: string;
  status: GatewayResult['status'];
  completedAt?: number;
  verifiedAt?: number;
}

export class CapabilityGateway {
  private readonly adapters = new Map<string, CapabilityAdapter>();

  register(adapter: CapabilityAdapter): void {
    if (!adapter.capabilityId.trim() || !adapter.version.trim()) return;
    this.adapters.set(adapter.capabilityId, adapter);
  }

  resolve(capabilityId: string): CapabilityAdapter | undefined {
    return this.adapters.get(capabilityId);
  }

  preflight(
    request: GatewayExecutionRequest,
    policy: GatewayPolicyContext
  ): GatewayResult {
    const adapter = this.resolve(request.capabilityId);
    const reasons: string[] = [];

    if (!adapter) reasons.push('capability adapter is not registered');
    if (!request.authorizationId.trim() || !policy.authorizationValid) reasons.push('authorization is invalid or missing');
    if (!policy.permissionGranted) reasons.push('required permission is not granted');
    if (!policy.safetyPassed) reasons.push('safety policy did not pass');
    if (!policy.targetUnchanged) reasons.push('execution target changed unexpectedly');
    if (!policy.requiredEvidenceValid) reasons.push('required evidence is not valid');

    if (adapter) {
      const adapterCheck = adapter.preflight(request);
      reasons.push(...adapterCheck.reasons);
    }

    return {
      requestId: request.requestId,
      status: reasons.length === 0 ? 'ready' : 'blocked',
      reasons,
    };
  }

  execute(
    request: GatewayExecutionRequest,
    policy: GatewayPolicyContext
  ): GatewayResult {
    const check = this.preflight(request, policy);
    if (check.status !== 'ready') return check;

    const adapter = this.resolve(request.capabilityId)!;
    const result = adapter.execute(request);
    const status = result.succeeded ? 'succeeded' : 'failed';

    return {
      requestId: request.requestId,
      status,
      reasons: result.error ? [result.error] : [],
      output: result.output,
      receipt: {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        adapterVersion: adapter.version,
        decisionId: request.decisionId,
        authorizationId: request.authorizationId,
        actorId: request.actorId,
        target: request.target,
        action: request.action,
        status,
        completedAt: result.completedAt,
      },
    };
  }

  verify(
    request: GatewayExecutionRequest,
    execution: GatewayResult
  ): GatewayResult {
    if (execution.status !== 'succeeded') return { ...execution, status: 'verification_failed' };

    const adapter = this.resolve(request.capabilityId);
    if (!adapter?.verify) {
      return { ...execution, status: 'verification_failed', reasons: ['adapter does not provide verification'] };
    }

    const verification = adapter.verify(request, {
      succeeded: true,
      output: execution.output,
      completedAt: execution.receipt?.completedAt ?? Date.now(),
    });

    return {
      ...execution,
      status: verification.passed ? 'verified' : 'verification_failed',
      reasons: verification.reasons,
      receipt: execution.receipt
        ? { ...execution.receipt, status: verification.passed ? 'verified' : 'verification_failed', verifiedAt: verification.verifiedAt }
        : undefined,
    };
  }

  rollback(
    request: GatewayExecutionRequest,
    execution: GatewayResult
  ): AdapterRollbackResult {
    const adapter = this.resolve(request.capabilityId);
    if (!adapter?.rollback || !execution.receipt) return { rolledBack: false, error: 'rollback adapter or execution receipt is unavailable' };
    return adapter.rollback(request, {
      succeeded: execution.status === 'succeeded' || execution.status === 'verified',
      output: execution.output,
      completedAt: execution.receipt.completedAt ?? Date.now(),
    });
  }

  health(capabilityId: string): AdapterHealthResult {
    const adapter = this.resolve(capabilityId);
    if (!adapter) return { healthy: false, details: 'capability adapter is not registered' };
    return adapter.health ? adapter.health() : { healthy: true, details: 'adapter health contract not implemented' };
  }
}
