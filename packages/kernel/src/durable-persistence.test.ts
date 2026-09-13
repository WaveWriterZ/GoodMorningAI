import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReferenceMission } from './reference-mission';
import {
  createJsonRepositories,
  DurablePersistencePaths,
} from './durable-persistence';

function paths(root: string): DurablePersistencePaths {
  return {
    evidence: join(root, 'evidence.json'),
    missions: join(root, 'missions.json'),
    learning: join(root, 'learning.json'),
    events: join(root, 'events.json'),
  };
}

describe('Module 65 durable persistence', () => {
  it('persists a complete reference mission and reloads it in a fresh repository instance', () => {
    const root = mkdtempSync(join(tmpdir(), 'goodmorningai-'));
    try {
      const storage = createJsonRepositories(paths(root));
      const result = runReferenceMission({
        now: 1_700_000_000_000,
        missionId: 'durable-mission-1',
        decisionId: 'durable-decision-1',
      });

      result.evidence.forEach((bundle) => storage.evidence.save(bundle));
      storage.missions.save(result.mission);
      result.events.forEach((event) => storage.events.append(event));
      if (result.learningObservation) storage.learning.save(result.learningObservation);

      const reloaded = createJsonRepositories(paths(root));
      expect(reloaded.evidence.get('reference-evidence-1')).toBeDefined();
      expect(reloaded.missions.get('durable-mission-1')?.missionId).toBe('durable-mission-1');
      expect(reloaded.events.byMission('durable-mission-1').length).toBe(result.events.length);
      expect(reloaded.learning.listBySubject('durable-mission-1')).toHaveLength(1);
      expect(result.validation.passed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves event idempotency across repository reloads', () => {
    const root = mkdtempSync(join(tmpdir(), 'goodmorningai-'));
    try {
      const storage = createJsonRepositories(paths(root));
      const result = runReferenceMission({ now: 1_700_000_000_000, missionId: 'durable-mission-2' });
      const event = result.events[0];

      storage.events.append(event);
      const reloaded = createJsonRepositories(paths(root));
      reloaded.events.append(event);

      expect(reloaded.events.byMission('durable-mission-2')).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
