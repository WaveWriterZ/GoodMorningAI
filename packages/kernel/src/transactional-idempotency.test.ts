import { ExecutionIntent } from './idempotency-recovery';
import {
  InMemoryTransactionalIdempotencyRepository,
} from './transactional-idempotency';

function intent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    idempotencyKey: 'key-1',
    requestFingerprint: 'fp-1',
    missionId: 'mission-1',
    executionId: 'execution-1',
    decisionId: 'decision-1',
    authorizationId: 'auth-1',
    capabilityId: 'demo',
    target: 'target',
    action: 'act',
    status: 'reserved',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('Module 69 transactional idempotency admission', () => {
  test('admits the first reservation exactly once', () => {
    const repo = new InMemoryTransactionalIdempotencyRepository();
    const first = repo.reserve(intent());
    const second = repo.reserve(intent());

    expect(first.outcome).toBe('new_reservation');
    expect(second.outcome).toBe('recovery_required');
  });

  test('rejects a changed request using an existing key', () => {
    const repo = new InMemoryTransactionalIdempotencyRepository();
    repo.reserve(intent());

    const result = repo.reserve(intent({ requestFingerprint: 'fp-2' }));

    expect(result.outcome).toBe('conflicting_request');
    expect(result.intent.requestFingerprint).toBe('fp-1');
  });

  test('returns duplicate replay for a terminal intent', () => {
    const repo = new InMemoryTransactionalIdempotencyRepository();
    repo.reserve(intent({ status: 'verified' }));

    const result = repo.reserve(intent({ status: 'verified', executionId: 'execution-2' }));

    expect(result.outcome).toBe('duplicate_same_request');
    expect(result.intent.executionId).toBe('execution-1');
  });

  test('routes non-terminal existing intent to recovery', () => {
    const repo = new InMemoryTransactionalIdempotencyRepository();
    repo.reserve(intent({ status: 'executing' }));

    expect(repo.reserve(intent()).outcome).toBe('recovery_required');
  });

  test('preserves the admitted intent rather than accepting a competing intent', () => {
    const repo = new InMemoryTransactionalIdempotencyRepository();
    repo.reserve(intent({ executionId: 'winner' }));

    const result = repo.reserve(intent({ executionId: 'loser' }));

    expect(result.intent.executionId).toBe('winner');
  });
});
