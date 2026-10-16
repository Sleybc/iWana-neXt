import { TenantContext } from '@iwana/db';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { PrivacyMarksAdapter } from './privacy-marks.adapter';

const partyA = '71000000-0000-4000-8000-000000000001';
const partyB = '71000000-0000-4000-8000-000000000002';
const unknownParty = '71000000-0000-4000-8000-000000000003';
const requestId = '71000000-0000-4000-8000-000000000004';

describe('PrivacyMarksAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('inicializa cada Party y devuelve solo el evento más reciente activo', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        { partyId: partyA, mark: 'RECLAMO_EN_TRAMITE', event: 'OPEN' },
        { partyId: partyA, mark: 'RECLAMO_EN_TRAMITE', event: 'CLOSE' },
        { partyId: partyB, mark: 'DATOS_BLOQUEADOS', event: 'CLOSE' },
        { partyId: partyB, mark: 'VICTIMA_FALSEDAD_PERSONAL', event: 'OPEN' },
        { partyId: unknownParty, mark: 'DATOS_BLOQUEADOS', event: 'OPEN' },
      ]),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ schemaName: 'tenant_privacy_test' } as never);
    const adapter = new PrivacyMarksAdapter({} as never);

    await expect(adapter.activeMarks([partyA, partyB])).resolves.toEqual({
      [partyA]: ['RECLAMO_EN_TRAMITE'],
      [partyB]: ['VICTIMA_FALSEDAD_PERSONAL'],
    });
    expect(repository.find).toHaveBeenCalled();
  });

  it('evita abrir la base de datos para una lista vacía', async () => {
    const dataSource = { getRepository: jest.fn() };
    const adapter = new PrivacyMarksAdapter(dataSource as never);
    await expect(adapter.activeMarks([])).resolves.toEqual({});
    expect(dataSource.getRepository).not.toHaveBeenCalled();
  });

  it('lista los titulares con la marca activa (el último evento es OPEN)', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        { partyId: partyA, mark: 'DATOS_BLOQUEADOS', event: 'OPEN' },
        { partyId: partyA, mark: 'DATOS_BLOQUEADOS', event: 'CLOSE' },
        { partyId: partyB, mark: 'DATOS_BLOQUEADOS', event: 'CLOSE' },
        { partyId: partyB, mark: 'DATOS_BLOQUEADOS', event: 'OPEN' },
        { partyId: unknownParty, mark: 'DATOS_BLOQUEADOS', event: 'OPEN' },
      ]),
    };
    const manager = { getRepository: jest.fn(() => repository) };
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    const adapter = new PrivacyMarksAdapter({} as never);

    await expect(adapter.partyIdsWithActiveMark('DATOS_BLOQUEADOS')).resolves.toEqual([
      partyA,
      unknownParty,
    ]);
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mark: 'DATOS_BLOQUEADOS' } }),
    );
  });
});
