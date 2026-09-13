import { InMemoryMissionEventStore, MissionEventRecorder, validateMissionEvent } from './mission-events';

describe('Module 59 mission events', () => {
  const base = {
    missionId: 'mission-1',
    decisionId: 'decision-1',
    executionId: 'execution-1',
    eventType: 'MISSION_EXECUTING' as const,
    actorId: 'actor-1',
    capabilityId: 'demo',
    previousState: 'preparing',
    currentState: 'executing',
    timestamp: 100,
    correlationId: 'corr-1',
  };

  test('validates required event lineage fields', () => {
    expect(validateMissionEvent({ ...base, eventId: '', missionId: '', currentState: '', correlationId: '', timestamp: Number.NaN })).toEqual([
      'event id is required',
      'mission id is required',
      'current state is required',
      'correlation id is required',
      'timestamp must be finite',
    ]);
  });

  test('records events and prevents duplicate event ids', () => {
    const store = new InMemoryMissionEventStore();
    const recorder = new MissionEventRecorder(store);
    const first = recorder.record(base);
    const second = recorder.record(base);
    expect(first?.eventId).toBe('mission-1:100:MISSION_EXECUTING');
    expect(second?.eventId).toBe(first?.eventId);
    expect(store.byMission('mission-1')).toHaveLength(1);
  });

  test('preserves chronological mission history', () => {
    const store = new InMemoryMissionEventStore();
    const recorder = new MissionEventRecorder(store);
    recorder.record({ ...base, eventType: 'MISSION_CREATED', currentState: 'created', timestamp: 10 });
    recorder.record({ ...base, eventType: 'MISSION_EXECUTING', currentState: 'executing', timestamp: 30 });
    recorder.record({ ...base, eventType: 'MISSION_PREPARING', currentState: 'preparing', timestamp: 20 });
    expect(store.byMission('mission-1').map((event) => event.eventType)).toEqual([
      'MISSION_CREATED', 'MISSION_PREPARING', 'MISSION_EXECUTING',
    ]);
  });

  test('correlates events across execution lifecycle', () => {
    const store = new InMemoryMissionEventStore();
    const recorder = new MissionEventRecorder(store);
    recorder.record({ ...base, eventType: 'MISSION_EXECUTING', timestamp: 10 });
    recorder.record({ ...base, eventType: 'EXECUTION_SUCCEEDED', currentState: 'executing', timestamp: 20 });
    recorder.record({ ...base, eventType: 'VERIFICATION_SUCCEEDED', currentState: 'completed', timestamp: 30 });
    expect(store.byCorrelation('corr-1')).toHaveLength(3);
  });

  test('retains provenance without changing authorization or execution authority', () => {
    const store = new InMemoryMissionEventStore();
    const recorder = new MissionEventRecorder(store);
    const event = recorder.record({ ...base, provenance: ['evidence-1', 'source-1', ''] });
    expect(event?.provenance).toEqual(['evidence-1', 'source-1']);
  });
});
