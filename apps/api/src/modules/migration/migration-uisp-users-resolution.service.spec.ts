import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  MigrationUispUserSchema,
  MigrationUispUsersInviteResultSchema,
  UserRole,
  type MigrationUispUserResolveItem,
} from '@iwana/shared';
import { MigrationCrypto } from './migration-crypto';
import { MigrationUispUsersResolutionService } from './migration-uisp-users-resolution.service';

const events: string[] = [];
jest.mock('@iwana/db', () => ({
  runInTenantSchema: async (_ds: unknown, _schema: string, fn: (runner: unknown) => unknown) => {
    events.push('BEGIN');
    try {
      const result = await fn(qr);
      events.push('COMMIT');
      return result;
    } catch (error) {
      events.push('ROLLBACK');
      throw error;
    }
  },
}));

const tenantId = '69100000-0000-4000-8000-000000000001';
const actorId = '69100000-0000-4000-8000-000000000002';
const scope = { tenantId, schemaName: 'tenant_uisp_resolution_unit' };
const ROW_ACTIVE = '69100000-0000-4000-8000-0000000000a1';
const ROW_INACTIVE = '69100000-0000-4000-8000-0000000000a2';
const ROW_MATCHED = '69100000-0000-4000-8000-0000000000a3';
const ROW_SIN_DATOS = '69100000-0000-4000-8000-0000000000a4';
const ROW_RESOLVED = '69100000-0000-4000-8000-0000000000a5';
const MATCHED_USER = '69100000-0000-4000-8000-0000000000b1';
const NEW_USER = '69100000-0000-4000-8000-0000000000b2';
const EMAIL_ACTIVE = 'activo.sintetico@example.test';
const EMAIL_INACTIVE = 'inactivo.sintetico@example.test';
const EMAIL_MATCHED = 'coincide.sintetico@example.test';

interface FakeRow {
  id: string;
  uisp_user_id: number;
  display_name_encrypted: string | null;
  email_encrypted: string | null;
  email_hash: string | null;
  is_active_in_uisp: boolean | null;
  source: 'API' | 'SIN_DATOS';
  status: string;
  matched_user_id: string | null;
  target_user_id: string | null;
  proposed_role: string | null;
}

const config = new ConfigService({
  PII_ENCRYPTION_KEY: '3a'.repeat(32),
  MFA_ENCRYPTION_KEY: '5b'.repeat(32),
  PII_HASH_KEY: '7d'.repeat(32),
  NODE_ENV: 'test',
});
const crypto = new MigrationCrypto(config);

let table: Map<string, FakeRow>;
let mappings: Array<{ externalValue: string; targetRef: string; label: unknown }>;

function apiRow(id: string, uisp: number, name: string, email: string, active: boolean): FakeRow {
  return {
    id,
    uisp_user_id: uisp,
    display_name_encrypted: crypto.encryptText(name),
    email_encrypted: crypto.encryptText(email),
    email_hash: crypto.emailHmac(email),
    is_active_in_uisp: active,
    source: 'API',
    status: 'PENDIENTE',
    matched_user_id: null,
    target_user_id: null,
    proposed_role: null,
  };
}

const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  if (sql.includes('FROM migration_uisp_users') && sql.includes('FOR UPDATE')) {
    return (params[1] as string[]).flatMap((id) => (table.has(id) ? [{ ...table.get(id)! }] : []));
  }
  if (sql.includes("status = 'CREADO'")) {
    return (params[1] as string[]).flatMap((id) => {
      const row = table.get(id);
      return row && row.status === 'CREADO'
        ? [{ id: row.id, target_user_id: row.target_user_id }]
        : [];
    });
  }
  if (sql.trimStart().startsWith('INSERT INTO migration_mappings')) {
    expect(sql).toContain('NULL');
    mappings.push({
      externalValue: params[1] as string,
      targetRef: params[2] as string,
      label: null,
    });
    return [{ id: `map-${mappings.length}`, inserted: true }];
  }
  if (sql.trimStart().startsWith('UPDATE migration_uisp_users')) {
    const row = table.get(params[1] as string)!;
    Object.assign(row, {
      status: params[2],
      target_user_id: params[3],
      proposed_role: params[4],
      display_name_encrypted: null,
      email_encrypted: null,
      email_hash: null,
    });
    return [];
  }
  if (sql.includes('FROM migration_uisp_users')) {
    return (params[1] as string[]).flatMap((id) => (table.has(id) ? [{ ...table.get(id)! }] : []));
  }
  return [];
});
const qr = { query, manager: { query } };

