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
  SIGNED_CONTRACT_DOWNLOAD_RESTRICTIONS,
  UserRole,
  type SignedContractDocument,
} from '@iwana/shared';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import type { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { Permissions } from '../../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { SkipAudit } from '../../../audit/decorators/skip-audit.decorator';
import { SignedContractDocumentsService } from './signed-contract-documents.service';

/** Roles que leen la pestaña Documentos del suscriptor (sin técnico: CA-12). */
const DOCUMENT_TAB_ROLES = [
  UserRole.ADMIN,
  UserRole.SALES,
  UserRole.SUPPORT,
  UserRole.ACCOUNTANT,
  UserRole.AUDITOR,
] as const;

/**
 * Contrato firmado en la pestaña Documentos (cierre de venta, bloque G; spec §5 G, CA-9).
 * Listar exige `crm.subscribers.read`; descargar además `crm.subscribers.document.read`
 * (lo valida el servicio con 403 `SIGNED_CONTRACT_DOCUMENT_RESTRICTED`).
 */
@ApiTags('contracts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller()
export class SignedContractDocumentsController {
  constructor(private readonly service: SignedContractDocumentsService) {}

  @Get('crm/subscribers/:subscriberId/signed-contracts')
  @Roles(...DOCUMENT_TAB_ROLES)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Contratos firmados del suscriptor (pestaña Documentos)' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'contractId',
                  'signedAt',
                  'templateVersion',
                  'downloadable',
                  'restriction',
                ],
                properties: {
                  contractId: { type: 'string', format: 'uuid' },
                  signedAt: { type: 'string', format: 'date-time' },
                  templateVersion: { type: 'string' },
                  downloadable: { type: 'boolean' },
                  restriction: {
                    type: 'string',
                    nullable: true,
                    enum: [...SIGNED_CONTRACT_DOWNLOAD_RESTRICTIONS],
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async list(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: { items: SignedContractDocument[] } }> {
    return { data: { items: await this.service.listForSubscriber(subscriberId, actor) } };
  }

  @Get('crm/contracts/:id/signed-document')
  @Roles(...DOCUMENT_TAB_ROLES)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @SkipAudit()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Descargar el PDF del contrato firmado (verifica la huella; auditado; CA-4, CA-9)',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF firmado como adjunto, sin caché' })
  @ApiResponse({
    status: 403,
    description: 'SIGNED_CONTRACT_DOCUMENT_RESTRICTED: falta crm.subscribers.document.read',
  })
  @ApiResponse({ status: 404, description: 'Contrato inexistente o sin firma' })
  @ApiResponse({
    status: 409,
    description: 'Titular bloqueado o anonimizado, o CONTRACT_DOCUMENT_INTEGRITY_FAILED',
  })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<StreamableFile> {
    const pdf = await this.service.download(id, actor);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'attachment; filename="contrato-firmado.pdf"',
      length: pdf.length,
    });
  }
}
