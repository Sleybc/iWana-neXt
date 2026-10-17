import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { QueryFailedError, type EntityManager, type QueryRunner } from 'typeorm';
import { CrmPersonalDataErasureAdapter } from './crm-personal-data-erasure.adapter';

function queryFailed(code: string): QueryFailedError {
  const driverError = Object.assign(new Error('fallo sintético del driver'), { code });
  return new QueryFailedError(
    'SELECT 1 FROM "tabla" WHERE "id" = $1',
    ['valor-sensible'],
    driverError,
  );
}

function participant() {
  return {
    resolveScope: jest.fn().mockResolvedValue(undefined),
    plan: jest.fn().mockResolvedValue([]),
    apply: jest.fn().mockResolvedValue([]),
  };
}

describe('CrmPersonalDataErasureAdapter — errores de participantes', () => {
  const target = { requestId: 'req-1', partyId: null, requesterDocumentHmac: null };
  let qr: { isTransactionActive: boolean; query: jest.Mock };
  let manager: EntityManager;
  let crm: ReturnType<typeof participant> & {
    findSubscriberIds: jest.Mock;
    findExpedienteIdsByDocumentHmac: jest.Mock;
  };
  let users: ReturnType<typeof participant> & {
    findUserIds: jest.Mock;
    activeAccountCount: jest.Mock;
  };
  let wfm: ReturnType<typeof participant>;
  let adapter: CrmPersonalDataErasureAdapter;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    qr = { isTransactionActive: true, query: jest.fn().mockResolvedValue([]) };
    manager = { queryRunner: qr as unknown as QueryRunner } as unknown as EntityManager;
    crm = {
      ...participant(),
      findSubscriberIds: jest.fn().mockResolvedValue([]),
      findExpedienteIdsByDocumentHmac: jest.fn().mockResolvedValue([]),
    };
    users = {
      ...participant(),
      findUserIds: jest.fn().mockResolvedValue([]),
      activeAccountCount: jest.fn().mockResolvedValue(0),
    };
    wfm = participant();
    adapter = new CrmPersonalDataErasureAdapter(
      crm as never,
      participant() as never,
      users as never,
      wfm as never,
      participant() as never,
      participant() as never,
      participant() as never,
    );
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => loggerError.mockRestore());

  it.each([
    ['22P02', 'valor de enum inválido'],
    ['42P01', 'tabla ausente'],
    ['42703', 'columna ausente'],
    ['42883', 'operador entre tipos incompatibles'],
  ])('convierte un fallo SQL %s (%s) del alcance en un 503 con código de dominio', async (code) => {
    wfm.resolveScope.mockRejectedValueOnce(queryFailed(code));

    const error = await adapter.plan(target, { manager }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'PRIVACY_ERASURE_PARTICIPANT_UNAVAILABLE',
    });
  });

  it('registra participante, fase y SQLSTATE sin stack ni parámetros de la consulta', async () => {
    wfm.plan.mockRejectedValueOnce(queryFailed('42703'));

    await expect(adapter.plan(target, { manager })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(loggerError).toHaveBeenCalledTimes(1);
    const [message] = loggerError.mock.calls[0] as [string];
    expect(message).toContain('participant=wfm');
    expect(message).toContain('phase=plan');
    expect(message).toContain('sqlstate=42703');
    expect(loggerError.mock.calls[0]).toHaveLength(1);
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain('valor-sensible');
  });

  it('aplica la misma conversión cuando el fallo ocurre al anonimizar', async () => {
    wfm.apply.mockRejectedValueOnce(queryFailed('42P01'));

    await expect(
      adapter.anonymize({ ...target, expedienteIds: [], actorId: 'actor-1' }, { manager }),
    ).rejects.toMatchObject({
      response: { code: 'PRIVACY_ERASURE_PARTICIPANT_UNAVAILABLE' },
    });
  });

  it('propaga sin cambios un error que no es de esquema', async () => {
    const unexpected = new Error('fallo inesperado');
    wfm.resolveScope.mockRejectedValueOnce(unexpected);

    await expect(adapter.plan(target, { manager })).rejects.toBe(unexpected);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('propaga sin cambios un fallo SQL que no es esperable (p. ej. bloqueo)', async () => {
    const deadlock = queryFailed('40P01');
    wfm.resolveScope.mockRejectedValueOnce(deadlock);

    await expect(adapter.plan(target, { manager })).rejects.toBe(deadlock);
  });

  it('con alcance vacío devuelve conteos en cero sin bloqueos', async () => {
    const plan = await adapter.plan(target, { manager });

    expect(plan.candidateExpedienteIds).toEqual([]);
    expect(plan.blockers).toEqual([]);
    expect(Object.values(plan.counts).every((count) => count === 0)).toBe(true);
  });
});
