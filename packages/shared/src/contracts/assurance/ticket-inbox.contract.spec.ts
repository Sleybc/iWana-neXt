import {
  ASSURANCE_WORK_QUEUES,
  AssuranceWorkQueueCountsSchema,
  AssuranceWorkQueueSchema,
  TicketListSearchSchema,
} from './ticket-inbox.contract';
import * as shared from '../../index';

describe('ticket-inbox.contract (spec MOD10 bandeja §3 J–K, §4)', () => {
  it('las colas son las siete de la spec, en orden estable', () => {
    expect(ASSURANCE_WORK_QUEUES).toEqual([
      'mine',
      'dueSoon',
      'waitingCustomer',
      'fieldService',
      'unassigned',
      'breached',
      'all',
    ]);
    expect(AssuranceWorkQueueSchema.safeParse('unassigned').success).toBe(true);
    expect(AssuranceWorkQueueSchema.safeParse('open').success).toBe(false);
  });

  it('la búsqueda se recorta y exige entre 2 y 100 caracteres', () => {
    expect(TicketListSearchSchema.parse('  ana ')).toBe('ana');
    expect(TicketListSearchSchema.safeParse(' a ').success).toBe(false);
    expect(TicketListSearchSchema.safeParse('x'.repeat(101)).success).toBe(false);
    expect(TicketListSearchSchema.safeParse('x'.repeat(100)).success).toBe(true);
  });

  it('el conteo por cola exige las siete colas, enteras y no negativas, sin extras', () => {
    const counts = Object.fromEntries(ASSURANCE_WORK_QUEUES.map((queue) => [queue, 0]));
    expect(AssuranceWorkQueueCountsSchema.safeParse(counts).success).toBe(true);
    expect(AssuranceWorkQueueCountsSchema.safeParse({ ...counts, mine: -1 }).success).toBe(false);
    expect(AssuranceWorkQueueCountsSchema.safeParse({ ...counts, mine: 1.5 }).success).toBe(false);
    expect(AssuranceWorkQueueCountsSchema.safeParse({ ...counts, open: 1 }).success).toBe(false);
    const { all: _omit, ...rest } = counts;
    expect(AssuranceWorkQueueCountsSchema.safeParse(rest).success).toBe(false);
  });

  it('se exporta desde la raíz de @iwana/shared', () => {
    expect(shared.ASSURANCE_WORK_QUEUES).toBe(ASSURANCE_WORK_QUEUES);
    expect(shared.AssuranceWorkQueueCountsSchema).toBe(AssuranceWorkQueueCountsSchema);
  });
});
