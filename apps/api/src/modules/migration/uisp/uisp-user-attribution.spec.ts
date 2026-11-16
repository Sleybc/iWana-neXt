import { ticketComments } from './uisp-promotion-mapping';
import {
  paymentAttribution,
  referencedUserNumbers,
  ticketAttribution,
  uispUserNumber,
} from './uisp-user-attribution';

/**
 * Atribución por la equivalencia `USUARIO` (spec 2026-11-15 «usuarios» §2.6): el número de
 * UISP se traduce al usuario de iWana; sin equivalencia, el puerto usa a quien importa.
 */
const ANA = '11111111-1111-4111-8111-111111111111';
const LUIS = '22222222-2222-4222-8222-222222222222';
const resolve = (number: string) => ({ '7': ANA, '8': LUIS })[number] ?? null;

describe('uisp-user-attribution', () => {
  it('uispUserNumber acepta enteros positivos (número o texto) y descarta lo demás', () => {
    expect(uispUserNumber(7)).toBe('7');
    expect(uispUserNumber(' 12 ')).toBe('12');
    expect(uispUserNumber(0)).toBeNull();
    expect(uispUserNumber(-3)).toBeNull();
    expect(uispUserNumber(1.5)).toBeNull();
    expect(uispUserNumber('7a')).toBeNull();
    expect(uispUserNumber(null)).toBeNull();
    expect(uispUserNumber(undefined)).toBeNull();
    expect(uispUserNumber({})).toBeNull();
  });

  it('ticket: asignado, autor por comentario y creador = autor del primer comentario', () => {
    const raw = {
      public: true,
      assignedUserId: 8,
      activity: [
        { userId: 7, public: true, comment: { body: 'Abre' }, createdAt: '2023-03-01T00:00:00Z' },
        { userId: 99, public: false, comment: { body: 'Sin enlazar' } },
        { userId: 8, public: true },
        { userId: null, public: true, comment: { body: 'Cliente' } },
      ],
    };
    const result = ticketAttribution(raw, resolve);
    expect(result.assignedUserId).toBe(LUIS);
    expect(result.createdByUserId).toBe(ANA);
    expect(result.comments).toEqual([
      { body: 'Abre', internal: false, createdAt: '2023-03-01T00:00:00.000Z', authorUserId: ANA },
      { body: 'Sin enlazar', internal: true, createdAt: null, authorUserId: null },
      { body: 'Cliente', internal: false, createdAt: null, authorUserId: null },
    ]);
    // Los mismos comentarios, en el mismo orden, que la promoción sin atribución.
    expect(result.comments.map(({ authorUserId: _a, ...comment }) => comment)).toEqual(
      ticketComments(raw),
    );
  });

  it('ticket: el primer comentario sin equivalencia deja el creador a quien importa', () => {
    const raw = {
      activity: [
        { userId: 99, comment: { body: 'Primero' } },
        { userId: 7, comment: { body: 'Segundo' } },
      ],
    };
    const result = ticketAttribution(raw, resolve);
    expect(result.createdByUserId).toBeNull();
    expect(result.assignedUserId).toBeNull();
    expect(result.comments.map((c) => c.authorUserId)).toEqual([null, ANA]);
  });

  it('ticket sin comentarios ni asignado: todo a quien importa', () => {
    expect(ticketAttribution({ activity: [] }, resolve)).toEqual({
      assignedUserId: null,
      createdByUserId: null,
      comments: [],
    });
    expect(ticketAttribution(null, resolve).comments).toEqual([]);
  });

  it('pago: registrador por userId', () => {
    expect(paymentAttribution({ userId: 7 }, resolve)).toEqual({ createdBy: ANA });
    expect(paymentAttribution({ userId: 55 }, resolve)).toEqual({ createdBy: null });
    expect(paymentAttribution({}, resolve)).toEqual({ createdBy: null });
  });

  it('referencedUserNumbers: solo los números que atribuyen algo, sin repetir', () => {
    const ticket = {
      assignedUserId: 8,
      activity: [
        { userId: 7, comment: { body: 'a' } },
        { userId: 7, comment: { body: 'b' } },
        // Actividad sin comentario: no se importa, no cuenta.
        { userId: 31 },
        { userId: 'x', comment: { body: 'c' } },
      ],
    };
    expect(referencedUserNumbers('TICKET', ticket).sort()).toEqual(['7', '8']);
    expect(referencedUserNumbers('PAGO', { userId: 4 })).toEqual(['4']);
    expect(referencedUserNumbers('PAGO', { userId: null })).toEqual([]);
    expect(referencedUserNumbers('CONTRATO', { userId: 4 })).toEqual([]);
  });
});
