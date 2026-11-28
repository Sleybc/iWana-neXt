import { UserRole } from '../../enums/user-role.enum';
import {
  MIGRATION_ERROR_CODES,
  MIGRATION_MAPPING_KINDS,
  MIGRATION_MAPPING_TARGET_FORMAT,
  MIGRATION_OBSERVATIONS,
  MigrationBatchCountsSchema,
  MigrationMappingCreateSchema,
  migrationMappingTargetError,
} from './migration-import.contract';
import {
  MIGRATION_IMPORTABLE_USER_ROLES,
  MIGRATION_SOURCE_CHECK_RESULTS,
  MIGRATION_UISP_USER_ACTIONS,
  MIGRATION_UISP_USER_SOURCES,
  MIGRATION_UISP_USER_STATUSES,
  MigrationAuthorsRefreshResultSchema,
  MigrationSourceConnectionSchema,
  MigrationSourceConnectionUpsertSchema,
  MigrationUispUserSchema,
  MigrationUispUsersInviteResultSchema,
  MigrationUispUsersInviteSchema,
  MigrationUispUsersReopenResultSchema,
  MigrationUispUsersReopenSchema,
  MigrationUispUsersResolveSchema,
  isMigrationImportableUserRole,
  MIGRATION_IMPORT_FETCH_UISP_USERS_JOB,
  MigrationFetchUispUsersJobSchema,
  MigrationUispUsersFetchAcceptedSchema,
  MigrationUispUsersListMetaSchema,
} from './migration-uisp-users.contract';

const uuid = '69000000-0000-4000-8000-000000000011';
const uuid2 = '69000000-0000-4000-8000-000000000012';
const sha = 'ab'.repeat(32);