describe('MigrationUispUsersResolutionService', () => {
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const reviewRows = {
    stagedReferences: jest.fn().mockResolvedValue(new Map([[41, new Set(['lote-1'])]])),
  };
  const directory = { existingUserIds: jest.fn() };
  const dispatch = jest.fn(() => events.push('DISPATCH'));
  const provisioning = {
    createImportedUser: jest.fn(),
    prepareInvitations: jest.fn(),
    publishCreatedUsers: jest.fn(),
  };
  const service = new MigrationUispUsersResolutionService(
    {} as never,
    crypto,
    audit as never,
    reviewRows as never,
    directory as never,
    provisioning as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    events.length = 0;
    mappings = [];
    const matched = apiRow(ROW_MATCHED, 43, 'Coincide Sintetico', EMAIL_MATCHED, true);
    matched.matched_user_id = MATCHED_USER;
    table = new Map<string, FakeRow>([
      [ROW_ACTIVE, apiRow(ROW_ACTIVE, 41, 'Ana Maria Sintetica', EMAIL_ACTIVE, true)],
      [ROW_INACTIVE, apiRow(ROW_INACTIVE, 42, 'Inactivo Sintetico', EMAIL_INACTIVE, false)],
      [ROW_MATCHED, matched],
      [
        ROW_SIN_DATOS,
        {
          id: ROW_SIN_DATOS,
          uisp_user_id: 44,
          display_name_encrypted: null,
          email_encrypted: null,
          email_hash: null,
          is_active_in_uisp: null,
          source: 'SIN_DATOS',
          status: 'PENDIENTE',
          matched_user_id: null,
          target_user_id: null,
          proposed_role: null,
        },
      ],
      [
        ROW_RESOLVED,
        {
          ...apiRow(ROW_RESOLVED, 45, 'x', 'x@example.test', true),
          display_name_encrypted: null,
          email_encrypted: null,
          email_hash: null,
          status: 'DESCARTADO',
        },
      ],
    ]);
    directory.existingUserIds.mockImplementation(
      async (_ctx: unknown, ids: string[]) => new Set(ids.filter((id) => id === MATCHED_USER)),
    );
    provisioning.createImportedUser.mockImplementation(async () => ({
      userId: NEW_USER,
      status: 'PENDING_VERIFICATION',
      isOperationalResource: true,
      placeholderEmail: false,
    }));
  });

  afterEach(() => jest.restoreAllMocks());

  const resolve = (items: MigrationUispUserResolveItem[]) => service.resolve(scope, items, actorId);

  describe('resolver', () => {
    it('ENLAZAR crea la equivalencia USUARIO sin etiqueta, purga la PII y no crea usuario', async () => {
      const [row] = await resolve([{ id: ROW_MATCHED, action: 'ENLAZAR' }]);

      expect(MigrationUispUserSchema.parse(row)).toMatchObject({
        status: 'ENLAZADO',
        targetUserId: MATCHED_USER,
        displayName: null,
        email: null,
      });
      expect(mappings).toEqual([{ externalValue: '43', targetRef: MATCHED_USER, label: null }]);
      expect(table.get(ROW_MATCHED)).toMatchObject({
        display_name_encrypted: null,
        email_encrypted: null,
        email_hash: null,
      });
      expect(provisioning.createImportedUser).not.toHaveBeenCalled();
    });

    it('ENLAZAR sin coincidencia responde 422 y no escribe nada', async () => {
      const error = await resolve([{ id: ROW_ACTIVE, action: 'ENLAZAR' }]).catch((e) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.getResponse()).toMatchObject({
        code: 'MIGRATION_MAPPING_TARGET_INVALID',
        details: { reason: 'SIN_COINCIDENCIA' },
      });
      expect(error.getResponse().message).not.toMatch(/destino/i);
      expect(events).toEqual(['BEGIN', 'ROLLBACK']);
      expect(mappings).toHaveLength(0);
    });

    it('ENLAZAR a un usuario que ya no existe responde 422', async () => {
      directory.existingUserIds.mockResolvedValue(new Set());
      const error = await resolve([{ id: ROW_MATCHED, action: 'ENLAZAR' }]).catch((e) => e);
      expect(error.getResponse()).toMatchObject({
        code: 'MIGRATION_MAPPING_TARGET_INVALID',
        details: { reason: 'SIN_COINCIDENCIA' },
      });
      expect(error.getResponse().message).not.toMatch(/destino/i);
    });

    it('CREAR con un activo pasa nombre y correo descifrados al puerto de Usuarios', async () => {
      const [row] = await resolve([{ id: ROW_ACTIVE, action: 'CREAR', role: UserRole.TECHNICIAN }]);

      expect(provisioning.createImportedUser).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId, schemaName: scope.schemaName, actorId }),
        {
          uispUserId: 41,
          role: UserRole.TECHNICIAN,
          displayName: 'Ana Maria Sintetica',
          email: EMAIL_ACTIVE,
          activeInUisp: true,
        },
      );
      expect(row).toMatchObject({
        status: 'CREADO',
        targetUserId: NEW_USER,
        proposedRole: UserRole.TECHNICIAN,
        displayName: null,
        email: null,
        referencedInBatches: 1,
      });
      expect(mappings).toEqual([{ externalValue: '41', targetRef: NEW_USER, label: null }]);
      expect(provisioning.publishCreatedUsers).toHaveBeenCalledWith(tenantId, [NEW_USER]);
    });

    it('CREAR con un inactivo lo marca inactivo en UISP y pasa el recurso operativo elegido', async () => {
      await resolve([
        {
          id: ROW_INACTIVE,
          action: 'CREAR',
          role: UserRole.SUPPORT,
          isOperationalResource: true,
        },
      ]);
      expect(provisioning.createImportedUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ activeInUisp: false, isOperationalResource: true }),
      );
    });

    it('CREAR una fila SIN_DATOS exige el nombre y la trata como inactiva', async () => {
      const error = await resolve([
        { id: ROW_SIN_DATOS, action: 'CREAR', role: UserRole.SUPPORT },
      ]).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { field: 'displayName' },
      });

      await resolve([
        { id: ROW_SIN_DATOS, action: 'CREAR', role: UserRole.SUPPORT, displayName: 'Persona X' },
      ]);
      expect(provisioning.createImportedUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ displayName: 'Persona X', email: null, activeInUisp: false }),
      );
    });

    it('rechaza escribir el nombre de una fila que vino de la API', async () => {
      const error = await resolve([
        { id: ROW_ACTIVE, action: 'CREAR', role: UserRole.SUPPORT, displayName: 'Otro' },
      ]).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(provisioning.createImportedUser).not.toHaveBeenCalled();
    });

    it.each([UserRole.SUBSCRIBER, UserRole.PARTNER, UserRole.INVESTOR])(
      'CREAR con rol %s responde 422 MIGRATION_USER_ROLE_NOT_ALLOWED',
      async (role) => {
        const error = await resolve([{ id: ROW_ACTIVE, action: 'CREAR', role }]).catch((e) => e);
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect(error.getResponse()).toMatchObject({ code: 'MIGRATION_USER_ROLE_NOT_ALLOWED' });
        expect(provisioning.createImportedUser).not.toHaveBeenCalled();
      },
    );

    it('DESCARTAR purga la PII y no crea equivalencia', async () => {
      const [row] = await resolve([{ id: ROW_ACTIVE, action: 'DESCARTAR' }]);
      expect(row).toMatchObject({ status: 'DESCARTADO', targetUserId: null });
      expect(mappings).toHaveLength(0);
      expect(table.get(ROW_ACTIVE)?.email_encrypted).toBeNull();
    });

    it('una fila inexistente responde 404 y una ya resuelta 409, ambas sin aplicar nada', async () => {
      const missing = '69100000-0000-4000-8000-0000000000ff';
      const notFound = await resolve([
        { id: ROW_ACTIVE, action: 'DESCARTAR' },
        { id: missing, action: 'DESCARTAR' },
      ]).catch((e) => e);
      expect(notFound).toBeInstanceOf(NotFoundException);
      expect(notFound.getResponse()).toMatchObject({
        code: 'MIGRATION_UISP_USER_NOT_FOUND',
        details: { ids: [missing] },
      });

      const resolved = await resolve([
        { id: ROW_ACTIVE, action: 'DESCARTAR' },
        { id: ROW_RESOLVED, action: 'DESCARTAR' },
      ]).catch((e) => e);
      expect(resolved).toBeInstanceOf(ConflictException);
      expect(resolved.getResponse()).toMatchObject({
        code: 'MIGRATION_UISP_USER_ALREADY_RESOLVED',
        details: { ids: [ROW_RESOLVED] },
      });
      expect(table.get(ROW_ACTIVE)?.status).toBe('PENDIENTE');
    });

    it('repetir sobre una fila recién resuelta responde 409 (idempotencia por estado)', async () => {
      await resolve([{ id: ROW_ACTIVE, action: 'DESCARTAR' }]);
      await expect(resolve([{ id: ROW_ACTIVE, action: 'DESCARTAR' }])).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('todo o nada: un rol no permitido al final revierte el lote sin crear usuarios', async () => {
      const error = await resolve([
        { id: ROW_MATCHED, action: 'ENLAZAR' },
        { id: ROW_ACTIVE, action: 'CREAR', role: UserRole.SUBSCRIBER },
      ]).catch((e) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(mappings).toHaveLength(0);
      expect(events).toEqual(['BEGIN', 'ROLLBACK']);
      expect(provisioning.publishCreatedUsers).not.toHaveBeenCalled();
    });

    it('la auditoría lleva ids, número de UISP y rol, nunca nombre ni correo', async () => {
      const result = await resolve([
        { id: ROW_ACTIVE, action: 'CREAR', role: UserRole.SUPPORT },
        { id: ROW_MATCHED, action: 'ENLAZAR' },
        { id: ROW_INACTIVE, action: 'DESCARTAR' },
      ]);

      const audited = JSON.stringify(audit.logWithin.mock.calls.map(([entry]) => entry));
      const answered = JSON.stringify(result);
      for (const pii of [
        EMAIL_ACTIVE,
        EMAIL_INACTIVE,
        EMAIL_MATCHED,
        'Ana Maria',
        'Inactivo Sintetico',
        'Coincide Sintetico',
      ]) {
        expect(audited).not.toContain(pii);
        expect(answered).not.toContain(pii);
      }
      const rowEntries = audit.logWithin.mock.calls
        .map(([entry]) => entry)
        .filter((entry) => entry.entityType === 'MigrationUispUsers');
      expect(rowEntries).toHaveLength(3);
      expect(rowEntries[0]).toMatchObject({
        action: AuditAction.UPDATE,
        newValue: { accion: 'CREAR', uispUserId: 41, status: 'CREADO' },
      });
      expect(
        audit.logWithin.mock.calls.filter(([entry]) => entry.entityType === 'MigrationMapping'),
      ).toHaveLength(2);
    });
  });

  describe('invitar', () => {
    beforeEach(() => {
      Object.assign(table.get(ROW_ACTIVE)!, { status: 'CREADO', target_user_id: NEW_USER });
      Object.assign(table.get(ROW_MATCHED)!, { status: 'ENLAZADO', target_user_id: MATCHED_USER });
      provisioning.prepareInvitations.mockResolvedValue({ invited: [NEW_USER], dispatch });
    });

    it('solo pide invitar a usuarios de filas CREADO y envía tras el COMMIT', async () => {
      const result = await service.invite(scope, [ROW_ACTIVE, ROW_MATCHED, ROW_SIN_DATOS], actorId);

      expect(MigrationUispUsersInviteResultSchema.parse(result)).toEqual({
        invitados: 1,
        omitidos: 2,
      });
      expect(provisioning.prepareInvitations).toHaveBeenCalledWith(expect.anything(), [NEW_USER]);
      expect(events).toEqual(['BEGIN', 'COMMIT', 'DISPATCH']);
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'MigrationUispUsers',
          newValue: { accion: 'INVITAR', invitados: 1, omitidos: 2, filas: [ROW_ACTIVE] },
        }),
        expect.anything(),
      );
    });

    it('pasa a Usuarios el slug del tenant para el enlace de la invitación', async () => {
      await service.invite({ ...scope, tenantSlug: 'empresa-demo' }, [ROW_ACTIVE], actorId);
      expect(provisioning.prepareInvitations).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: scope.tenantId, tenantSlug: 'empresa-demo' }),
        [NEW_USER],
      );
    });

    it('cuenta como omitido al usuario que Usuarios no considera elegible', async () => {
      provisioning.prepareInvitations.mockResolvedValue({ invited: [], dispatch });
      await expect(service.invite(scope, [ROW_ACTIVE], actorId)).resolves.toEqual({
        invitados: 0,
        omitidos: 1,
      });
    });

    it('si la transacción falla no envía ningún correo', async () => {
      audit.logWithin.mockRejectedValueOnce(new Error('fallo de auditoría'));
      await expect(service.invite(scope, [ROW_ACTIVE], actorId)).rejects.toThrow();
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
