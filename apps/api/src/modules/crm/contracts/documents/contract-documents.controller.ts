import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  AccessPermissionKey,
  CONTRACT_DOCUMENT_FAILURE_REASONS,
  CONTRACT_DOCUMENT_GENERATION_STATUSES,
  ContractDocumentGenerationRequestSchema,
  OPERATOR_CONTRACT_REQUIRED_FIELDS,
  PlatformRole,
  UserRole,
  type ContractDocumentGeneration,
  type ContractDocumentGenerationRequest,
} from '@iwana/shared';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import type { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { Permissions } from '../../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { SkipAudit } from '../../../audit/decorators/skip-audit.decorator';
import { ZodBodyValidationPipe } from '../../pipes/zod-body-validation.pipe';
import { ContractDocumentGenerationService } from './contract-document-generation.service';

const GENERATION_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'generationId',
    'contractId',
    'status',
    'templateLegalTextId',
    'templateVersion',
    'documentSha256',
    'requestedAt',
    'completedAt',
    'failureReason',
    'missingOperatorFields',
  ],
  properties: {
    generationId: { type: 'string', format: 'uuid' },
    contractId: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: [...CONTRACT_DOCUMENT_GENERATION_STATUSES] },
    templateLegalTextId: { type: 'string', format: 'uuid', nullable: true },
    templateVersion: { type: 'string', nullable: true },
    documentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$', nullable: true },
    requestedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
    failureReason: { type: 'string', enum: [...CONTRACT_DOCUMENT_FAILURE_REASONS], nullable: true },
    missingOperatorFields: {
      type: 'array',
      items: { type: 'string', enum: [...OPERATOR_CONTRACT_REQUIRED_FIELDS] },
    },
  },
};

/**
 * Generación del contrato desde la consola de OT (cierre de venta, bloque B; ADR-109 D5).
 * El técnico opera solo la OT asignada; el supervisor, cualquiera del tenant (lo valida el
 * servicio). La respuesta no expone el PDF ni datos del titular.
 */
@ApiTags('contracts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/contracts/:id/document-generations')
export class ContractDocumentsController {
  constructor(private readonly generationService: ContractDocumentGenerationService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @SkipAudit()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Pedir la generación del PDF del contrato (idempotente por contrato y versión)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['executionOrderId'],
      properties: { executionOrderId: { type: 'string', format: 'uuid' } },
    },
  })
  @ApiResponse({
    status: 202,
    description: 'PENDING encolado o READY existente; FAILED con motivo si no se puede generar.',
    schema: { type: 'object', properties: { data: GENERATION_SCHEMA } },
  })
  @ApiResponse({ status: 403, description: 'OT no asignada al usuario' })
  @ApiResponse({ status: 404, description: 'Contrato u OT inexistente' })
  @ApiResponse({ status: 409, description: 'El contrato no está pendiente de firma' })
  @ApiResponse({ status: 422, description: 'La OT no es del titular del contrato' })
  async request(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(ContractDocumentGenerationRequestSchema))
    body: ContractDocumentGenerationRequest,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: ContractDocumentGeneration }> {
    return { data: await this.generationService.request(id, body.executionOrderId, actor) };
  }

  @Get('latest')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @ApiOperation({ summary: 'Estado de la última generación del contrato para la OT' })
  @ApiQuery({
    name: 'executionOrderId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiResponse({
    status: 200,
    description: 'data en null si aún no se pidió.',
    schema: { type: 'object', properties: { data: { ...GENERATION_SCHEMA, nullable: true } } },
  })
  async latest(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('executionOrderId', ParseUUIDPipe) executionOrderId: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: ContractDocumentGeneration | null }> {
    return { data: await this.generationService.latest(id, executionOrderId, actor) };
  }
}
