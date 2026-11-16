import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  MIGRATION_IMPORTABLE_USER_ROLES,
  MIGRATION_SOURCE_CHECK_RESULTS,
  MIGRATION_UISP_USER_ACTIONS,
  MIGRATION_UISP_USER_SOURCES,
  MIGRATION_UISP_USER_STATUSES,
  UserRole,
} from '@iwana/shared';

/**
 * OpenAPI de la conexión con UISP y de la lista de usuarios (ADR-110 D15), derivado del contrato
 * `migration-uisp-users.contract.ts`. La clave de aplicación solo aparece en el cuerpo del PUT.
 */
const sha256: SchemaObject = { type: 'string', pattern: '^[0-9a-f]{64}$' };

export const MIGRATION_SOURCE_CONNECTION_UPSERT_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['baseUrl', 'appKey'],
  additionalProperties: false,
  properties: {
    baseUrl: {
      type: 'string',
      format: 'uri',
      maxLength: 500,
      description: 'Dirección https de UISP, sin credenciales.',
    },
    appKey: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      writeOnly: true,
      description: 'Clave de aplicación de solo lectura de UISP. Nunca se devuelve.',
    },
    trustedCertificateSha256: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{64}$',
      description:
        '«Confiar en este certificado»: huella SHA-256 del certificado de UISP. Sin ella se exige un certificado de confianza.',
    },
  },
};

export const MIGRATION_SOURCE_CONNECTION_OPENAPI: SchemaObject = {
  type: 'object',
  required: [
    'baseUrl',
    'hasAppKey',
    'trustedCertificateSha256',
    'lastCheckedAt',
    'lastCheckResult',
    'updatedAt',
  ],
  additionalProperties: false,
  properties: {
    baseUrl: { type: 'string' },
    hasAppKey: { type: 'boolean', enum: [true] },
    trustedCertificateSha256: { ...sha256, nullable: true },
    lastCheckedAt: { type: 'string', format: 'date-time', nullable: true },
    lastCheckResult: {
      type: 'string',
      enum: [...MIGRATION_SOURCE_CHECK_RESULTS, null],
      nullable: true,
      description:
        'Resultado de la última llamada a UISP (prueba o lectura de usuarios). La lectura en segundo plano lo registra también cuando falla de forma definitiva, para que el portal deje de esperar.',
    },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const MIGRATION_UISP_USERS_FETCH_ACCEPTED_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['status', 'requestedAt'],
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['EN_CURSO'] },
    requestedAt: { type: 'string', format: 'date-time' },
  },
};

export const MIGRATION_UISP_USER_OPENAPI: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'uispUserId',
    'displayName',
    'email',
    'isActiveInUisp',
    'source',
    'status',
    'matchedUserId',
    'targetUserId',
    'proposedRole',
    'referencedInBatches',
  ],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    uispUserId: { type: 'integer', minimum: 1 },
    displayName: { type: 'string', nullable: true },
    email: {
      type: 'string',
      nullable: true,
      description: 'Completo para ADMIN; enmascarado (p***@dominio) para otros.',
    },
    isActiveInUisp: { type: 'boolean', nullable: true },
    source: { type: 'string', enum: [...MIGRATION_UISP_USER_SOURCES] },
    status: { type: 'string', enum: [...MIGRATION_UISP_USER_STATUSES] },
    matchedUserId: { type: 'string', format: 'uuid', nullable: true },
    targetUserId: { type: 'string', format: 'uuid', nullable: true },
    proposedRole: { type: 'string', enum: [...Object.values(UserRole), null], nullable: true },
    referencedInBatches: { type: 'integer', minimum: 0 },
  },
};

export const MIGRATION_UISP_USERS_LIST_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: MIGRATION_UISP_USER_OPENAPI },
    meta: {
      type: 'object',
      required: ['total', 'lastFetchedAt'],
      additionalProperties: false,
      properties: {
        total: { type: 'integer', minimum: 0 },
        lastFetchedAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  },
};

/** `POST /migration/uisp-users/resolve` (bloque C). */
export const MIGRATION_UISP_USERS_RESOLVE_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['items'],
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        required: ['id', 'action'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', format: 'uuid' },
          action: { type: 'string', enum: [...MIGRATION_UISP_USER_ACTIONS] },
          role: {
            type: 'string',
            enum: Object.values(UserRole),
            description: `Obligatorio con CREAR. El contrato acepta cualquier UserRole, pero solo se pueden crear ${MIGRATION_IMPORTABLE_USER_ROLES.join(', ')}; otro rol responde 422 MIGRATION_USER_ROLE_NOT_ALLOWED.`,
          },
          displayName: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            description: 'Solo con CREAR y obligatorio en filas SIN_DATOS.',
          },
          isOperationalResource: {
            type: 'boolean',
            description:
              'Solo con CREAR; se fuerza a false si el usuario está inactivo o sin datos.',
          },
        },
      },
    },
  },
};

export const MIGRATION_UISP_USERS_RESOLVE_RESULT_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['data'],
  properties: { data: { type: 'array', items: MIGRATION_UISP_USER_OPENAPI } },
};

/** `POST /migration/uisp-users/invite` (bloque C). */
export const MIGRATION_UISP_USERS_INVITE_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['ids'],
  additionalProperties: false,
  properties: {
    ids: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
      items: { type: 'string', format: 'uuid' },
    },
  },
};

export const MIGRATION_UISP_USERS_INVITE_RESULT_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['invitados', 'omitidos'],
  additionalProperties: false,
  properties: {
    invitados: { type: 'integer', minimum: 0 },
    omitidos: { type: 'integer', minimum: 0 },
  },
};

export const MIGRATION_UISP_USERS_RESOLVE_ERROR_DESCRIPTIONS = {
  notFound: 'MIGRATION_UISP_USER_NOT_FOUND: alguna fila no existe en el tenant (details.ids).',
  resolved:
    'MIGRATION_UISP_USER_ALREADY_RESOLVED: alguna fila ya está ENLAZADO, CREADO o DESCARTADO (details.ids); no se aplicó nada.',
  unprocessable:
    'MIGRATION_USER_ROLE_NOT_ALLOWED (rol no importable) o MIGRATION_MAPPING_TARGET_INVALID con details.reason = SIN_COINCIDENCIA (ENLAZAR sin usuario de iWana con el mismo correo, o ese usuario ya no existe; details.id = fila). No se aplicó nada.',
} as const;

export const MIGRATION_SOURCE_ERROR_DESCRIPTIONS = {
  unauthorized:
    'MIGRATION_SOURCE_UNAUTHORIZED: UISP rechazó la clave (401/403). details.reason = CREDENCIAL_RECHAZADA. También MIGRATION_SOURCE_UNREACHABLE con details.reason = DESTINO_NO_PERMITIDO: la dirección (o alguna de las IP a las que resuelve) es interna, de enlace local, multidifusión o reservada; no se conecta.',
  unreachable:
    'MIGRATION_SOURCE_UNREACHABLE: no se pudo hablar con UISP. details.reason ∈ CERTIFICADO_NO_COINCIDE, CERTIFICADO_NO_CONFIABLE, TIEMPO_AGOTADO, RED, RESPUESTA_INVALIDA, RESPUESTA_DEMASIADO_GRANDE, HTTP_4XX, HTTP_5XX.',
  notConfigured:
    'MIGRATION_SOURCE_NOT_CONFIGURED (409): no hay conexión con UISP registrada. Mismo estado en probar, traer usuarios y retirar.',
} as const;
