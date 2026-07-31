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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, UserRole, WfmWorkType } from '@iwana/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { TenantAwareThrottlerGuard } from './guards/tenant-aware-throttler.guard';
import { ExecutionOrderResponseHeadersInterceptor } from './interceptors/execution-order-response-headers.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  ExecutionOrderTemplatesService,
  CreateTemplateInput,
  CreateVersionInput,
} from './services/execution-order-templates.service';

@ApiTags('tasks-execution-orders')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantAwareThrottlerGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(ExecutionOrderResponseHeadersInterceptor)
@Controller('tasks/execution-order-templates')
export class ExecutionOrderTemplatesController {
  constructor(private readonly templatesService: ExecutionOrderTemplatesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDER_TEMPLATES_READ)
  @ApiOperation({ summary: 'Listar plantillas de ejecución' })
  async list(@Query('workType') workType?: string, @Query('status') status?: string) {
    const filters: { workType?: WfmWorkType; status?: 'DRAFT' | 'PUBLISHED' | 'RETIRED' } = {};
    if (workType) filters.workType = workType as WfmWorkType;
    if (status) filters.status = status as 'DRAFT' | 'PUBLISHED' | 'RETIRED';
    const templates = await this.templatesService.listTemplates(filters);
    return { data: templates.map((t) => this.mapTemplate(t)), meta: this.emptyMeta() };
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDER_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Crear plantilla de ejecución (borrador)' })
  async create(@Body() body: CreateTemplateInput, @CurrentUser() _actor: JwtPayload) {
    const template = await this.templatesService.createTemplate(body);
    return this.mapTemplate(template);
  }

  @Get(':templateId/versions')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDER_TEMPLATES_READ)
  @ApiOperation({ summary: 'Listar versiones de una plantilla' })
  async listVersions(@Param('templateId', ParseUUIDPipe) templateId: string) {
    const versions = await this.templatesService.listVersions(templateId);
    return { data: versions.map((v) => this.mapVersion(v)), meta: this.emptyMeta() };
  }

  @Post(':templateId/versions')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDER_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Crear nueva versión de plantilla (borrador)' })
  async createVersion(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: CreateVersionInput,
    @CurrentUser() _actor: JwtPayload,
  ) {
    const version = await this.templatesService.createVersion(templateId, body);
    return this.mapVersion(version);
  }

  @Post('/versions/:versionId/publish')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDER_TEMPLATES_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publicar versión de plantilla' })
  async publish(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() _actor: JwtPayload,
  ) {
    const version = await this.templatesService.publishVersion(versionId);
    return this.mapVersion(version);
  }

  @Post('/versions/:versionId/retire')
  @Roles(UserRole.ADMIN, UserRole.NOC)
  @Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDER_TEMPLATES_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirar versión de plantilla' })
  async retire(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @CurrentUser() _actor: JwtPayload,
  ) {
    const version = await this.templatesService.retireVersion(versionId);
    return this.mapVersion(version);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Mappers
  // ═══════════════════════════════════════════════════════════════════

  private mapTemplate(t: any) {
    return {
      id: t.id,
      key: t.key,
      label: t.label,
      workType: t.workType,
      status: t.status,
      createdAt: this.dateOrString(t.createdAt),
      updatedAt: this.dateOrString(t.updatedAt),
    };
  }

  private mapVersion(v: any) {
    const requirements = (v.requirements ?? []).map((r: any) => ({
      key: r.key,
      label: r.label,
      required: r.required,
      kind: r.kind,
      ...(r.config ?? {}),
    }));

    return {
      id: v.id,
      templateId: v.templateId,
      key: v.templateKey,
      version: v.version,
      label: v.label,
      status: v.status,
      effectiveFrom: this.dateOrString(v.effectiveFrom),
      requirements,
      reasonCatalogs: v.reasonCatalogs ?? [],
      publishedAt: this.dateOrString(v.publishedAt),
      retiredAt: this.dateOrString(v.retiredAt),
    };
  }

  private dateOrString(value: Date | string | null | undefined): string | undefined {
    if (value == null) return undefined;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private emptyMeta() {
    return {
      nextCursor: null,
      total: 0,
      totalIsEstimate: false,
      page: 1,
      limit: 25,
      totalPages: 1,
      hasMore: false,
      mode: 'page' as const,
      capabilities: { randomAccess: true, sortableFields: [] },
      sort: null,
    };
  }
}
