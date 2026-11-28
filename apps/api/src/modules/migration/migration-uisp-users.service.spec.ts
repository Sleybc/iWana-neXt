import { ConflictException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, MigrationUispUserSchema, UserRole } from '@iwana/shared';
import { MigrationCrypto } from './migration-crypto';
import { MigrationPermanentError } from './migration-simulation.service';
import { MigrationUispUsersService, maskUispEmail } from './migration-uisp-users.service';
import { UispApiError } from './uisp-api/uisp-api.client';
import { serializeUispStaffName } from './uisp-api/uisp-admins';

const tenantId = '69000000-0000-4000-8000-000000000001';
const actorId = '69000000-0000-4000-8000-000000000002';
const connectionId = '69000000-0000-4000-8000-0000000000aa';
const matchedUserId = '69000000-0000-4000-8000-0000000000bb';
const scope = { tenantId, schemaName: 'tenant_uisp_users_unit' };
const APP_KEY = 'clave-sintetica-usuarios-1a2b3c';
const NAME = 'Persona Sintetica Uno';
const EMAIL = 'persona.uno@example.test';

describe('MigrationUispUsersService', () => {
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '34'.repeat(32),
    MFA_ENCRYPTION_KEY: '56'.repeat(32),
    PII_HASH_KEY: '78'.repeat(32),
    NODE_ENV: 'test',
  });
  const crypto = new MigrationCrypto(config);
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const connections = {
    load: jest.fn(),
    recordCheck: jest.fn().mockResolvedValue(null),
  };
  const client = { listAdmins: jest.fn(), listPage: jest.fn() };
  let processLists: Record<string, unknown[]>;
  const users = { findUserIdsByEmailHash: jest.fn() };
  const provisioning = {
    repairImportedUserNames: jest.fn(),
    publishCreatedUsers: jest.fn(),
  };
  let createdRows: Array<{ uisp_user_id: number; target_user_id: string }>;
  const logs: string[] = [];
  let staged: Array<{ batch_id: string; entity: string; payload_encrypted: string }>;
  let listRows: unknown[];
  let upserts: unknown[][];
  let sinDatos: unknown[][];
  let connectionRows: unknown[];
  let existingSinDatos: number[];

  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('search_path')) return [];
    if (sql.includes('FROM migration_source_connections')) return connectionRows;
    if (sql.includes('FROM migration_staging_records')) return staged;
    if (sql.includes("'SIN_DATOS'")) {
      sinDatos.push(params);
      return (params[1] as number[])
        .filter((id) => !existingSinDatos.includes(id))
        .map((id) => ({ uisp_user_id: id, inserted: true }));
    }
    if (sql.includes('INSERT INTO migration_uisp_users')) {
      upserts.push(params);
      return [{ inserted: upserts.length % 2 === 1 }];
    }
    if (sql.includes("status = 'CREADO'")) return createdRows;
    if (sql.includes('FROM migration_uisp_users')) return listRows;
    return [];
  });
  const qr = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query,
    manager: { query },
  };
  const service = new MigrationUispUsersService(
    { createQueryRunner: () => qr } as never,
    queue as never,
    crypto,
    audit as never,
    connections as never,
    client as never,
    users as never,
    provisioning as never,
  );

  const stage = (batchId: string, entity: string, raw: unknown) => ({
    batch_id: batchId,
    entity,
    payload_encrypted: crypto.encryptPayload({ raw }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    logs.length = 0;
    for (const level of ['log', 'warn', 'error'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(' ')));
    }
    staged = [];
    listRows = [];
    upserts = [];
    sinDatos = [];
    createdRows = [];
    provisioning.repairImportedUserNames.mockResolvedValue([]);
    connectionRows = [{ id: connectionId }];
    existingSinDatos = [];
    processLists = {};
    client.listPage.mockImplementation(
      async (_connection: unknown, path: string, limit: number, offset: number) =>
        (processLists[path] ?? []).slice(offset, offset + limit),
    );
    connections.load.mockResolvedValue({
      id: connectionId,
      connection: {
        baseUrl: 'https://uisp.example.test',
        appKey: APP_KEY,
        trustedCertificateSha256: null,
      },
    });
    users.findUserIdsByEmailHash.mockResolvedValue(new Map());
  });

  afterEach(() => jest.restoreAllMocks());

  /** Lo que sale del servicio hacia afuera: cola, auditoría y logs. */
  const exposed = () => JSON.stringify([queue.add.mock.calls, audit.logWithin.mock.calls, logs]);

  describe('requestFetch', () => {
    it('encola un job solo con ids y audita en la misma transacción', async () => {
      const accepted = await service.requestFetch(scope, actorId);

      expect(accepted.status).toBe('EN_CURSO');
      expect(queue.add).toHaveBeenCalledWith(
        'fetch-uisp-users',
        { version: 1, tenantId, actorId },
        expect.objectContaining({ attempts: 3 }),
      );
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: 'MigrationUispUsers',
          entityId: connectionId,
          newValue: { solicitud: 'TRAER_USUARIOS' },
        }),
        expect.anything(),
      );
      expect(exposed()).not.toContain(APP_KEY);
    });

    it('sin conexión → MIGRATION_SOURCE_NOT_CONFIGURED y no encola', async () => {
      connectionRows = [];
      await expect(service.requestFetch(scope, actorId)).rejects.toBeInstanceOf(ConflictException);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('si Redis falla responde 503 MIGRATION_ENQUEUE_FAILED', async () => {
      queue.add.mockRejectedValueOnce(new Error('redis caído'));
      await expect(service.requestFetch(scope, actorId)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('fetch (job)', () => {
    it('cifra nombre y correo, calcula el HMAC y propone la coincidencia', async () => {
      const hash = crypto.emailHmac(EMAIL);
      users.findUserIdsByEmailHash.mockResolvedValue(new Map([[hash, matchedUserId]]));
      client.listAdmins.mockResolvedValue([
        {
          id: 11,
          email: EMAIL.toUpperCase(),
          firstName: 'Persona',
          lastName: 'Sintetica Uno',
          isActive: true,
        },
        { id: 12, email: null, username: 'pdos', isActive: false },
      ]);

      const summary = await service.fetch(scope, actorId);

      expect(users.findUserIdsByEmailHash).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId }),
        [hash],
      );
      const [first, second] = upserts;
      expect(first![1]).toBe(11);
      // Nombre y apellido viajan separados: unirlos y partirlos pasaba palabras al apellido.
      expect(JSON.parse(crypto.decryptText(first![2] as string))).toEqual({
        v: 1,
        displayName: NAME,
        firstName: 'Persona',
        lastName: 'Sintetica Uno',
      });
      expect(crypto.decryptText(first![3] as string)).toBe(EMAIL);
      expect(first![4]).toBe(hash);
      expect(first![5]).toBe(true);
      expect(first![6]).toBe(matchedUserId);
      expect(second!.slice(1)).toEqual([12, expect.any(String), null, null, false, null]);
      expect(summary).toMatchObject({ api: 2, nuevos: 1, actualizados: 1, coincidencias: 1 });
      expect(connections.recordCheck).toHaveBeenCalledWith(scope, 'OK', actorId);
      // Ni la clave, ni el nombre, ni el correo salen en auditoría o logs.
      for (const secret of [APP_KEY, NAME, EMAIL, 'Persona', 'pdos']) {
        expect(exposed()).not.toContain(secret);
      }
    });

    it('pide corregir el nombre de los usuarios que creó la importación y los reindexa', async () => {
      client.listAdmins.mockResolvedValue([
        { id: 11, firstName: 'Persona Maria', lastName: 'Sintetica', isActive: true },
        { id: 12, username: 'pdos', isActive: true },
        { id: 13, isActive: true },
      ]);
      createdRows = [
        { uisp_user_id: 11, target_user_id: 'usr-11' },
        { uisp_user_id: 12, target_user_id: 'usr-12' },
      ];
      provisioning.repairImportedUserNames.mockResolvedValue(['usr-11']);

      const summary = await service.fetch(scope, actorId);

      const createdQuery = query.mock.calls.find(([sql]) => sql.includes("status = 'CREADO'"));
      expect(createdQuery?.[1]).toEqual([tenantId, [11, 12]]);
      expect(provisioning.repairImportedUserNames).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, schemaName: scope.schemaName, actorId }),
        [
          {
            userId: 'usr-11',
            legacyDisplayName: 'Persona Maria Sintetica',
            firstName: 'Persona Maria',
            lastName: 'Sintetica',
          },
          { userId: 'usr-12', legacyDisplayName: 'pdos', firstName: null, lastName: null },
        ],
      );
      expect(summary.nombresCorregidos).toBe(1);
      expect(provisioning.publishCreatedUsers).toHaveBeenCalledWith(tenantId, ['usr-11']);
      expect(logs.join(' ')).not.toContain('Persona Maria');
    });

    it('agrega como «sin datos» los números de lotes vigentes que la API no devolvió', async () => {
      staged = [
        stage('b-1', 'TICKET', { assignedUserId: 11, activity: [{ userId: 40 }, { userId: 41 }] }),
        stage('b-2', 'PAGO', { userId: 40 }),
        stage('b-2', 'PAGO', { userId: 'x' }),
        { batch_id: 'b-3', entity: 'PAGO', payload_encrypted: 'ilegible' },
      ];
      client.listAdmins.mockResolvedValue([{ id: 11, isActive: true }]);

      const summary = await service.fetch(scope, actorId);

      expect(sinDatos).toEqual([[tenantId, [40, 41]]]);
      expect(summary.sinDatos).toBe(2);
      expect(logs.join('\n')).toMatch(/1 intermedia\(s\) ilegible/u);
    });

    it('agrega como «sin datos» al personal eliminado que sigue en tickets, pagos y tareas', async () => {
      staged = [stage('b-1', 'PAGO', { userId: 40 })];
      existingSinDatos = [40];
      processLists = {
        '/crm/api/v1.0/ticketing/tickets': [
          { id: 1, assignedUserId: 11, activity: [{ userId: 60 }] },
        ],
        '/crm/api/v1.0/payments': [
          { id: 2, userId: 40 },
          { id: 3, userId: 61 },
        ],
        '/crm/api/v1.0/scheduling/jobs': [{ id: 4, assignedUserId: 62 }],
      };
      client.listAdmins.mockResolvedValue([{ id: 11, isActive: true }]);

      const summary = await service.fetch(scope, actorId);

      expect(client.listPage).toHaveBeenCalledWith(
        expect.objectContaining({ appKey: APP_KEY }),
        '/crm/api/v1.0/payments',
        500,
        0,
      );
      // 40 ya existía (se renueva, no cuenta como nuevo); 60, 61 y 62 vienen de los procesos.
      expect(sinDatos).toEqual([[tenantId, [40, 60, 61, 62]]]);
      expect(summary.sinDatos).toBe(3);
      expect(summary.procesos).toEqual({
        leidos: { TICKETS: 1, PAGOS: 2, TAREAS: 1 },
        eliminadosEnProcesos: 4,
        sinLeer: [],
        truncados: [],
      });
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({ lectura: 'USERS_ADMINS_Y_PROCESOS', sinDatos: 3 }),
        }),
        expect.anything(),
      );
    });

    it('si un proceso falla por red, el job se reintenta sin escribir', async () => {
      client.listAdmins.mockResolvedValue([{ id: 11, isActive: true }]);
      const transient = new UispApiError('UNREACHABLE', 'TIEMPO_AGOTADO', true);
      client.listPage.mockRejectedValue(transient);

      await expect(service.fetch(scope, actorId)).rejects.toBe(transient);
      expect(upserts).toEqual([]);
      expect(connections.recordCheck).toHaveBeenCalledWith(scope, 'UNREACHABLE', actorId);
    });

    it('una fila resuelta no se toca: la base no devuelve fila y se cuenta como intacta', async () => {
      client.listAdmins.mockResolvedValue([{ id: 11, isActive: true }]);
      const original = query.getMockImplementation()!;
      query.mockImplementation(async (sql: string, params: unknown[] = []) =>
        sql.includes('INSERT INTO migration_uisp_users') && !sql.includes("'SIN_DATOS'")
          ? []
          : original(sql, params),
      );

      const summary = await service.fetch(scope, actorId);

      expect(summary).toMatchObject({ api: 1, nuevos: 0, actualizados: 0, intactos: 1 });
      query.mockImplementation(original);
    });

    it('sin conexión el job falla de forma permanente', async () => {
      connections.load.mockResolvedValue(null);
      await expect(service.fetch(scope, actorId)).rejects.toEqual(
        new MigrationPermanentError('MIGRATION_SOURCE_NOT_CONFIGURED'),
      );
    });

    it('clave rechazada: registra UNAUTHORIZED y falla de forma permanente', async () => {
      client.listAdmins.mockRejectedValue(
        new UispApiError('UNAUTHORIZED', 'CREDENCIAL_RECHAZADA', false),
      );

      await expect(service.fetch(scope, actorId)).rejects.toEqual(
        new MigrationPermanentError('MIGRATION_SOURCE_UNAUTHORIZED'),
      );
      expect(connections.recordCheck).toHaveBeenCalledWith(scope, 'UNAUTHORIZED', actorId);
      expect(upserts).toHaveLength(0);
    });

    it('huella distinta: permanente; red caída: se propaga para reintentar', async () => {
      client.listAdmins.mockRejectedValueOnce(
        new UispApiError('UNREACHABLE', 'CERTIFICADO_NO_COINCIDE', false),
      );
      await expect(service.fetch(scope, actorId)).rejects.toEqual(
        new MigrationPermanentError('MIGRATION_SOURCE_UNREACHABLE'),
      );

      const transient = new UispApiError('UNREACHABLE', 'RED', true);
      client.listAdmins.mockRejectedValueOnce(transient);
      await expect(service.fetch(scope, actorId)).rejects.toBe(transient);
      expect(connections.recordCheck).toHaveBeenCalledWith(scope, 'UNREACHABLE', actorId);
    });

    describe('recordFetchFailure (fallo definitivo del job)', () => {
      it('un error inesperado se registra como UNREACHABLE para cerrar la espera del portal', async () => {
        await service.recordFetchFailure(scope, actorId, new Error('pool agotado'));
        expect(connections.recordCheck).toHaveBeenCalledWith(scope, 'UNREACHABLE', actorId);
      });

      it('los errores de UISP y los permanentes ya quedaron registrados: no repite', async () => {
        await service.recordFetchFailure(
          scope,
          actorId,
          new UispApiError('UNREACHABLE', 'RED', true),
        );
        await service.recordFetchFailure(
          scope,
          actorId,
          new MigrationPermanentError('MIGRATION_SOURCE_UNAUTHORIZED'),
        );
        expect(connections.recordCheck).not.toHaveBeenCalled();
      });

      it('sin conexión no hay dónde registrar: no escribe (la lista conserva su meta)', async () => {
        await service.recordFetchFailure(
          scope,
          actorId,
          new MigrationPermanentError('MIGRATION_SOURCE_NOT_CONFIGURED'),
        );
        expect(connections.recordCheck).not.toHaveBeenCalled();
      });
    });

    it('una respuesta que no es lista se registra como UNREACHABLE permanente', async () => {
      client.listAdmins.mockResolvedValue({ users: [] });
      await expect(service.fetch(scope, actorId)).rejects.toEqual(
        new MigrationPermanentError('MIGRATION_SOURCE_UNREACHABLE'),
      );
    });
  });

  describe('list', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: '69000000-0000-4000-8000-0000000000c1',
      uisp_user_id: 11,
      display_name_encrypted: crypto.encryptText(NAME),
      email_encrypted: crypto.encryptText(EMAIL),
      is_active_in_uisp: true,
      source: 'API',
      status: 'PENDIENTE',
      matched_user_id: matchedUserId,
      target_user_id: null,
      proposed_role: null,
      last_fetched_at: new Date('2026-11-15T10:00:00Z'),
      ...overrides,
    });

    it('descifra, cuenta lotes vigentes y muestra el correo completo a ADMIN', async () => {
      listRows = [
        row(),
        row({
          id: '69000000-0000-4000-8000-0000000000c2',
          uisp_user_id: 40,
          display_name_encrypted: null,
          email_encrypted: null,
          is_active_in_uisp: null,
          source: 'SIN_DATOS',
          matched_user_id: null,
          last_fetched_at: new Date('2026-11-15T11:00:00Z'),
        }),
      ];
      staged = [
        stage('b-1', 'TICKET', { assignedUserId: 40, activity: [{ userId: 11 }] }),
        stage('b-1', 'PAGO', { userId: 40 }),
        stage('b-2', 'PAGO', { userId: 40 }),
      ];

      const result = await service.list(scope, { id: actorId, role: UserRole.ADMIN });

      for (const item of result.data) MigrationUispUserSchema.parse(item);
      expect(result.data[0]).toMatchObject({
        uispUserId: 11,
        displayName: NAME,
        email: EMAIL,
        referencedInBatches: 1,
      });
      expect(result.data[1]).toMatchObject({
        uispUserId: 40,
        displayName: null,
        email: null,
        source: 'SIN_DATOS',
        referencedInBatches: 2,
      });
      expect(result.meta).toEqual({ total: 2, lastFetchedAt: '2026-11-15T11:00:00.000Z' });
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LIST_ACCESS,
          newValue: { filas: 2, correoCompleto: true },
        }),
        expect.anything(),
      );
      expect(JSON.stringify(audit.logWithin.mock.calls)).not.toContain(EMAIL);
    });

    it('enmascara el correo para quien no es ADMIN', async () => {
      listRows = [row()];
      const result = await service.list(scope, { id: actorId, role: UserRole.NOC });
      expect(result.data[0]!.email).toBe('p***@example.test');
    });

    it('la lista muestra el nombre completo de una fila guardada con nombre y apellido', async () => {
      listRows = [
        row({
          display_name_encrypted: crypto.encryptText(
            serializeUispStaffName({
              displayName: NAME,
              firstName: 'Persona',
              lastName: 'Sintetica Uno',
            }),
          ),
        }),
      ];
      const result = await service.list(scope, { id: actorId, role: UserRole.ADMIN });
      expect(result.data[0]!.displayName).toBe(NAME);
    });

    it('una columna ilegible vuelve null sin registrar su contenido', async () => {
      listRows = [row({ display_name_encrypted: 'ilegible' })];
      const result = await service.list(scope, { id: actorId, role: UserRole.ADMIN });
      expect(result.data[0]!.displayName).toBeNull();
      expect(logs.join('\n')).toMatch(/displayName ilegible/u);
    });

    it('sin filas no audita y devuelve meta vacía', async () => {
      const result = await service.list(scope, { id: actorId, role: UserRole.ADMIN });
      expect(result).toEqual({ data: [], meta: { total: 0, lastFetchedAt: null } });
      expect(audit.logWithin).not.toHaveBeenCalled();
    });
  });

  it('maskUispEmail', () => {
    expect(maskUispEmail('persona@dominio.co')).toBe('p***@dominio.co');
    expect(maskUispEmail('sin-arroba')).toBeNull();
    expect(maskUispEmail('@dominio.co')).toBeNull();
  });
});
