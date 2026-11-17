import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  AccessPermissionKey,
  BILLING_OVERDUE_BUCKETS,
  BillingDashboardSummaryQuerySchema,
  DASHBOARD_SERIES_MONTHS,
  UserRole,
} from '@iwana/shared';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { BillingDashboardService } from './billing-dashboard.service';

const MONEY_SCHEMA: SchemaObject = { type: 'string', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' };
const COUNT_SCHEMA: SchemaObject = { type: 'integer', minimum: 0 };

/** Espejo OpenAPI de `BillingDashboardSummarySchema` (packages/shared billing-dashboard.contract.ts). */
export const BILLING_DASHBOARD_SUMMARY_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['asOf', 'invoicedAmount', 'collectedAmount', 'overdue', 'series'],
      properties: {
        asOf: {
          type: 'string',
          format: 'date',
          description: 'Fecha civil del tenant al responder.',
        },
        invoicedAmount: {
          ...MONEY_SCHEMA,
          description: 'Total de documentos EMITIDO o IMPORTADO con fecha de emisión en el mes.',
        },
        collectedAmount: {
          ...MONEY_SCHEMA,
          description: 'Caja del mes: pagos REGISTRADO por fecha de pago.',
        },
        overdue: {
          type: 'object',
          additionalProperties: false,
          required: ['amount', 'documentCount', 'subscriberCount', 'buckets'],
          description: 'Saldo vigente de documentos vencidos, con la misma regla que la lista.',
          properties: {
            amount: MONEY_SCHEMA,
            documentCount: COUNT_SCHEMA,
            subscriberCount: COUNT_SCHEMA,
            buckets: {
              type: 'array',
              minItems: BILLING_OVERDUE_BUCKETS.length,
              maxItems: BILLING_OVERDUE_BUCKETS.length,
              description: 'Los cuatro tramos de días desde el vencimiento, en orden.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['bucket', 'amount', 'documentCount'],
                properties: {
                  bucket: { type: 'string', enum: [...BILLING_OVERDUE_BUCKETS] },
                  amount: MONEY_SCHEMA,
                  documentCount: COUNT_SCHEMA,
                },
              },
            },
          },
        },
        series: {
          type: 'array',
          minItems: DASHBOARD_SERIES_MONTHS,
          maxItems: DASHBOARD_SERIES_MONTHS,
          description: 'Doce meses ascendentes que terminan en el mes de asOf.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['month', 'invoicedAmount', 'collectedAmount'],
            properties: {
              month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
              invoicedAmount: MONEY_SCHEMA,
              collectedAmount: MONEY_SCHEMA,
            },
          },
        },
      },
    },
  },
};

/** N1 del inicio del portal (HLD-MOD02 v3.0 §3 N1, §8.5): ambos permisos porque suma pagos. */
@ApiTags('billing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('billing/dashboard')
export class BillingDashboardController {
  constructor(private readonly dashboard: BillingDashboardService) {}

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ, AccessPermissionKey.BILLING_PAYMENTS_READ)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Resumen de facturación del inicio',
    description:
      'Facturado y recaudado del mes en curso, cartera vencida por antigüedad y serie de 12 meses, en la fecha civil del tenant. Sin parámetros.',
  })
  @ApiOkResponse({
    description: 'Sumas y conteos del tenant, sin datos de personas.',
    schema: BILLING_DASHBOARD_SUMMARY_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'La consulta no admite parámetros.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({
    description: 'El rol o los permisos no permiten consultar facturas y pagos.',
  })
  async summary(@Query(new ZodValidationPipe(BillingDashboardSummaryQuerySchema)) _query: unknown) {
    return { data: await this.dashboard.summary() };
  }
}
