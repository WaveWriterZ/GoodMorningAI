import { CapabilityGateway, CapabilityAdapter, GatewayPolicyContext, GatewayExecutionRequest } from './capability-gateway';
import { MissionExecutionCoordinator } from './mission-execution';

const request: GatewayExecutionRequest = {
  requestId: 'req-58',
  decisionId: 'dec-58',
  authorizationId: 'auth-58',
  actorId: 'actor-58',
  capabilityId: 'demo',
  target: 'target-a',
  action: 'do-work',
};

const policy: GatewayPolicyContext = {
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
    rollback: () => ({ rolledBack: true, reference: 'rb-58' }),
    ...overrides,
  };
}

describe('Module 58 mission execution coordinator', () => {
  test('creates and completes an authorized mission through verification', () => {
    const gateway = new CapabilityGateway();
    gateway.register(adapter());
    const states: string[] = [];
    const signals: string[] = [];
    const coordinator = new MissionExecutionCoordinator(gateway, {
      onStateChange: execution => states.push(execution.status),
      onLearningSignal: signal => signals.push(signal.outcome),
    });

    coordinator.create('mission-1', request, 10);
    const result = coordinator.execute('mission-1', policy, 20);

    expect(result.status).toBe('completed');
    expect(states).toEqual(['created', 'preparing', 'executing', 'verifying', 'completed']);
    expect(signals).toEqual(['success']);
  });

  test('blocks before execution when gateway preflight fails', () => {
    const gateway = new CapabilityGateway();
    const execute = jest.fn(() => ({ succeeded: true, output: 'unexpected', completedAt: 100 }));
    gateway.register(adapter({ execute }));
    const coordinator = new MissionExecutionCoordinator(gateway);

    const result = coordinator.create('mission-2', request, 10);
    const blocked = coordinator.execute('mission-2', { ...policy, safetyPassed: false }, 20);

    expect(result.status).toBe('created');
    expect(blocked.status).toBe('blocked');
    expect(execute).not.toHaveBeenCalled();
    expect(blocked.learningSignal?.outcome).toBe('blocked');
  });

  test('requires recovery when execution succeeds but verification fails', () => {
    const gateway = new CapabilityGateway();
    gateway.register(adapter({
      verify: () => ({ passed: false, reasons: ['expected state not observed'], verifiedAt: 300 }),
    }));
    const coordinator = new MissionExecutionCoordinator(gateway);

    coordinator.create('mission-3', request, 10);
    const result = coordinator.execute('mission-3', policy, 20);

    expect(result.status).toBe('recovery_required');
    expect(result.verification?.status).toBe('verification_failed');
    expect(result.learningSignal?.outcome).toBe('verification_failure');
  });

  test('does not execute a mission twice', () => {
    const gateway = new CapabilityGateway();
    gateway.register(adapter());
    const coordinator = new MissionExecutionCoordinator(gateway);
    coordinator.create('mission-4', request, 10);
    coordinator.execute('mission-4', policy, 20);

    expect(() => coordinator.execute('mission-4', policy, 30)).toThrow(
      'mission cannot execute from state: completed'
    );
  });
});
