import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  MIGRATION_BATCH_SOURCES,
  MIGRATION_BATCH_STATUSES,
  MIGRATION_ENTITIES,
  MIGRATION_FILE_REJECTION_REASONS,
  MIGRATION_MAPPING_ACTIONS,
  MIGRATION_MAPPING_KINDS,
  MIGRATION_OBSERVATIONS,
  MIGRATION_PROCESSING_STATES,
  MIGRATION_REJECTION_REASONS,
  MIGRATION_REVERT_BLOCK_REASONS,
  MIGRATION_SOURCE_SYSTEMS,
} from '@iwana/shared';

/** OpenAPI de la importación UISP, derivado de las listas `as const` de `@iwana/shared`. */
const count: SchemaObject = { type: 'integer', minimum: 0 };

function countsBy(keys: readonly string[]): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(keys.map((key) => [key, count])),
  };
}

export function envelope(data: SchemaObject): SchemaObject {
  return { type: 'object', required: ['data'], properties: { data } };
}

export function listEnvelope(item: SchemaObject): SchemaObject {
  return {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: { type: 'array', items: item },
      meta: {
        type: 'object',
        required: ['total', 'page', 'limit', 'totalPages'],
        properties: { total: count, page: count, limit: count, totalPages: count },
      },
    },
  };
}

export const MIGRATION_PENDING_VALUE_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['kind', 'externalValue', 'externalLabel', 'occurrences'],
  properties: {
    kind: { type: 'string', enum: [...MIGRATION_MAPPING_KINDS] },
    externalValue: { type: 'string', maxLength: 120 },
    externalLabel: { type: 'string', maxLength: 120, nullable: true },
    occurrences: count,
  },
};

export const MIGRATION_BATCH_SUMMARY_OPENAPI: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'source',
    'status',
    'processing',
    'filesReceived',
    'createdBy',
    'createdAt',
    'purgeAfter',
    'purgedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    source: { type: 'string', enum: [...MIGRATION_BATCH_SOURCES] },
    status: { type: 'string', enum: [...MIGRATION_BATCH_STATUSES] },
    processing: { type: 'string', enum: [...MIGRATION_PROCESSING_STATES] },
    promotionProcessing: {
      type: 'string',
      enum: [...MIGRATION_PROCESSING_STATES],
      nullable: true,
      description: 'Procesamiento de la promoción; null si nunca se promovió.',
    },
    filesReceived: count,
    createdBy: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    purgeAfter: { type: 'string', format: 'date-time' },
    purgedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const money: SchemaObject = { type: 'string', pattern: String.raw`^-?\d{1,12}\.\d{2}$` };
const totals: SchemaObject = {
  type: 'object',
  required: ['uisp', 'iwana'],
  properties: { uisp: money, iwana: money },
};
const rejectionsByEntity: SchemaObject = {
  type: 'object',
  description: 'Entidad → motivo → cantidad.',
  additionalProperties: false,
  properties: Object.fromEntries(
    MIGRATION_ENTITIES.map((entity) => [entity, countsBy(MIGRATION_REJECTION_REASONS)]),
  ),
};

export const MIGRATION_PROMOTION_OPENAPI: SchemaObject = {
  type: 'object',
  nullable: true,
  required: [
    'procesamiento',
    'promovidos',
    'existentes',
    'rechazados',
    'etiquetasAsignadas',
    'periodosSuspension',
    'aplicaciones',
    'iniciadoEn',
    'terminadoEn',
  ],
  properties: {
    procesamiento: { type: 'string', enum: [...MIGRATION_PROCESSING_STATES] },
    promovidos: countsBy(MIGRATION_ENTITIES),
    existentes: countsBy(MIGRATION_ENTITIES),
    rechazados: rejectionsByEntity,
    etiquetasAsignadas: count,
    periodosSuspension: count,
    aplicaciones: count,
    iniciadoEn: { type: 'string', format: 'date-time', nullable: true },
    terminadoEn: { type: 'string', format: 'date-time', nullable: true },
  },
};

export const MIGRATION_RECONCILIATION_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['resultado', 'titulares', 'conciliados', 'diferencias', 'calculadoEn'],
  properties: {
    resultado: { type: 'string', enum: ['CONCILIADO', 'CON_DIFERENCIAS'] },
    titulares: count,
    conciliados: count,
    diferencias: {
      type: 'array',
      items: {
        type: 'object',
        required: ['subscriberId', 'externalId', 'facturado', 'pagado', 'saldo'],
        properties: {
          subscriberId: { type: 'string', format: 'uuid' },
          externalId: { type: 'string', maxLength: 160 },
          facturado: totals,
          pagado: totals,
          saldo: totals,
        },
      },
    },
    calculadoEn: { type: 'string', format: 'date-time' },
  },
};

