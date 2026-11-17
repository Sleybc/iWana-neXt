import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { DASHBOARD_SERIES_MONTHS } from '@iwana/shared';

const COUNT: SchemaObject = { type: 'integer', minimum: 0 };

/**
 * OpenAPI de `SubscribersDashboardSummarySchema` (@iwana/shared, HLD-MOD02 v3.0 §3 N2) dentro
 * del sobre `{ data }`. Solo conteos; sin identificadores de persona.
 */
export const SUBSCRIBERS_DASHBOARD_SUMMARY_OPENAPI_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['asOf', 'activations', 'cancellations', 'series'],
      properties: {
        asOf: {
          type: 'string',
          format: 'date',
          description: 'Fecha civil del tenant al responder.',
          example: '2026-11-17',
        },
        activations: {
          ...COUNT,
          description:
            'Altas del mes en curso: activados en el mes, sin borrado lógico y no importados.',
        },
        cancellations: {
          ...COUNT,
          description: 'Bajas del mes en curso: suscriptores cancelados desde activo o suspendido.',
        },
        series: {
          type: 'array',
          minItems: DASHBOARD_SERIES_MONTHS,
          maxItems: DASHBOARD_SERIES_MONTHS,
          description:
            'Doce meses civiles ascendentes que terminan en el mes de asOf; meses sin movimiento en cero.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['month', 'activations', 'cancellations'],
            properties: {
              month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', example: '2026-11' },
              activations: COUNT,
              cancellations: COUNT,
            },
          },
        },
      },
    },
  },
};
