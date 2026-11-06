import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  BILLING_CONTRACT_POLICY_RESPONSE_SCHEMA,
  BILLING_POLICY_PREVIEW_RESPONSE_SCHEMA,
  BILLING_POLICY_RESPONSE_SCHEMA,
} from './billing-policy.openapi';
import { BillingPolicyService } from './billing-policy.service';

const BILLING_POLICY_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'expectedUpdatedAt',
    'periodTiming',
    'generationLeadDays',
    'cutoffMode',
    'paymentTermDays',
    'graceDays',
    'cutoffEnabled',
    'minimumUnpaidForCutoff',
    'prorationMethod',
    'firstPeriodMode',
    'automaticGeneration',
    'approvalMode',
    'autoApplyCredit',
    'generationHour',
    'documentPrefix',
  ],
  properties: {
    expectedUpdatedAt: { type: 'string', format: 'date-time' },
    periodTiming: { type: 'string', enum: ['ANTICIPADO', 'VENCIDO'] },
    generationLeadDays: { type: 'integer', minimum: 0, maximum: 15 },
    cutoffMode: { type: 'string', enum: ['DIA_FIJO_CICLO', 'VENCIMIENTO_MAS_GRACIA'] },
    paymentTermDays: { type: 'integer', minimum: 0, maximum: 60 },
    graceDays: { type: 'integer', minimum: 0, maximum: 30 },
    cutoffEnabled: { type: 'boolean' },
    minimumUnpaidForCutoff: { oneOf: [{ type: 'number', minimum: 0 }, { type: 'string' }] },
    prorationMethod: { type: 'string', enum: ['DIAS_REALES', 'MES_30'] },
    firstPeriodMode: { type: 'string', enum: ['SEPARADO', 'JUNTO_AL_SIGUIENTE'] },
    automaticGeneration: { type: 'boolean' },
    approvalMode: { type: 'string', enum: ['BORRADOR', 'AUTOMATICA'] },
    autoApplyCredit: { type: 'boolean' },
    generationHour: { type: 'integer', minimum: 0, maximum: 23 },
    documentPrefix: { type: 'string', minLength: 1, maxLength: 10 },
  },
};

const CONTRACT_POLICY_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    periodTiming: { type: 'string', enum: ['ANTICIPADO', 'VENCIDO'], nullable: true },
    generationLeadDays: { type: 'integer', minimum: 0, maximum: 15, nullable: true },
    paymentTermDays: { type: 'integer', minimum: 0, maximum: 60, nullable: true },
    graceDays: { type: 'integer', minimum: 0, maximum: 30, nullable: true },
    cutoffEnabled: { type: 'boolean', nullable: true },
    firstPeriodMode: { type: 'string', enum: ['SEPARADO', 'JUNTO_AL_SIGUIENTE'], nullable: true },
    billingStartDate: { type: 'string', format: 'date', nullable: true },
    expectedUpdatedAt: { type: 'string', format: 'date-time' },
  },
};

const BILLING_POLICY_PREVIEW_REQUEST_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    contractId: { type: 'string', format: 'uuid' },
    policy: {
      type: 'object',
      additionalProperties: false,
      properties: {
        periodTiming: { type: 'string', enum: ['ANTICIPADO', 'VENCIDO'] },
        generationLeadDays: { type: 'integer', minimum: 0, maximum: 15 },
        cutoffMode: { type: 'string', enum: ['DIA_FIJO_CICLO', 'VENCIMIENTO_MAS_GRACIA'] },
        paymentTermDays: { type: 'integer', minimum: 0, maximum: 60 },
        graceDays: { type: 'integer', minimum: 0, maximum: 30 },
        cutoffEnabled: { type: 'boolean' },
      },
    },
  },
};

type AuthenticatedRequest = { user?: JwtPayload };

function getActorId(request: AuthenticatedRequest): string {
  const actorId = request.user?.sub;
  if (!actorId) {
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'La sesión no es válida.' });
  }
  return actorId;
}

@ApiTags('billing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('billing')
export class BillingPolicyController {
  constructor(private readonly billingPolicy: BillingPolicyService) {}

  @Get('policy')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({ summary: 'Consultar la política de facturación de la empresa' })
  @ApiOkResponse({
    description: 'Política vigente de facturación.',
    schema: BILLING_POLICY_RESPONSE_SCHEMA,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async getPolicy() {
    return { data: await this.billingPolicy.getPolicy() };
  }

  @Put('policy')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.BILLING_POLICY_MANAGE)
  @ApiOperation({ summary: 'Actualizar la política de facturación de la empresa' })
  @ApiBody({ schema: BILLING_POLICY_UPDATE_SCHEMA })
  @ApiOkResponse({ description: 'Política actualizada.', schema: BILLING_POLICY_RESPONSE_SCHEMA })
  @ApiBadRequestResponse({ description: 'Los datos de la política no son válidos.' })
  @ApiConflictResponse({ description: 'La política cambió desde la última consulta.' })
  @ApiResponse({ status: 422, description: 'La combinación de política no es compatible.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async updatePolicy(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return { data: await this.billingPolicy.updatePolicy(body, getActorId(request)) };
  }

  @Post('policy/preview')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({ summary: 'Previsualizar las próximas fechas de facturación' })
  @ApiBody({ schema: BILLING_POLICY_PREVIEW_REQUEST_SCHEMA })
  @ApiOkResponse({
    description: 'Tres fechas por cada ciclo con la política propuesta, sin guardar cambios.',
    schema: BILLING_POLICY_PREVIEW_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'La solicitud de vista previa no es válida.' })
  @ApiResponse({
    status: 422,
    description: 'La política propuesta contiene una combinación incompatible.',
  })
  @ApiResponse({ status: 404, description: 'El contrato no existe o está anonimizado.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async preview(@Body() body: unknown) {
    return { data: await this.billingPolicy.preview(body) };
  }

  @Get('contracts/:contractId/policy')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({ summary: 'Consultar la política específica de un contrato' })
  @ApiParam({ name: 'contractId', format: 'uuid' })
  @ApiOkResponse({
    description:
      'Sobrescrituras; si no existen, los campos vacíos representan la política heredada.',
    schema: BILLING_CONTRACT_POLICY_RESPONSE_SCHEMA,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async getContractPolicy(@Param('contractId', new ParseUUIDPipe()) contractId: string) {
    return this.billingPolicy.getContractPolicy(contractId);
  }

  @Put('contracts/:contractId/policy')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.BILLING_POLICY_MANAGE)
  @ApiOperation({ summary: 'Actualizar la política específica de un contrato' })
  @ApiParam({ name: 'contractId', format: 'uuid' })
  @ApiBody({ schema: CONTRACT_POLICY_UPDATE_SCHEMA })
  @ApiOkResponse({
    description: 'Sobrescrituras actualizadas.',
    schema: BILLING_CONTRACT_POLICY_RESPONSE_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'Los datos de la sobrescritura no son válidos.' })
  @ApiConflictResponse({ description: 'La política cambió desde la última consulta.' })
  @ApiResponse({ status: 404, description: 'El contrato no existe.' })
  @ApiResponse({ status: 422, description: 'La combinación de política no es compatible.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async updateContractPolicy(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.billingPolicy.updateContractPolicy(contractId, body, getActorId(request));
  }
}