export const MIGRATION_PROMOTE_ACCEPTED_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['id', 'status'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['CARGADO'] },
  },
};

export const MIGRATION_REVERT_RESULT_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['id', 'status', 'retirados', 'etiquetasRetiradas'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['REVERTIDO'] },
    retirados: countsBy(MIGRATION_ENTITIES),
    etiquetasRetiradas: count,
  },
};

/** Cuerpo del 409 `MIGRATION_REVERT_BLOCKED`. */
export const MIGRATION_REVERT_BLOCKER_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['motivo', 'cantidad'],
  properties: {
    motivo: { type: 'string', enum: [...MIGRATION_REVERT_BLOCK_REASONS] },
    cantidad: { type: 'integer', minimum: 1 },
  },
};

export const MIGRATION_BATCH_REPORT_OPENAPI: SchemaObject = {
  ...MIGRATION_BATCH_SUMMARY_OPENAPI,
  required: [
    ...(MIGRATION_BATCH_SUMMARY_OPENAPI.required ?? []),
    'counts',
    'rejections',
    'promotion',
    'reconciliation',
  ],
  properties: {
    ...MIGRATION_BATCH_SUMMARY_OPENAPI.properties,
    promotion: MIGRATION_PROMOTION_OPENAPI,
    reconciliation: { ...MIGRATION_RECONCILIATION_OPENAPI, nullable: true },
    counts: {
      type: 'object',
      required: [
        'procesamiento',
        'archivos',
        'entidades',
        'observaciones',
        'tareasSinFuente',
        'pendientesEquivalencia',
        'procesadoEn',
      ],
      properties: {
        procesamiento: { type: 'string', enum: [...MIGRATION_PROCESSING_STATES] },
        archivos: {
          type: 'object',
          required: ['recibidos', 'leidos', 'rechazados'],
          properties: {
            recibidos: count,
            leidos: count,
            rechazados: countsBy(MIGRATION_FILE_REJECTION_REASONS),
          },
        },
        entidades: {
          type: 'object',
          additionalProperties: false,
          properties: Object.fromEntries(
            MIGRATION_ENTITIES.map((entity) => [
              entity,
              {
                type: 'object',
                required: ['leidos', 'validos', 'rechazados'],
                properties: { leidos: count, validos: count, rechazados: count },
              },
            ]),
          ),
        },
        observaciones: countsBy(MIGRATION_OBSERVATIONS),
        tareasSinFuente: count,
        pendientesEquivalencia: { type: 'array', items: MIGRATION_PENDING_VALUE_OPENAPI },
        procesadoEn: { type: 'string', format: 'date-time', nullable: true },
      },
    },
    rejections: {
      type: 'object',
      description: 'Entidad → motivo → cantidad.',
      additionalProperties: false,
      properties: Object.fromEntries(
        MIGRATION_ENTITIES.map((entity) => [entity, countsBy(MIGRATION_REJECTION_REASONS)]),
      ),
    },
  },
};

export const MIGRATION_MAPPING_OPENAPI: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'sourceSystem',
    'kind',
    'externalValue',
    'externalLabel',
    'action',
    'targetRef',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    sourceSystem: { type: 'string', enum: [...MIGRATION_SOURCE_SYSTEMS] },
    kind: { type: 'string', enum: [...MIGRATION_MAPPING_KINDS] },
    externalValue: { type: 'string' },
    externalLabel: { type: 'string', nullable: true },
    action: { type: 'string', enum: [...MIGRATION_MAPPING_ACTIONS] },
    targetRef: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

export const MIGRATION_MAPPING_CREATE_OPENAPI: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'externalValue', 'action'],
  properties: {
    kind: { type: 'string', enum: [...MIGRATION_MAPPING_KINDS] },
    externalValue: { type: 'string', minLength: 1, maxLength: 120 },
    externalLabel: { type: 'string', maxLength: 120, nullable: true },
    action: { type: 'string', enum: [...MIGRATION_MAPPING_ACTIONS] },
    targetRef: {
      type: 'string',
      maxLength: 80,
      nullable: true,
      description:
        'Obligatorio con EQUIVALE: UUID de plan o etiqueta, método de pago de MOD14 o día de ciclo 1–28.',
    },
  },
};

export const MIGRATION_MAPPING_UPDATE_OPENAPI: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    externalLabel: { type: 'string', maxLength: 120, nullable: true },
    action: { type: 'string', enum: [...MIGRATION_MAPPING_ACTIONS] },
    targetRef: { type: 'string', maxLength: 80, nullable: true },
  },
};
