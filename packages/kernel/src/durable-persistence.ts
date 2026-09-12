/**
 * Module 65 — Durable Persistence Adapter & CI Vertical Slice
 *
 * Provides a Node-backed JSON persistence boundary for the kernel. The adapter
 * is intentionally small and deterministic: production deployments can replace
 * these repositories with database-backed implementations without changing the
 * runtime contracts.
 *
 * Writes use a temp file + rename so a completed write never intentionally
 * leaves a partially-written JSON document at the canonical path.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { EvidenceBundle } from './trust';
import { MissionExecution } from './mission-execution';
import { LearningObservation } from './learning';
import { MissionEvent, MissionEventStore, normalizeMissionEvent, validateMissionEvent } from './mission-events';
import { EvidenceRepository, MissionRepository, LearningObservationRepository } from './runtime-spine';

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function writeJson<T>(path: string, value: T): void {
  ensureParent(path);
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  renameSync(temporary, path);
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, 'utf8');
  if (!raw.trim()) return fallback;
  return JSON.parse(raw) as T;
}

export interface DurablePersistencePaths {
  evidence: string;
  missions: string;
  learning: string;
  events: string;
}

export class JsonEvidenceRepository implements EvidenceRepository {
  constructor(private readonly path: string) {}

  save(bundle: EvidenceBundle): void {
    if (!bundle.evidence.id.trim()) throw new Error('evidence id is required');
    if (!bundle.source.id.trim()) throw new Error('evidence source id is required');
    const records = readJson<Record<string, EvidenceBundle>>(this.path, {});
    records[bundle.evidence.id] = bundle;
    writeJson(this.path, records);
  }

  get(id: string): EvidenceBundle | undefined {
    return readJson<Record<string, EvidenceBundle>>(this.path, {})[id];
  }

  list(): EvidenceBundle[] {
    return Object.values(readJson<Record<string, EvidenceBundle>>(this.path, {}));
  }
}

export class JsonMissionRepository implements MissionRepository {
  constructor(private readonly path: string) {}

  save(mission: MissionExecution): void {
    if (!mission.missionId.trim()) throw new Error('mission id is required');
    const records = readJson<Record<string, MissionExecution>>(this.path, {});
    records[mission.missionId] = mission;
    writeJson(this.path, records);
  }

  get(missionId: string): MissionExecution | undefined {
    return readJson<Record<string, MissionExecution>>(this.path, {})[missionId];
  }
}

export class JsonLearningObservationRepository implements LearningObservationRepository {
  constructor(private readonly path: string) {}

  save(observation: LearningObservation): void {
    if (!observation.id.trim()) throw new Error('learning observation id is required');
    const records = readJson<Record<string, LearningObservation>>(this.path, {});
    records[observation.id] = { ...observation, evidence: [...observation.evidence] };
    writeJson(this.path, records);
  }

  listBySubject(subjectId: string): LearningObservation[] {
    return Object.values(readJson<Record<string, LearningObservation>>(this.path, {}))
      .filter((item) => item.subjectId === subjectId)
      .map((item) => ({ ...item, evidence: [...item.evidence] }));
  }
}

export class JsonMissionEventStore implements MissionEventStore {
  constructor(private readonly path: string) {}

  append(input: MissionEvent): void {
    const event = normalizeMissionEvent(input);
    if (validateMissionEvent(event).length > 0) return;
    const records = readJson<Record<string, MissionEvent>>(this.path, {});
    if (records[event.eventId]) return;
    records[event.eventId] = event;
    writeJson(this.path, records);
  }

  get(eventId: string): MissionEvent | undefined {
    return readJson<Record<string, MissionEvent>>(this.path, {})[eventId];
  }

  byMission(missionId: string): MissionEvent[] {
    return Object.values(readJson<Record<string, MissionEvent>>(this.path, {}))
      .filter((event) => event.missionId === missionId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  byCorrelation(correlationId: string): MissionEvent[] {
    return Object.values(readJson<Record<string, MissionEvent>>(this.path, {}))
      .filter((event) => event.correlationId === correlationId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

export interface DurableRepositories {
  evidence: JsonEvidenceRepository;
  missions: JsonMissionRepository;
  learning: JsonLearningObservationRepository;
  events: JsonMissionEventStore;
}

export function createJsonRepositories(paths: DurablePersistencePaths): DurableRepositories {
  return {
    evidence: new JsonEvidenceRepository(paths.evidence),
    missions: new JsonMissionRepository(paths.missions),
    learning: new JsonLearningObservationRepository(paths.learning),
    events: new JsonMissionEventStore(paths.events),
  };
}
