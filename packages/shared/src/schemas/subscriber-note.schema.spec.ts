import {
  CreateSubscriberNoteSchema,
  SUBSCRIBER_NOTE_BODY_MAX_LENGTH,
  SubscriberNoteListResponseSchema,
  SubscriberNoteSchema,
} from './subscriber-note.schema';

const note = {
  id: '6f1c2a9e-1b2c-4d3e-8f90-0a1b2c3d4e5f',
  subscriberId: '7a1c2a9e-1b2c-4d3e-8f90-0a1b2c3d4e5f',
  body: 'Prefiere visitas en la mañana.',
  createdBy: '8b1c2a9e-1b2c-4d3e-8f90-0a1b2c3d4e5f',
  createdAt: '2026-11-10T15:00:00.000Z',
};

const meta = {
  nextCursor: null,
  total: 1,
  totalIsEstimate: false,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasMore: false,
  mode: 'page' as const,
  capabilities: { randomAccess: true, sortableFields: [] },
  sort: null,
};

describe('SubscriberNote contract', () => {
  it('acepta una nota y recorta espacios al crearla', () => {
    expect(SubscriberNoteSchema.parse(note)).toEqual(note);
    expect(CreateSubscriberNoteSchema.parse({ body: '  hola  ' })).toEqual({ body: 'hola' });
  });

  it('rechaza nota vacía, solo espacios, demasiado larga o con campos extra', () => {
    expect(CreateSubscriberNoteSchema.safeParse({ body: '' }).success).toBe(false);
    expect(CreateSubscriberNoteSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(
      CreateSubscriberNoteSchema.safeParse({
        body: 'x'.repeat(SUBSCRIBER_NOTE_BODY_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      CreateSubscriberNoteSchema.safeParse({ body: 'x'.repeat(SUBSCRIBER_NOTE_BODY_MAX_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      CreateSubscriberNoteSchema.safeParse({ body: 'ok', createdBy: note.createdBy }).success,
    ).toBe(false);
  });

  it('valida la respuesta paginada', () => {
    const parsed = SubscriberNoteListResponseSchema.parse({
      data: [note],
      meta,
    });
    expect(parsed.data).toHaveLength(1);
    const parse = (input: unknown) => SubscriberNoteListResponseSchema.safeParse(input).success;
    expect(parse({ data: [{ ...note, body: '' }], meta })).toBe(false);
    const { mode: _mode, ...withoutMode } = meta;
    expect(parse({ data: [note], meta: withoutMode })).toBe(false);
    expect(parse({ data: [note], meta: { ...meta, extra: 1 } })).toBe(false);
    expect(parse({ data: [note], meta: { ...meta, capabilities: { randomAccess: true } } })).toBe(
      false,
    );
  });
});
