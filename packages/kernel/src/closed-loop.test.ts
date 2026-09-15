import { describe, expect, it, jest } from '@jest/globals';
import { CapabilityGateway, CapabilityAdapter } from './capability-gateway';
import { ClosedLoopIntegration } from './closed-loop';
import { InMemoryMissionEventStore } from './mission-events';

const request = {
  requestId: 'req-60', decisionId: 'dec-60', authorizationId: 'auth-60', actorId: 'actor-60',
  capabilityId: 'demo', target: 'target-a', action: 'do-work',
};
const policy = { authorizationValid: true, permissionGranted: true, safetyPassed: true, targetUnchanged: true, requiredEvidenceValid: true };

function adapter(overrides: Partial<CapabilityAdapter> = {}): CapabilityAdapter {
  return {
    capabilityId: 'demo', version: '1.0.0',
    preflight: () => ({ passed: true, reasons: [] }),
    execute: () => ({ succeeded: true, output: 'ok', completedAt: 20 }),
    verify: () => ({ passed: true, reasons: [], verifiedAt: 30 }),
    rollback: () => ({ rolledBack: true }),
    ...overrides,
  };
}

describe('Module 60 closed-loop integration', () => {
  it('records coordinator state transitions and verified learning signals', () => {
    const store = new InMemoryMissionEventStore();
    const observed: unknown[] = [];
    const integration = new ClosedLoopIntegration(store, { onLearningObservation: (o) => observed.push(o) });
    const gateway = new CapabilityGateway();
    gateway.register(adapter());
    const coordinator = integration.wireCoordinator(gateway);

    coordinator.create('mission-60', request, 10);
    const execution = coordinator.execute('mission-60', policy, 20);

    expect(execution.status).toBe('completed');
    const telemetry = integration.telemetry('mission-60');
    expect(telemetry?.outcome).toBe('success');
    expect(telemetry?.timeline.map((e) => e.eventType)).toEqual(expect.arrayContaining([
      'MISSION_CREATED', 'MISSION_PREPARING', 'MISSION_EXECUTING', 'VERIFICATION_STARTED',
      'MISSION_COMPLETED', 'LEARNING_SIGNAL_EMITTED',
    ]));
    expect(observed).toHaveLength(1);
    expect((observed[0] as { outcome: string }).outcome).toBe('success');
  });

  it('maps verification failure to a failure learning observation', () => {
    const store = new InMemoryMissionEventStore();
    const onLearningObservation = jest.fn();
    const integration = new ClosedLoopIntegration(store, { onLearningObservation });
    const gateway = new CapabilityGateway();
    gateway.register(adapter({ verify: () => ({ passed: false, reasons: ['mismatch'], verifiedAt: 30 }) }));
    const coordinator = integration.wireCoordinator(gateway);

    coordinator.create('mission-60-fail', request, 10);
    const execution = coordinator.execute('mission-60-fail', policy, 20);

    expect(execution.status).toBe('recovery_required');
    expect(onLearningObservation).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure', confidence: 0.9 }));
    expect(integration.telemetry('mission-60-fail')?.outcome).toBe('verification_failure');
  });

  it('blocks before execution and records the blocked outcome', () => {
    const store = new InMemoryMissionEventStore();
    const integration = new ClosedLoopIntegration(store);
    const gateway = new CapabilityGateway();
    const execute = jest.fn(() => ({ succeeded: true, output: 'should-not-run', completedAt: 20 }));
    gateway.register(adapter({ execute }));
    const coordinator = integration.wireCoordinator(gateway);

    coordinator.create('mission-60-blocked', request, 10);
    const execution = coordinator.execute('mission-60-blocked', { ...policy, safetyPassed: false }, 20);

    expect(execution.status).toBe('blocked');
    expect(execute).not.toHaveBeenCalled();
    expect(integration.telemetry('mission-60-blocked')?.outcome).toBe('blocked');
  });
});
