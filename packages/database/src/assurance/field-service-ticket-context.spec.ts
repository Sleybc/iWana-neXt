import { readFieldServiceTicketContext } from './field-service-ticket-context';

const TICKET = { ticket_number: 'TK-1', subject: 'Asunto', priority: 'HIGH' };

function runner(ticket: unknown, link: unknown) {
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (sql.startsWith('SET LOCAL')) return [];
    if (sql.includes('FROM support_tickets')) return ticket ? [ticket] : [];
    if (sql.includes('FROM ticket_work_order_links')) return link ? [link] : [];
    throw new Error(`SQL inesperado: ${sql}`);
  });
  return { query };
}

describe('readFieldServiceTicketContext (sec-eng C-1)', () => {
  it('lee asunto, prioridad y número del ticket FOR SHARE y las notas de la solicitud', async () => {
    const qr = runner(TICKET, { notes: 'Notas' });
    await expect(
      readFieldServiceTicketContext(qr as never, { tenantId: 't', ticketId: 'k', linkId: 'l' }),
    ).resolves.toEqual({
      ticketNumber: 'TK-1',
      subject: 'Asunto',
      priority: 'HIGH',
      notes: 'Notas',
    });
    expect(qr.query).toHaveBeenNthCalledWith(1, expect.stringMatching(/^SET LOCAL lock_timeout/));
    expect(qr.query).toHaveBeenCalledWith(expect.stringMatching(/FOR SHARE/), ['k', 't']);
    expect(qr.query).toHaveBeenCalledWith(expect.stringContaining('ticket_work_order_links'), [
      'l',
      'k',
      't',
    ]);
  });

  it('sin linkId (job antiguo) toma la solicitud más reciente', async () => {
    const qr = runner(TICKET, { notes: null });
    await readFieldServiceTicketContext(qr as never, { tenantId: 't', ticketId: 'k' });
    expect(qr.query).toHaveBeenCalledWith(expect.stringMatching(/ORDER BY requested_at DESC/), [
      'k',
      't',
    ]);
  });

  it('devuelve null sin ticket o sin solicitud', async () => {
    await expect(
      readFieldServiceTicketContext(runner(null, { notes: null }) as never, {
        tenantId: 't',
        ticketId: 'k',
      }),
    ).resolves.toBeNull();
    await expect(
      readFieldServiceTicketContext(runner(TICKET, null) as never, {
        tenantId: 't',
        ticketId: 'k',
        linkId: 'l',
      }),
    ).resolves.toBeNull();
  });
});
