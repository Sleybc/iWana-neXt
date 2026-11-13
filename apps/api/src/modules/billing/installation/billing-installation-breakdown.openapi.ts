import { BILLING_INSTALLATION_VALUE_SOURCES } from '@iwana/shared';

const MONEY = { type: 'string', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' };

/**
 * OpenAPI de `BillingDocumentInstallationBreakdownSchema` (@iwana/shared), spec MOD14 2026-11-13
 * R3–R5. Valor real de la instalación: informativo, no cambia base, IVA ni total.
 */
export const INSTALLATION_BREAKDOWN_OPENAPI_SCHEMA = {
  type: 'object',
  nullable: true,
  additionalProperties: false,
  description:
    'Valor real de la instalación (informativo, no se cobra). Solo en el detalle; null si el ' +
    'documento no lleva línea INSTALACION o el contrato no tiene consumo de instalación registrado.',
  required: [
    'executionOrders',
    'items',
    'realValue',
    'chargedValue',
    'itemsWithoutValue',
    'serialsProtected',
  ],
  properties: {
    executionOrders: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['executionOrderNumber', 'closedAt'],
        properties: {
          executionOrderNumber: { type: 'string', maxLength: 40 },
          closedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'executionOrderNumber',
          'position',
          'description',
          'quantity',
          'unitOfMeasure',
          'unitReferenceValue',
          'referenceValue',
          'valueSource',
          'isLoan',
          'serialNumbers',
        ],
        properties: {
          executionOrderNumber: { type: 'string', maxLength: 40 },
          position: { type: 'integer', minimum: 1 },
          description: { type: 'string', maxLength: 200 },
          quantity: { type: 'string', pattern: '^\\d{1,10}(\\.\\d{1,2})?$' },
          unitOfMeasure: { type: 'string', maxLength: 32 },
          unitReferenceValue: { ...MONEY, nullable: true },
          referenceValue: { ...MONEY, nullable: true },
          valueSource: { type: 'string', enum: [...BILLING_INSTALLATION_VALUE_SOURCES] },
          isLoan: { type: 'boolean', description: 'Equipo en comodato: se devuelve.' },
          serialNumbers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Vacío si serialsProtected.',
          },
        },
      },
    },
    realValue: { ...MONEY, description: 'Suma de referenceValue, comodato incluido.' },
    chargedValue: { ...MONEY, description: 'Total con IVA de las líneas INSTALACION.' },
    itemsWithoutValue: { type: 'integer', minimum: 0 },
    serialsProtected: {
      type: 'boolean',
      description: 'Titular con datos bloqueados sin permiso del lector, o anonimizado.',
    },
  },
};

/** Respuesta de GET /billing/documents/:id; documenta el campo añadido por la spec 2026-11-13. */
export const DOCUMENT_DETAIL_OPENAPI_SCHEMA = {
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      description: 'BillingDocumentResponse (@iwana/shared) con líneas, cortesías y desglose.',
      properties: { installationBreakdown: INSTALLATION_BREAKDOWN_OPENAPI_SCHEMA },
    },
  },
};
