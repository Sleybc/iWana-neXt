import { ScheduleEventStatus, WfmWorkType } from '@iwana/shared';
import { buildSchedulingDemoState, shouldUseSchedulingDemoState } from './scheduling-demo-data';

describe('scheduling-demo-data', () => {
  it('habilita el dataset demo solo en agenda diaria vacía durante desarrollo', () => {
    expect(
      shouldUseSchedulingDemoState({
        environment: 'development',
        surface: 'agenda',
        filters: {
          fromDate: '2026-06-16',
          toDate: '2026-06-16',
          technicianId: '',
          type: '',
          status: '',
          view: 'day',
        },
        events: [],
        technicians: [],
        pendingVisitResponse: {
          items: [],
          meta: { total: 0, page: 1, limit: 8, totalPages: 1 },
        },
      }),
    ).toBe(true);
  });

  it('construye una jornada demo poblada y respeta filtros activos', () => {
    const demoState = buildSchedulingDemoState({
      fromDate: '2026-06-16',
      toDate: '2026-06-16',
      technicianId: '22222222-2222-4222-8222-222222222222',
      type: WfmWorkType.SUPPORT,
      status: ScheduleEventStatus.IN_PROGRESS,
      view: 'day',
    });

    expect(demoState.technicians).toHaveLength(1);
    expect(demoState.technicians[0]?.firstName).toBe('Carlos');
    expect(demoState.events).toHaveLength(1);
    expect(demoState.events[0]).toEqual(
      expect.objectContaining({
        assignedUserId: '22222222-2222-4222-8222-222222222222',
        type: WfmWorkType.SUPPORT,
        status: ScheduleEventStatus.IN_PROGRESS,
      }),
    );
    expect(demoState.pendingVisitResponse.items).toHaveLength(1);
    expect(demoState.pendingVisitResponse.items[0]).toEqual(
      expect.objectContaining({
        workType: WfmWorkType.SUPPORT,
      }),
    );
  });
});
