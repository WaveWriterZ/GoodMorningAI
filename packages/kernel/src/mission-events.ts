/**
 * Module 59 — Autonomous Mission Event & Observability Fabric
 *
 * Provides a durable, correlation-friendly event contract for mission
 * execution. The fabric records state transitions and outcomes without
 * granting execution authority or mutating mission state on its own.
 */

export type MissionEventType =
  | 'MISSION_CREATED'
  | 'MISSION_PREPARING'
  | 'MISSION_BLOCKED'
  | 'MISSION_EXECUTING'
  | 'EXECUTION_SUCCEEDED'
  | 'EXECUTION_FAILED'
  | 'VERIFICATION_STARTED'
  | 'VERIFICATION_SUCCEEDED'
  | 'VERIFICATION_FAILED'
  | 'RECOVERY_REQUIRED'
  | 'MISSION_COMPLETED'
  | 'LEARNING_SIGNAL_EMITTED';

export interface MissionEvent {
  eventId: string;
  missionId: string;
  decisionId?: string;
  executionId?: string;
  eventType: MissionEventType;
  actorId?: string;
  capabilityId?: string;
  previousState?: string;
  currentState: string;
  timestamp: number;
  payload?: Record<string, unknown>;
  provenance?: string[];
  correlationId: string;
}

export interface MissionEventStore {
  append(event: MissionEvent): void;
  get(eventId: string): MissionEvent | undefined;
  byMission(missionId: string): MissionEvent[];
  byCorrelation(correlationId: string): MissionEvent[];
}

function valid(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeMissionEvent(event: MissionEvent): MissionEvent {
  return {
    ...event,
    eventId: event.eventId.trim(),
    missionId: event.missionId.trim(),
    decisionId: event.decisionId?.trim() || undefined,
    executionId: event.executionId?.trim() || undefined,
    actorId: event.actorId?.trim() || undefined,
    capabilityId: event.capabilityId?.trim() || undefined,
    previousState: event.previousState?.trim() || undefined,
    currentState: event.currentState.trim(),
    correlationId: event.correlationId.trim(),
    provenance: event.provenance?.filter(valid).map((item) => item.trim()),
  };
}

export function validateMissionEvent(event: MissionEvent): string[] {
  const reasons: string[] = [];
  if (!valid(event.eventId)) reasons.push('event id is required');
  if (!valid(event.missionId)) reasons.push('mission id is required');
  if (!valid(event.currentState)) reasons.push('current state is required');
  if (!valid(event.correlationId)) reasons.push('correlation id is required');
  if (!Number.isFinite(event.timestamp)) reasons.push('timestamp must be finite');
  return reasons;
}

export class InMemoryMissionEventStore implements MissionEventStore {
  private readonly events = new Map<string, MissionEvent>();

  append(input: MissionEvent): void {
    const event = normalizeMissionEvent(input);
    if (validateMissionEvent(event).length > 0) return;
    if (this.events.has(event.eventId)) return;
    this.events.set(event.eventId, event);
  }

  get(eventId: string): MissionEvent | undefined {
    return this.events.get(eventId);
  }

  byMission(missionId: string): MissionEvent[] {
    return [...this.events.values()]
      .filter((event) => event.missionId === missionId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  byCorrelation(correlationId: string): MissionEvent[] {
    return [...this.events.values()]
      .filter((event) => event.correlationId === correlationId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

export interface MissionEventInput {
  missionId: string;
  decisionId?: string;
  executionId?: string;
  eventType: MissionEventType;
  actorId?: string;
  capabilityId?: string;
  previousState?: string;
  currentState: string;
  timestamp: number;
  payload?: Record<string, unknown>;
  provenance?: string[];
  correlationId: string;
}

export class MissionEventRecorder {
  constructor(private readonly store: MissionEventStore) {}

  record(input: MissionEventInput): MissionEvent | undefined {
    const event: MissionEvent = {
      eventId: `${input.missionId}:${input.timestamp}:${input.eventType}`,
      ...input,
    };
    const normalized = normalizeMissionEvent(event);
    if (validateMissionEvent(normalized).length > 0) return undefined;
    this.store.append(normalized);
    return this.store.get(normalized.eventId);
  }
}
