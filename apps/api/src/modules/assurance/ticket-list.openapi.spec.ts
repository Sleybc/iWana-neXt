import { TICKET_LIST_ORDERS, TicketListItemExtensionSchema } from '@iwana/shared';
import { TICKET_LIST_OPENAPI, TICKET_LIST_ORDER_QUERY_OPENAPI } from './ticket-list.openapi';

describe('ticket-list.openapi (spec MOD05 pestaña Soporte §16 B-1 a B-3)', () => {
  const item = (TICKET_LIST_OPENAPI.properties!['data'] as { items: Record<string, unknown> })
    .items as { required: string[]; properties: Record<string, { nullable?: boolean }> };

  it('cada ticket declara los campos del contrato compartido, todos requeridos y anulables', () => {
    for (const field of Object.keys(TicketListItemExtensionSchema.shape)) {
      expect(item.required).toContain(field);
      expect(item.properties[field]?.nullable).toBe(true);
    }
    expect(item.required).toEqual(expect.arrayContaining(['id', 'attachmentCount']));
  });

  it('no declara correo ni otros datos del responsable', () => {
    expect(JSON.stringify(TICKET_LIST_OPENAPI)).not.toMatch(/assignedUserEmail|email/u);
  });

  it('meta.total es entero y el orden expone los valores del contrato', () => {
    const meta = TICKET_LIST_OPENAPI.properties!['meta'] as {
      required: string[];
      properties: Record<string, { type: string }>;
    };
    expect(meta.required).toContain('total');
    expect(meta.properties['total']?.type).toBe('integer');
    expect(TICKET_LIST_ORDER_QUERY_OPENAPI.enum).toEqual([...TICKET_LIST_ORDERS]);
    expect(TICKET_LIST_ORDER_QUERY_OPENAPI.default).toBe('recent');
  });
});
