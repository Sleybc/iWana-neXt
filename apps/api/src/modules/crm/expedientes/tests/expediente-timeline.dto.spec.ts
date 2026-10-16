import { ExpedienteTimelineQuerySchema } from '../dto/expediente-timeline.dto';

describe('ExpedienteTimelineQuerySchema', () => {
  it('normaliza valores omitidos y vacíos y acepta paginación numérica', () => {
    expect(
      ExpedienteTimelineQuerySchema.parse({ page: undefined, limit: '', filter: 'all' }),
    ).toEqual({ filter: 'all' });

    expect(ExpedienteTimelineQuerySchema.parse({ page: '2', limit: '10' })).toEqual({
      page: 2,
      limit: 10,
    });
    expect(ExpedienteTimelineQuerySchema.parse({ page: null, limit: undefined })).toEqual({});
  });

  it('rechaza paginación menor que uno y filtros fuera del catálogo', () => {
    expect(ExpedienteTimelineQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(ExpedienteTimelineQuerySchema.safeParse({ filter: 'private' }).success).toBe(false);
  });
});
