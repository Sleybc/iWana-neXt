import { executionOrderVisitHref } from './execution-order-links';

type Visit = Parameters<typeof executionOrderVisitHref>[0];

const EVENT_ID = '9f6e1a7c-5b8d-4c0e-8f3a-4e5f60718293';
const visit = (scheduleEventId: string) => ({ scheduleEventId }) as unknown as Visit;

describe('executionOrderVisitHref (MOD09 agenda §3 G, CA-10)', () => {
  it('sin windowStartAt enlaza solo al evento, sin día fijo', () => {
    expect(executionOrderVisitHref(visit(EVENT_ID), null)).toBe(
      `/dashboard/scheduling/agenda?eventId=${EVENT_ID}`,
    );
    expect(executionOrderVisitHref(visit(EVENT_ID), undefined)).toBe(
      `/dashboard/scheduling/agenda?eventId=${EVENT_ID}`,
    );
  });

  it('con windowStartAt inválido tampoco fija día', () => {
    expect(executionOrderVisitHref(visit(EVENT_ID), 'no-es-fecha')).toBe(
      `/dashboard/scheduling/agenda?eventId=${EVENT_ID}`,
    );
  });

  it('sin visita o con id que no es UUID no hay enlace', () => {
    expect(executionOrderVisitHref(null as unknown as Visit, null)).toBeNull();
    expect(executionOrderVisitHref(visit('evento-1'), null)).toBeNull();
  });
});
