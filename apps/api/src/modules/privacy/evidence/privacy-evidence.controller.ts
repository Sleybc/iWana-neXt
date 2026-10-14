import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { TenantContext } from '@iwana/db';
import {
  AccessPermissionKey,
  AuditAction,
  UserRole,
  privacyEvidenceResponseSchema,
} from '@iwana/shared';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AuditEntity } from '../../audit/decorators/audit-entity.decorator';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { AuditService } from '../../audit/audit.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { MediaService } from '../../media/media.service';
import { privacyEvidenceResponseSchema as privacyEvidenceOpenApiSchema } from '../privacy-openapi.schemas';

@ApiTags('privacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuditEntity('PrivacyEvidence')
@Controller('privacy/evidence')
export class PrivacyEvidenceController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Cargar evidencia para un trámite de privacidad' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
      additionalProperties: false,
    },
  })
  @ApiCreatedResponse({
    description: 'Evidencia privada cargada.',
    schema: privacyEvidenceOpenApiSchema,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'Se requiere privacy.manage.' })
  async upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Se requiere el archivo de evidencia.');
    const schemaName = TenantContext.getOrThrow().schemaName;
    const asset = await this.mediaService.uploadPrivacyEvidence(schemaName, file, user.sub);
    const data = privacyEvidenceResponseSchema.parse({
      mediaId: asset.id,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    });
    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'PrivacyEvidence',
      entityId: asset.id,
      userId: user.sub,
    });
    return { data };
  }
}
