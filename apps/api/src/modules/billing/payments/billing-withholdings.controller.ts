import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  AccessPermissionKey,
  BILLING_WITHHOLDING_TAX_CODES,
  UserRole,
  type BillingWithholdingOptionsResponse,
} from '@iwana/shared';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { BillingWithholdingOptionsService } from './billing-withholding-options.service';

export const WITHHOLDING_OPTIONS_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['subscriberId', 'eligible', 'eligibility', 'options'],
      properties: {
        subscriberId: { type: 'string', format: 'uuid' },
        eligible: { type: 'boolean' },
        eligibility: {
          type: 'string',
          enum: ['AGENTE_RETENEDOR'],
          nullable: true,
        },
        options: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['taxCode', 'name', 'suggestedRate', 'source'],
            properties: {
              taxCode: { type: 'string', enum: [...BILLING_WITHHOLDING_TAX_CODES] },
              name: { type: 'string' },
              suggestedRate: { type: 'string', pattern: '^\\d{1,3}\\.\\d{4}$', nullable: true },
              source: { type: 'string', enum: ['TRIBUTACION', 'PRESET'] },
            },
          },
        },
      },
    },
  },
};

/** Retenciones del registro de pago (spec MOD14 2026-11-13 R6, R7). */
@ApiTags('billing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('billing')
export class BillingWithholdingsController {
  constructor(private readonly options: BillingWithholdingOptionsService) {}

  @Get('subscribers/:subscriberId/withholding-options')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_PAYMENTS_REGISTER)
  @ApiOperation({
    summary: 'Consultar si el titular puede registrar retenciones y sus tarifas sugeridas',
  })
  @ApiParam({ name: 'subscriberId', format: 'uuid' })
  @ApiOkResponse({
    description: 'Elegibilidad del titular y tipos de retención con tarifa sugerida.',
    schema: WITHHOLDING_OPTIONS_RESPONSE_SCHEMA,
  })
  @ApiNotFoundResponse({ description: 'No se encontró el suscriptor.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite registrar pagos.' })
  async withholdingOptions(
    @Param('subscriberId', new ParseUUIDPipe()) subscriberId: string,
  ): Promise<{ data: BillingWithholdingOptionsResponse }> {
    return { data: await this.options.optionsForSubscriber(subscriberId) };
  }
}
