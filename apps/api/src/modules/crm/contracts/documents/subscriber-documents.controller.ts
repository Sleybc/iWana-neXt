import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AccessPermissionKey,
  SUBSCRIBER_DOCUMENT_KINDS,
  SUBSCRIBER_DOCUMENT_ORIGINS,
  SUBSCRIBER_DOCUMENT_VISIBILITIES,
  UserRole,
  type SubscriberDocument,
} from '@iwana/shared';
import { Permissions } from '../../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { SkipAudit } from '../../../audit/decorators/skip-audit.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import type { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { SubscriberDocumentsService } from './subscriber-documents.service';

/** Mismos roles que leen la pestaña Documentos (sin técnico: CA-12 del cierre de venta). */
const DOCUMENT_TAB_ROLES = [
  UserRole.ADMIN,
  UserRole.SALES,
  UserRole.SUPPORT,
  UserRole.ACCOUNTANT,
  UserRole.AUDITOR,
] as const;

const SUBSCRIBER_DOCUMENT_OPENAPI = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'subscriberId',
    'kind',
    'contentType',
    'sizeBytes',
    'origin',
    'visibility',
    'documentDate',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    subscriberId: { type: 'string', format: 'uuid' },
    kind: { type: 'string', enum: [...SUBSCRIBER_DOCUMENT_KINDS] },
    contentType: { type: 'string' },
    sizeBytes: { type: 'integer', minimum: 0 },
    origin: { type: 'string', enum: [...SUBSCRIBER_DOCUMENT_ORIGINS] },
    visibility: { type: 'string', enum: [...SUBSCRIBER_DOCUMENT_VISIBILITIES] },
    documentDate: { type: 'string', format: 'date', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

/** Soportes documentales del suscriptor en la pestaña Documentos (ADR-110 D13). */
@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/subscribers/:subscriberId/documents')
export class SubscriberDocumentsController {
  constructor(private readonly service: SubscriberDocumentsService) {}

  @Get()
  @Roles(...DOCUMENT_TAB_ROLES)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Soportes documentales del suscriptor (sin nombre de archivo)' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['data'],
      properties: {
        data: {
          type: 'object',
          required: ['items'],
          properties: { items: { type: 'array', items: SUBSCRIBER_DOCUMENT_OPENAPI } },
        },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'SUBSCRIBER_DOCUMENT_TITULAR_RESTRICTED' })
  async list(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
  ): Promise<{ data: { items: SubscriberDocument[] } }> {
    return { data: { items: await this.service.listForSubscriber(subscriberId) } };
  }

  @Get(':documentId/download')
  @Roles(...DOCUMENT_TAB_ROLES)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @SkipAudit()
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Descargar un soporte del suscriptor (auditado)' })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: 'Archivo como adjunto, sin caché' })
  @ApiResponse({
    status: 403,
    description: 'SUBSCRIBER_DOCUMENT_RESTRICTED: falta crm.subscribers.document.read',
  })
  @ApiResponse({ status: 404, description: 'SUBSCRIBER_DOCUMENT_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'SUBSCRIBER_DOCUMENT_TITULAR_RESTRICTED' })
  async download(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<StreamableFile> {
    const file = await this.service.download(subscriberId, documentId, actor);
    return new StreamableFile(file.content, {
      type: file.contentType,
      disposition: 'attachment; filename="soporte"',
      length: file.content.length,
    });
  }
}
