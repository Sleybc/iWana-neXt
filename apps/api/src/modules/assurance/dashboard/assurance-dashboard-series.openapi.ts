import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ASSURANCE_DASHBOARD_SERIES_DAYS } from '@iwana/shared';

const COUNT: SchemaObject = { type: 'integer', minimum: 0 };

/**
 * OpenAPI de `AssuranceDashboardSeriesSchema` (@iwana/shared, HLD-MOD02 v3.0 §3 N3) dentro del
 * sobre `{ data }`. Solo conteos por día; sin identificadores.
 */
export const ASSURANCE_DASHBOARD_SERIES_OPENAPI_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['asOf', 'days', 'series'],
      properties: {
        asOf: {
          type: 'string',
          format: 'date',
          description: 'Fecha civil del tenant al responder; último día de la serie.',
          example: '2026-11-17',
        },
        days: {
          type: 'integer',
          minimum: ASSURANCE_DASHBOARD_SERIES_DAYS.min,
          maximum: ASSURANCE_DASHBOARD_SERIES_DAYS.max,
        },
        series: {
          type: 'array',
          minItems: ASSURANCE_DASHBOARD_SERIES_DAYS.min,
          maxItems: ASSURANCE_DASHBOARD_SERIES_DAYS.max,
          description:
            '`days` días civiles ascendentes que terminan en asOf; días sin casos en cero. Excluye casos importados.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['date', 'created', 'resolved'],
            properties: {
              date: { type: 'string', format: 'date', example: '2026-11-17' },
              created: { ...COUNT, description: 'Casos creados ese día.' },
              resolved: { ...COUNT, description: 'Casos con su última resolución ese día.' },
            },
          },
        },
      },
    },
  },
};