describe('Contrato de usuarios de UISP (spec 2026-11-15 usuarios, ADR-110 D15)', () => {
  describe('equivalencia USUARIO', () => {
    it('es un tipo nuevo con destino uuid y solo admite EQUIVALE', () => {
      expect(MIGRATION_MAPPING_KINDS).toContain('USUARIO');
      expect(MIGRATION_MAPPING_KINDS).toContain('TITULAR');
      expect(MIGRATION_MAPPING_TARGET_FORMAT.USUARIO.test(uuid)).toBe(true);
      expect(migrationMappingTargetError('USUARIO', 'EQUIVALE', uuid)).toBeNull();
      expect(migrationMappingTargetError('USUARIO', 'EQUIVALE', '1234')).toBe(
        'MIGRATION_MAPPING_TARGET_INVALID',
      );
      expect(migrationMappingTargetError('USUARIO', 'DESCARTAR', null)).toBe(
        'MIGRATION_MAPPING_TARGET_INVALID',
      );
      expect(migrationMappingTargetError('USUARIO', 'NOTA', null)).toBe(
        'MIGRATION_MAPPING_TARGET_INVALID',
      );
      expect(
        MigrationMappingCreateSchema.safeParse({
          kind: 'USUARIO',
          externalValue: '1234',
          action: 'EQUIVALE',
          targetRef: uuid,
        }).success,
      ).toBe(true);
    });
  });

  describe('observación y códigos de error', () => {
    it('añade la observación y los seis códigos', () => {
      expect(MIGRATION_OBSERVATIONS).toContain('USUARIO_UISP_SIN_ENLAZAR');
      expect(MIGRATION_ERROR_CODES).toEqual(
        expect.arrayContaining([
          'MIGRATION_SOURCE_UNREACHABLE',
          'MIGRATION_SOURCE_UNAUTHORIZED',
          'MIGRATION_SOURCE_NOT_CONFIGURED',
          'MIGRATION_USER_ROLE_NOT_ALLOWED',
          'MIGRATION_UISP_USER_NOT_FOUND',
          'MIGRATION_UISP_USER_ALREADY_RESOLVED',
        ]),
      );
    });

    it('counts acepta el conteo nuevo y los counts previos siguen válidos', () => {
      const base = {
        procesamiento: 'COMPLETADO',
        archivos: { recibidos: 1, leidos: 1, rechazados: {} },
        entidades: {},
        observaciones: { YA_IMPORTADO: 1 },
        tareasSinFuente: 0,
        pendientesEquivalencia: [],
        procesadoEn: null,
      };
      expect(MigrationBatchCountsSchema.safeParse(base).success).toBe(true);
      const withUsers = { ...base, observaciones: { USUARIO_UISP_SIN_ENLAZAR: 4 } };
      expect(MigrationBatchCountsSchema.safeParse(withUsers).success).toBe(true);
      expect(
        MigrationBatchCountsSchema.safeParse({
          ...base,
          observaciones: { USUARIO_UISP_SIN_ENLAZAR: -1 },
        }).success,
      ).toBe(false);
    });
  });

  describe('conexión con UISP', () => {
    const upsert = { baseUrl: 'https://uisp.example.test', appKey: 'k'.repeat(64) };

    it('acepta https, clave 1..200 y huella hex de 64 opcional (normalizada a minúsculas)', () => {
      expect(MigrationSourceConnectionUpsertSchema.parse(upsert)).toEqual(upsert);
      const pinned = MigrationSourceConnectionUpsertSchema.parse({
        ...upsert,
        trustedCertificateSha256: sha.toUpperCase(),
      });
      expect(pinned.trustedCertificateSha256).toBe(sha);
    });

    it.each([
      ['http', { ...upsert, baseUrl: 'http://uisp.example.test' }],
      ['no es URL', { ...upsert, baseUrl: 'uisp.example.test' }],
      ['con credenciales', { ...upsert, baseUrl: 'https://u:p@uisp.example.test' }],
      ['clave vacía', { ...upsert, appKey: '' }],
      ['clave larga', { ...upsert, appKey: 'k'.repeat(201) }],
      ['clave con control', { ...upsert, appKey: 'abc\ndef' }],
      ['huella corta', { ...upsert, trustedCertificateSha256: 'ab'.repeat(31) }],
      ['huella no hex', { ...upsert, trustedCertificateSha256: 'zz'.repeat(32) }],
      ['campo extra', { ...upsert, verifyTls: false }],
    ])('rechaza %s', (_name, input) => {
      expect(MigrationSourceConnectionUpsertSchema.safeParse(input).success).toBe(false);
    });

    it('la respuesta nunca transporta la clave', () => {
      const response = {
        baseUrl: 'https://uisp.example.test',
        hasAppKey: true,
        trustedCertificateSha256: null,
        lastCheckedAt: null,
        lastCheckResult: null,
        updatedAt: '2026-11-15T12:00:00.000Z',
      };
      expect(MigrationSourceConnectionSchema.safeParse(response).success).toBe(true);
      expect(
        MigrationSourceConnectionSchema.safeParse({ ...response, appKey: 'secreta' }).success,
      ).toBe(false);
      expect(
        MigrationSourceConnectionSchema.safeParse({ ...response, hasAppKey: false }).success,
      ).toBe(false);
      for (const result of MIGRATION_SOURCE_CHECK_RESULTS) {
        expect(
          MigrationSourceConnectionSchema.safeParse({
            ...response,
            lastCheckedAt: '2026-11-15T12:00:00.000Z',
            lastCheckResult: result,
          }).success,
        ).toBe(true);
      }
      expect(MIGRATION_SOURCE_CHECK_RESULTS).toEqual(['OK', 'UNREACHABLE', 'UNAUTHORIZED']);
    });
  });

  describe('fila de revisión', () => {
    const row = {
      id: uuid,
      uispUserId: 1234,
      displayName: 'Persona sintética',
      email: 'p***@example.test',
      isActiveInUisp: true,
      source: 'API',
      status: 'PENDIENTE',
      matchedUserId: null,
      targetUserId: null,
      proposedRole: null,
      referencedInBatches: 2,
    };

    it('acepta la fila y sus dominios cerrados', () => {
      expect(MigrationUispUserSchema.safeParse(row).success).toBe(true);
      expect(MIGRATION_UISP_USER_SOURCES).toEqual(['API', 'SIN_DATOS']);
      expect(MIGRATION_UISP_USER_STATUSES).toEqual([
        'PENDIENTE',
        'ENLAZADO',
        'CREADO',
        'DESCARTADO',
      ]);
      expect(
        MigrationUispUserSchema.safeParse({
          ...row,
          source: 'SIN_DATOS',
          displayName: null,
          email: null,
          isActiveInUisp: null,
          status: 'CREADO',
          targetUserId: uuid2,
          proposedRole: UserRole.TECHNICIAN,
        }).success,
      ).toBe(true);
    });

    it.each([
      ['número no entero', { uispUserId: 1.5 }],
      ['número no positivo', { uispUserId: 0 }],
      ['estado desconocido', { status: 'OTRO' }],
      ['rol desconocido', { proposedRole: 'ROOT' }],
      ['conteo negativo', { referencedInBatches: -1 }],
      ['campo extra', { emailHash: 'x' }],
    ])('rechaza %s', (_name, patch) => {
      expect(MigrationUispUserSchema.safeParse({ ...row, ...patch }).success).toBe(false);
    });
  });

  describe('roles importables', () => {
    it('excluye SUBSCRIBER, PARTNER e INVESTOR y conserva los demás', () => {
      expect(MIGRATION_IMPORTABLE_USER_ROLES).not.toContain(UserRole.SUBSCRIBER);
      expect(MIGRATION_IMPORTABLE_USER_ROLES).not.toContain(UserRole.PARTNER);
      expect(MIGRATION_IMPORTABLE_USER_ROLES).not.toContain(UserRole.INVESTOR);
      expect([...MIGRATION_IMPORTABLE_USER_ROLES].sort()).toEqual(
        Object.values(UserRole)
          .filter(
            (role) =>
              role !== UserRole.SUBSCRIBER &&
              role !== UserRole.PARTNER &&
              role !== UserRole.INVESTOR,
          )
          .sort(),
      );
      expect(isMigrationImportableUserRole(UserRole.TECHNICIAN)).toBe(true);
      expect(isMigrationImportableUserRole(UserRole.SUBSCRIBER)).toBe(false);
    });
  });

  describe('acciones en lote', () => {
    it('acepta enlazar, crear con rol y descartar', () => {
      expect(MIGRATION_UISP_USER_ACTIONS).toEqual(['ENLAZAR', 'CREAR', 'DESCARTAR']);
      const parsed = MigrationUispUsersResolveSchema.safeParse({
        items: [
          { id: uuid, action: 'ENLAZAR' },
          {
            id: uuid2,
            action: 'CREAR',
            role: UserRole.TECHNICIAN,
            displayName: '  Técnico sin datos ',
            isOperationalResource: true,
          },
        ],
      });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.items[1]?.displayName).toBe('Técnico sin datos');
    });

    it('targetUserId (usuario elegido a mano) solo se admite con ENLAZAR', () => {
      expect(
        MigrationUispUsersResolveSchema.safeParse({
          items: [{ id: uuid, action: 'ENLAZAR', targetUserId: uuid2 }],
        }).success,
      ).toBe(true);
      for (const item of [
        { id: uuid, action: 'DESCARTAR', targetUserId: uuid2 },
        { id: uuid, action: 'CREAR', role: UserRole.NOC, targetUserId: uuid2 },
        { id: uuid, action: 'ENLAZAR', targetUserId: 'no-uuid' },
      ]) {
        const parsed = MigrationUispUsersResolveSchema.safeParse({ items: [item] });
        expect(parsed.success).toBe(false);
      }
      const misplaced = MigrationUispUsersResolveSchema.safeParse({
        items: [{ id: uuid, action: 'DESCARTAR', targetUserId: uuid2 }],
      });
      expect(misplaced.success === false && misplaced.error.issues[0]?.path).toEqual([
        'items',
        0,
        'targetUserId',
      ]);
    });

    it('un rol no importable pasa el contrato y lo rechaza la API con su código', () => {
      expect(
        MigrationUispUsersResolveSchema.safeParse({
          items: [{ id: uuid, action: 'CREAR', role: UserRole.SUBSCRIBER }],
        }).success,
      ).toBe(true);
    });

    it.each([
      ['lista vacía', { items: [] }],
      [
        'más de 100',
        {
          items: Array.from({ length: 101 }, (_, i) => ({
            id: `69000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
            action: 'DESCARTAR',
          })),
        },
      ],
      ['crear sin rol', { items: [{ id: uuid, action: 'CREAR' }] }],
      [
        'rol fuera de crear',
        { items: [{ id: uuid, action: 'ENLAZAR', role: UserRole.TECHNICIAN }] },
      ],
      ['nombre fuera de crear', { items: [{ id: uuid, action: 'DESCARTAR', displayName: 'x' }] }],
      [
        'recurso operativo fuera de crear',
        { items: [{ id: uuid, action: 'ENLAZAR', isOperationalResource: false }] },
      ],
      [
        'nombre con control',
        { items: [{ id: uuid, action: 'CREAR', role: UserRole.NOC, displayName: 'a\u0007b' }] },
      ],
      [
        'id repetido',
        {
          items: [
            { id: uuid, action: 'ENLAZAR' },
            { id: uuid, action: 'DESCARTAR' },
          ],
        },
      ],
      ['acción desconocida', { items: [{ id: uuid, action: 'BORRAR' }] }],
      ['id no uuid', { items: [{ id: '12', action: 'ENLAZAR' }] }],
    ])('rechaza %s', (_name, input) => {
      expect(MigrationUispUsersResolveSchema.safeParse(input).success).toBe(false);
    });

    it('invitar exige 1..100 uuid distintos', () => {
      expect(MigrationUispUsersInviteSchema.safeParse({ ids: [uuid, uuid2] }).success).toBe(true);
      for (const ids of [[], [uuid, uuid], ['x'], Array.from({ length: 101 }, () => uuid)]) {
        expect(MigrationUispUsersInviteSchema.safeParse({ ids }).success).toBe(false);
      }
    });

    it('recuperar exige 1..100 uuid distintos y devuelve solo conteos', () => {
      expect(MigrationUispUsersReopenSchema.safeParse({ ids: [uuid, uuid2] }).success).toBe(true);
      for (const ids of [[], [uuid, uuid], ['x'], Array.from({ length: 101 }, () => uuid)]) {
        expect(MigrationUispUsersReopenSchema.safeParse({ ids }).success).toBe(false);
      }
      const result = { recuperados: 2, omitidos: 1 };
      expect(MigrationUispUsersReopenResultSchema.parse(result)).toEqual(result);
      expect(
        MigrationUispUsersReopenResultSchema.safeParse({ ...result, nombres: ['x'] }).success,
      ).toBe(false);
    });
  });

  describe('«Actualizar autores»', () => {
    it('devuelve solo conteos', () => {
      const result = { tickets: 3, comentarios: 10, pagos: 2, respetados: 1, sinEnlazar: 4 };
      expect(MigrationAuthorsRefreshResultSchema.parse(result)).toEqual(result);
      expect(
        MigrationAuthorsRefreshResultSchema.safeParse({ ...result, tickets: -1 }).success,
      ).toBe(false);
      expect(
        MigrationAuthorsRefreshResultSchema.safeParse({ ...result, nombres: ['x'] }).success,
      ).toBe(false);
    });
  });
});

describe('Contrato de usuarios de UISP — adiciones del bloque B', () => {
  it('el job de lectura solo lleva identificadores', () => {
    const job = { version: 1, tenantId: uuid, actorId: uuid2 };
    expect(MigrationFetchUispUsersJobSchema.parse(job)).toEqual(job);
    expect(MigrationFetchUispUsersJobSchema.safeParse({ ...job, appKey: 'secreta' }).success).toBe(
      false,
    );
    expect(MIGRATION_IMPORT_FETCH_UISP_USERS_JOB).toBe('fetch-uisp-users');
  });

  it('la respuesta 202 y la meta de la lista son estrictas', () => {
    const accepted = { status: 'EN_CURSO', requestedAt: '2026-11-15T10:00:00.000Z' };
    expect(MigrationUispUsersFetchAcceptedSchema.parse(accepted)).toEqual(accepted);
    expect(
      MigrationUispUsersFetchAcceptedSchema.safeParse({ ...accepted, status: 'OK' }).success,
    ).toBe(false);
    expect(MigrationUispUsersListMetaSchema.parse({ total: 0, lastFetchedAt: null })).toEqual({
      total: 0,
      lastFetchedAt: null,
    });
    expect(
      MigrationUispUsersListMetaSchema.safeParse({ total: -1, lastFetchedAt: null }).success,
    ).toBe(false);
  });
  describe('resultado de invitar (bloque C)', () => {
    it('solo admite conteos enteros no negativos y nada más', () => {
      expect(MigrationUispUsersInviteResultSchema.parse({ invitados: 2, omitidos: 0 })).toEqual({
        invitados: 2,
        omitidos: 0,
      });
      expect(
        MigrationUispUsersInviteResultSchema.safeParse({ invitados: -1, omitidos: 0 }).success,
      ).toBe(false);
      expect(
        MigrationUispUsersInviteResultSchema.safeParse({ invitados: 1, omitidos: 0, email: 'x' })
          .success,
      ).toBe(false);
    });
  });
});
