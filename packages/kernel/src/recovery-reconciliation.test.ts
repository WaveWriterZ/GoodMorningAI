import { InMemoryExecutionIntentStore } from './idempotency-recovery';
import { InMemoryRecoveryStore, RecoveryReconciliationService } from './recovery-reconciliation';

describe('Module 68 recovery safety',()=>{
 const intent={idempotencyKey:'k',requestFingerprint:'f',missionId:'m',executionId:'e',decisionId:'d',authorizationId:'a',capabilityId:'c',target:'t',action:'x',status:'recovery_required',createdAt:1,updatedAt:1};
 const ev=(state:'executed'|'not_executed'|'failed'|'unknown')=>({state,source:'test',observedAt:2});
 test('unknown is never retryable',()=>{const i=new InMemoryExecutionIntentStore();i.save(intent);const s=new RecoveryReconciliationService(i,new InMemoryRecoveryStore());expect(()=>s.authorizeRetry('k','fresh',ev('unknown'))).toThrow(/not_executed/);const r=s.escalateUnknown('k',ev('unknown'));expect(r.resolution).toBe('escalated_unknown');});
 test('only verified not_executed authorizes retry',()=>{const i=new InMemoryExecutionIntentStore();i.save(intent);const s=new RecoveryReconciliationService(i,new InMemoryRecoveryStore());const r=s.authorizeRetry('k','fresh',ev('not_executed'));expect(r.resolution).toBe('retry_authorized');expect(r.retryAuthorizationId).toBe('fresh');});
 test('executed finalizes without retry',()=>{const i=new InMemoryExecutionIntentStore();i.save(intent);const s=new RecoveryReconciliationService(i,new InMemoryRecoveryStore());const r=s.confirmExecuted('k',{...ev('executed'),receipt:{externalId:'x'}});expect(r.resolution).toBe('finalized_executed');expect(i.get('k')?.status).toBe('verified');});
 test('failed finalizes as failed',()=>{const i=new InMemoryExecutionIntentStore();i.save(intent);const s=new RecoveryReconciliationService(i,new InMemoryRecoveryStore());const r=s.markFailed('k',ev('failed'));expect(r.resolution).toBe('finalized_failed');expect(i.get('k')?.status).toBe('failed');});
 test('resolver evidence is persisted',()=>{const i=new InMemoryExecutionIntentStore();i.save(intent);const s=new RecoveryReconciliationService(i,new InMemoryRecoveryStore());const r=s.reconcile('k',{resolve:()=>ev('not_executed')});expect(r.externalState).toBe('not_executed');});
});