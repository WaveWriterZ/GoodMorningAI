import {
  CapabilityGateway,
  CapabilityAdapter,
  GatewayExecutionRequest,
  GatewayPolicyContext,
} from './capability-gateway';

const request: GatewayExecutionRequest = {
  requestId: 'req-57',
  decisionId: 'dec-57',
  authorizationId: 'auth-57',
  actorId: 'actor-57',
  capabilityId: 'demo',
  target: 'target-a',
  action: 'do-work',
};

const safePolicy: GatewayPolicyContext = {
  authorizationValid: true,
  permissionGranted: true,
  safetyPassed: true,
  targetUnchanged: true,
  requiredEvidenceValid: true,
};

function adapter(overrides: Partial<CapabilityAdapter> = {}): CapabilityAdapter {
  return {
    capabilityId: 'demo',
    version: '1.0.0',
    preflight: () => ({ passed: true, reasons: [] }),
    execute: () => ({ succeeded: true, output: 'ok', completedAt: 100 }),
    verify: () => ({ passed: true, reasons: [], verifiedAt: 200 }),
    rollback: () => ({ rolledBack: true, reference: 'rb-1' }),
    ...overrides,
  };
}

describe('Module 57 capability gateway', () => {
  test('blocks execution when no adapter is registered', () => {
    const gateway = new CapabilityGateway();
    expect(gateway.execute(request, safePolicy).status).toBe('blocked');
  });

  test('blocks when authorization or safety policy fails', () => {
    const gateway = new CapabilityGateway();
    gateway.register(adapter());
    const result = gateway.execute(request, { ...safePolicy, authorizationValid: false, safetyPassed: false });
    expect(result.status).toBe('blocked');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'authorization is invalid or missing',
      'safety policy did not pass',
    ]));
  });

  test('requires adapter preflight before execution', () => {
    const gateway = new CapabilityGateway();
    const execute = jest.fn(() => ({ succeeded: true, output: 'bad', completedAt: 100 }));
    gateway.register(adapter({
      preflight: () => ({ passed: false, reasons: ['adapter rejected request'] }),
      execute,
    }));
    const result = gateway.execute(request, safePolicy);
    expect(result.status).toBe('blocked');
    expect(execute).not.toHaveBeenCalled();
  });

  test('executes only after all gateway checks pass', () => {
    const gateway = new CapabilityGateway();
    gateway.register(adapter());
    const result = gateway.execute(request, safePolicy);
    expect(result.status).toBe('succeeded');
    expect(result.receipt?.adapterVersion).toBe('1.0.0');
  });

  test('keeps verification separate from execution success', () => {
    const gateway = new CapabilityGateway();
    gateway.register(adapter({
      verify: () => ({ passed: false, reasons: ['output did not match expectation'], verifiedAt: 300 }),
    }));
    const executed = gateway.execute(request, safePolicy);
    expect(executed.status).toBe('succeeded');
    expect(gateway.verify(request, executed).status).toBe('verification_failed');
  });

  test('supports explicit rollback through the adapter', () => {
    const gateway = new CapabilityGateway();
    gateway.register(adapter());
    const executed = gateway.execute(request, safePolicy);
    expect(gateway.rollback(request, executed)).toEqual({ rolledBack: true, reference: 'rb-1' });
  });

  test('does not silently invent rollback support', () => {
    const gateway = new CapabilityGateway();
    gateway.register(adapter({ rollback: undefined }));
    const executed = gateway.execute(request, safePolicy);
    expect(gateway.rollback(request, executed).rolledBack).toBe(false);
  });
});
