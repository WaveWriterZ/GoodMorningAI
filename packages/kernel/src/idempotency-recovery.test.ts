import {
  IdempotentPersistenceBackedRuntime,
  InMemoryExecutionIntentStore,
} from './idempotency-recovery';

function request() {
  return {
    requestId: 'exec-1',
    decisionId: 'decision-1',
    authorizationId: 'auth-1',
    actorId: 'test-actor',
    capabilityId: 'reference.echo',
    target: 'local:test',
    action: 'echo',
    payload: 'hello',
  };
}

function runtimeStub(status: 'completed' | 'failed' | 'blocked' | 'recovery_required') {
  return {
    runMission: jest.fn().mockReturnValue({
      mission: {
        missionId: 'mission-1',
        decisionId: 'decision-1',
        request: request(),
        status,
        createdAt: 100,
        updatedAt: 101,
        result: status === 'completed' ? { status: 'verified' } : undefined,
      },
      events: [],
      validation: { passed: status === 'completed', checks: [] },
    }),
    groundDecision: jest.fn(),
  };
}

describe('Module 67 idempotency and recovery', () => {
  test('executes a new key once and replays the terminal result', () => {
    const intents = new InMemoryExecutionIntentStore();
    const runtime = runtimeStub('completed');
    const service = new IdempotentPersistenceBackedRuntime(runtime as never, intents);
    const grounded = {} as never;

    const first = service.runMission('key-1', 'mission-1', grounded, request(), {
      authorizationValid: true,
      permissionGranted: true,
      safetyPassed: true,
      targetUnchanged: true,
      requiredEvidenceValid: true,
    }, 100);

    const second = service.runMission('key-1', 'mission-1', grounded, request(), {
      authorizationValid: true,
      permissionGranted: true,
      safetyPassed: true,
      targetUnchanged: true,
      requiredEvidenceValid: true,
    }, 200);

    expect(first.outcome).toBe('executed');
    expect(second.outcome).toBe('replayed');
    expect(runtime.runMission).toHaveBeenCalledTimes(1);
    expect(second.intent.status).toBe('verified');
  });

  test('rejects the same idempotency key when the request changes', () => {
    const intents = new InMemoryExecutionIntentStore();
    const runtime = runtimeStub('completed');
    const service = new IdempotentPersistenceBackedRuntime(runtime as never, intents);
    const grounded = {} as never;
    const policy = {
      authorizationValid: true,
      permissionGranted: true,
      safetyPassed: true,
      targetUnchanged: true,
      requiredEvidenceValid: true,
    };

    service.runMission('key-2', 'mission-1', grounded, request(), policy, 100);
    expect(() => service.runMission(
      'key-2',
      'mission-1',
      grounded,
      { ...request(), payload: 'changed' },
      policy,
      200,
    )).toThrow(/different request fingerprint/);
    expect(runtime.runMission).toHaveBeenCalledTimes(1);
  });

  test('surfaces a non-terminal intent for recovery instead of replaying', () => {
    const intents = new InMemoryExecutionIntentStore();
    const runtime = runtimeStub('completed');
    const service = new IdempotentPersistenceBackedRuntime(runtime as never, intents);
    const grounded = {} as never;
    const policy = {
      authorizationValid: true,
      permissionGranted: true,
      safetyPassed: true,
      targetUnchanged: true,
      requiredEvidenceValid: true,
    };

    intents.save({
      idempotencyKey: 'key-3',
      requestFingerprint: 'placeholder',
      missionId: 'mission-1',
      executionId: 'exec-1',
      decisionId: 'decision-1',
      authorizationId: 'auth-1',
      capabilityId: 'reference.echo',
      target: 'local:test',
      action: 'echo',
      status: 'executing',
      createdAt: 100,
      updatedAt: 100,
    });

    const result = service.runMission('key-3', 'mission-1', grounded, request(), policy, 200);
    expect(result.outcome).toBe('recovery_required');
    expect(runtime.runMission).not.toHaveBeenCalled();
  });

  test('marks an interrupted runtime as recovery_required', () => {
    const intents = new InMemoryExecutionIntentStore();
    const runtime = {
      runMission: jest.fn().mockImplementation(() => { throw new Error('runtime interrupted'); }),
      groundDecision: jest.fn(),
    };
    const service = new IdempotentPersistenceBackedRuntime(runtime as never, intents);
    const grounded = {} as never;
    const policy = {
      authorizationValid: true,
      permissionGranted: true,
      safetyPassed: true,
      targetUnchanged: true,
      requiredEvidenceValid: true,
    };

    expect(() => service.runMission('key-4', 'mission-1', grounded, request(), policy, 100)).toThrow('runtime interrupted');
    expect(intents.get('key-4')?.status).toBe('recovery_required');
  });
});
