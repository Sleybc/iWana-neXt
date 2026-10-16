import { DataSource, EntityManager } from 'typeorm';
import { Quote } from '../../quotes/entities/quote.entity';
import { CrmQuoteReadAdapter } from '../crm-quote-read.adapter';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
  };
});

describe('CrmQuoteReadAdapter', () => {
  it('selecciona únicamente id, expedienteId y status en lecturas simples y batch', async () => {
    const quote = { id: 'quote-1', expedienteId: 'exp-1', status: 'DRAFT' };
    const manager = { find: jest.fn().mockResolvedValue([quote]) };
    mockRunInTenantSchema.mockImplementationOnce(async (_dataSource, _schemaName, callback) =>
      callback({ manager } as never),
    );

    const adapter = new CrmQuoteReadAdapter({} as DataSource);

    await expect(adapter.findByExpedienteId('tenant_schema', 'exp-1')).resolves.toEqual([
      { id: 'quote-1', expedienteId: 'exp-1', status: 'DRAFT' },
    ]);
    expect(manager.find).toHaveBeenCalledWith(Quote, {
      where: { expedienteId: 'exp-1' },
      select: ['id', 'expedienteId', 'status'],
    });

    await expect(
      adapter.findByExpedienteIds(manager as unknown as EntityManager, ['exp-1']),
    ).resolves.toEqual([{ id: 'quote-1', expedienteId: 'exp-1', status: 'DRAFT' }]);
    expect(manager.find).toHaveBeenNthCalledWith(2, Quote, {
      where: { expedienteId: expect.anything() },
      select: ['id', 'expedienteId', 'status'],
    });
  });

  it('usa el id solicitado cuando una cotización no trae expedienteId y omite batches vacíos', async () => {
    const manager = {
      find: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'quote-legacy', expedienteId: null, status: 2 }]),
    };
    mockRunInTenantSchema.mockImplementationOnce(async (_dataSource, _schemaName, callback) =>
      callback({ manager } as never),
    );
    const adapter = new CrmQuoteReadAdapter({} as DataSource);

    await expect(adapter.findByExpedienteId('tenant_schema', 'exp-requested')).resolves.toEqual([
      { id: 'quote-legacy', expedienteId: 'exp-requested', status: '2' },
    ]);
    await expect(
      adapter.findByExpedienteIds(manager as unknown as EntityManager, []),
    ).resolves.toEqual([]);

    expect(manager.find).toHaveBeenCalledTimes(1);
  });

  it('normaliza expedienteId ausente al proyectar resultados por lote', async () => {
    const manager = {
      find: jest.fn().mockResolvedValue([{ id: 'quote-legacy', expedienteId: null, status: null }]),
    };
    const adapter = new CrmQuoteReadAdapter({} as DataSource);

    await expect(
      adapter.findByExpedienteIds(manager as unknown as EntityManager, ['exp-sintetico']),
    ).resolves.toEqual([{ id: 'quote-legacy', expedienteId: '', status: 'null' }]);
  });
});
