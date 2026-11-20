import {
  SubscriberUpcomingVisitItemSchema,
  SubscriberUpcomingVisitsResponseSchema,
} from '@iwana/shared';
import { SUBSCRIBER_UPCOMING_VISITS_OPENAPI } from './subscriber-upcoming-visits.openapi';

describe('subscriber-upcoming-visits.openapi (spec 2026-11-20 v1.1, bloque I)', () => {
  const root = SUBSCRIBER_UPCOMING_VISITS_OPENAPI as {
    required: string[];
    properties: Record<
      string,
      { items?: { required: string[]; properties: Record<string, { required?: string[] }> } }
    >;
  };
  const item = root.properties['items']!.items!;

  it('declara como requeridos todos los campos del contrato compartido', () => {
    expect(root.required.sort()).toEqual(
      Object.keys(SubscriberUpcomingVisitsResponseSchema.shape).sort(),
    );
    expect(item.required.sort()).toEqual(
      Object.keys(SubscriberUpcomingVisitItemSchema.shape).sort(),
    );
    expect(item.properties['origin']!.required!.sort()).toEqual(
      ['contractId', 'expedienteId', 'ticketId', 'ticketNumber', 'type'].sort(),
    );
  });
});
