import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  CONTRACT_SIGNATURE_IMAGE_MAX_BASE64_CHARS,
  CONTRACT_SIGNER_DOCUMENT_TYPES,
  ContractSignatureRequestSchema,
  PlatformRole,
  UserRole,
  type ContractSignatureCommand,
  type ContractSignatureResponse,
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
import { ContractSignatureService } from './contract-signature.service';

const SHA256 = { type: 'string', pattern: '^[a-f0-9]{64}$' } as const;

/**
 * Firma del contrato en la consola de OT (cierre de venta, bloque D; ADR-109 D1/D2).
 * Mismos roles y permiso que la generación: el técnico opera solo la OT asignada y el
 * supervisor cualquiera del tenant (lo valida el servicio). La respuesta no lleva URL ni
 * documento (CA-12).
 */
@ApiTags('contracts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/contracts/:id')
export class ContractSignatureController {
  constructor(private readonly signatureService: ContractSignatureService) {}

  @Post('signature')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Firmar el contrato (DRAFT → ACTIVE) con la evidencia de la visita; idempotente',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'idempotencyKey',
        'generationId',
        'documentSha256',
        'executionOrderId',
        'signatureImage',
        'signer',
        'location',
        'device',
      ],
      properties: {
        idempotencyKey: { type: 'string', format: 'uuid' },
        generationId: { type: 'string', format: 'uuid' },
        documentSha256: SHA256,
        executionOrderId: { type: 'string', format: 'uuid' },
        signatureImage: {
          type: 'string',
          maxLength: CONTRACT_SIGNATURE_IMAGE_MAX_BASE64_CHARS,
          pattern: '^data:image/png;base64,',
        },
        signer: {
          type: 'object',
          additionalProperties: false,
          required: ['fullName', 'documentType', 'documentNumber'],
          properties: {
            fullName: { type: 'string', minLength: 3, maxLength: 200 },
            documentType: { type: 'string', enum: [...CONTRACT_SIGNER_DOCUMENT_TYPES] },
            documentNumber: { type: 'string', pattern: '^[A-Za-z0-9]{3,20}$' },
          },
        },
        location: {
          type: 'object',
          nullable: true,
          additionalProperties: false,
          required: ['latitude', 'longitude'],
          properties: {
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
          },
        },
        device: {
          type: 'object',
          additionalProperties: false,
          required: ['userAgent', 'platform'],
          properties: {
            userAgent: { type: 'string', minLength: 1, maxLength: 512 },
            platform: { type: 'string', maxLength: 64, nullable: true },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Contrato ACTIVE; replayed=true si la clave ya se había aplicado.',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          additionalProperties: false,
          required: [
            'contractId',
            'status',
            'signedAt',
            'billingStartDate',
            'signedDocumentSha256',
            'templateVersion',
            'replayed',
          ],
          properties: {
            contractId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['ACTIVE'] },
            signedAt: { type: 'string', format: 'date-time' },
            billingStartDate: { type: 'string', format: 'date' },
            signedDocumentSha256: SHA256,
            templateVersion: { type: 'string' },
            replayed: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'OT no asignada al usuario' })
  @ApiResponse({ status: 404, description: 'Contrato, OT o generación inexistente' })
  @ApiResponse({
    status: 409,
    description:
      'CONTRACT_NOT_DRAFT, titular bloqueado o anonimizado, CONTRACT_DOCUMENT_NOT_READY, ' +
      'CONTRACT_DOCUMENT_HASH_MISMATCH, PROVISIONING_NOT_ACTIVE o IDEMPOTENCY_KEY_REUSED',
  })
  @ApiResponse({
    status: 422,
    description: 'OT de otro titular, generación de otra OT o firma que no es PNG',
  })
  @ApiResponse({ status: 503, description: 'SIGNED_DOCUMENT_UNAVAILABLE: reintentar' })
  async sign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(ContractSignatureRequestSchema))
    body: ContractSignatureCommand,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: ContractSignatureResponse }> {
    return { data: await this.signatureService.sign(id, body, actor) };
  }

  @Get('document-generations/:generationId/document')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_EXECUTE)
  @SkipAudit()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Ver el PDF del contrato durante la firma (solo sin firmar; auditado; CA-12)',
  })
  @ApiProduces('application/pdf')
  @ApiQuery({
    name: 'executionOrderId',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiResponse({ status: 200, description: 'PDF sin firmar, inline y sin caché' })
  @ApiResponse({ status: 403, description: 'OT no asignada o CONTRACT_DOCUMENT_SIGNED' })
  @ApiResponse({ status: 404, description: 'Documento no disponible' })
  @ApiResponse({ status: 409, description: 'CONTRACT_DOCUMENT_INTEGRITY_FAILED' })
  async view(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('generationId', ParseUUIDPipe) generationId: string,
    @Query('executionOrderId', ParseUUIDPipe) executionOrderId: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<StreamableFile> {
    const pdf = await this.signatureService.viewForSigning(
      id,
      generationId,
      executionOrderId,
      actor,
    );
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'inline',
      length: pdf.length,
    });
  }
}
