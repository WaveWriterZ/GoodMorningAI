import {
  createExecutionReceipt,
  markExecutionReady,
  markExecutionReady as prepareExecution,
  markRolledBack,
  preflightExecution,
  recordExecution,
  startExecution,
  verifyExecution,
  type ExecutionRequest,
} from './execution';

describe('Module 56 execution and verification', () => {
  const request: ExecutionRequest = {
    id: 'exec-1',
    decisionId: 'decision-1',
    authorizationId: 'auth-1',
    actorId: 'agent-1',
    capabilityId: 'capability-1',
    target: 'target-1',
    action: 'perform-test-action',
    requestedAt: 100,
    status: 'requested',
  };

  const passingContext = {
    authorizationValid: true,
    capabilityAvailable: true,
    permissionGranted: true,
    safetyPassed: true,
    targetUnchanged: true,
    requiredEvidenceValid: true,
  };

  it('fails closed when any preflight control fails', () => {
    const result = preflightExecution(request, {
      ...passingContext,
      safetyPassed: false,
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toContain('safety preflight failed');
    expect(markExecutionReady(request, result).status).toBe('preflight_failed');
  });

  it('requires explicit authorization and valid controls before execution', () => {
    const preflight = preflightExecution(request, passingContext);
    expect(preflight.passed).toBe(true);

    const ready = prepareExecution(request, preflight);
    expect(ready.status).toBe('ready');
    expect(startExecution(ready).status).toBe('executing');
  });

  it('cannot start execution before a successful preflight', () => {
    expect(startExecution(request).status).toBe('requested');
  });

  it('keeps execution success separate from verification', () => {
    const executing = startExecution(markExecutionReady(request, preflightExecution(request, passingContext)));
    const succeeded = recordExecution(executing, {
      requestId: request.id,
      status: 'succeeded',
      output: 'ok',
      completedAt: 200,
    });

    expect(succeeded.status).toBe('succeeded');
    expect(verifyExecution(succeeded, {
      requestId: request.id,
      passed: true,
      verifiedAt: 300,
      reasons: ['expected outcome confirmed'],
    }).status).toBe('verified');
  });

  it('does not verify a failed execution', () => {
    const executing = startExecution(markExecutionReady(request, preflightExecution(request, passingContext)));
    const failed = recordExecution(executing, {
      requestId: request.id,
      status: 'failed',
      error: 'adapter failure',
      completedAt: 200,
    });

    expect(verifyExecution(failed, {
      requestId: request.id,
      passed: true,
      verifiedAt: 300,
      reasons: [],
    }).status).toBe('failed');
  });

  it('supports explicit rollback only after failure or verification failure', () => {
    const failed = { ...request, status: 'failed' as const };
    expect(markRolledBack(failed, 'rollback-1').status).toBe('rolled_back');
    expect(markRolledBack(request, 'rollback-1').status).toBe('requested');
  });

  it('creates an auditable execution receipt', () => {
    const verified = { ...request, status: 'verified' as const };
    const receipt = createExecutionReceipt(verified, 200, 300, 'rollback-1');

    expect(receipt).toEqual({
      requestId: 'exec-1',
      decisionId: 'decision-1',
      authorizationId: 'auth-1',
      actorId: 'agent-1',
      capabilityId: 'capability-1',
      target: 'target-1',
      action: 'perform-test-action',
      status: 'verified',
      createdAt: 100,
      completedAt: 200,
      verifiedAt: 300,
      rollbackReference: 'rollback-1',
    });
  });
});
