import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  OrganizationBusinessHoursException,
  OrganizationCompanyBusinessHours,
  OrganizationSite,
  OrganizationSiteAssignment,
  OrganizationSiteBusinessHour,
  OrganizationSiteCapabilityEntity,
  OrganizationSiteResponsibilityEntity,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  AuditAction,
  BusinessHoursWeekday,
  OrganizationSiteAssignmentType,
  OrganizationSiteCapability,
  OrganizationSiteResponsibility,
  OrganizationSiteType,
} from '@iwana/shared';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import {
  CreateOrganizationSiteDto,
  CreateBusinessHoursExceptionDto,
  ReplaceSiteAssignmentsDto,
  ReplaceSiteBusinessHoursDto,
  ReplaceSiteResponsibilitiesDto,
  ReplaceCompanyBusinessHoursDto,
  UpdateBusinessHoursExceptionDto,
  UpdateOrganizationSiteDto,
} from './dto/organization-site.dto';
import {
  ListOrganizationSitesByCapabilityInput,
  OrganizationSiteSummary,
} from './ports/organization-site-read.port';

interface MutationAuditContext {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface OrganizationSiteBusinessHourSnapshot {
  weekday: BusinessHoursWeekday;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface OrganizationBusinessHoursExceptionSnapshot {
  id: string;
  organizationSiteId: string | null;
  exceptionDate: string;
  isRecurring: boolean;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  name: string;
  description: string | null;
  createdAt: Date;
  [key: string]: unknown;
}

export interface OrganizationSiteAssignmentSnapshot {
  userId: string;
  assignmentType: OrganizationSiteAssignmentType;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
}

export interface OrganizationSiteResponsibilitySnapshot {
  userId: string;
  responsibility: OrganizationSiteResponsibility;
  validFrom: string;
  validTo: string | null;
}

export interface OrganizationSiteDetail extends OrganizationSiteSummary {
  siteType: OrganizationSiteType;
  address: string | null;
  municipality: string | null;
  department: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  isPrimary: boolean;
  businessHoursMode: 'BASE' | 'OVERRIDE';
  businessHours: OrganizationSiteBusinessHourSnapshot[];
  businessHoursResolved: OrganizationSiteBusinessHourSnapshot[];
  assignments: OrganizationSiteAssignmentSnapshot[];
  responsibilities: OrganizationSiteResponsibilitySnapshot[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class OrganizationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<OrganizationSiteSummary[]> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const sites = await qr.manager.find(OrganizationSite, {
        where: { tenantId: ctx.tenantId },
        order: { name: 'ASC' },
      });

      return this.toSummaries(qr.manager, ctx.tenantId, sites);
    });
  }

  async create(
    dto: CreateOrganizationSiteDto,
    auditContext?: MutationAuditContext,
  ): Promise<OrganizationSiteDetail> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.ensureSiteCodeAvailable(qr.manager, ctx.tenantId, dto.code);
      await this.ensurePrimarySiteAvailability(qr.manager, ctx.tenantId, dto.isPrimary ?? false);

      const site = qr.manager.create(OrganizationSite, {
        tenantId: ctx.tenantId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        siteType: dto.siteType,
        address: dto.address?.trim() ?? null,
        municipality: dto.municipality?.trim() ?? null,
        department: dto.department?.trim() ?? null,
        country: dto.country?.trim().toUpperCase() ?? 'CO',
        latitude: this.toNumericColumn(dto.latitude),
        longitude: this.toNumericColumn(dto.longitude),
        isPrimary: dto.isPrimary ?? false,
        isActive: dto.isActive ?? true,
      });

      const saved = await qr.manager.save(OrganizationSite, site);

      if (dto.capabilities !== undefined) {
        await this.replaceCapabilitiesInTransaction(
          qr.manager,
          ctx.tenantId,
          saved.id,
          dto.capabilities,
        );
      }

      const detail = await this.loadSiteDetail(qr.manager, ctx.tenantId, saved.id);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.CREATE,
        entityType: 'organization_site',
        entityId: saved.id,
        oldValue: null,
        newValue: this.sanitizeSiteForAudit(detail),
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return detail;
    });
  }

  async findOne(id: string): Promise<OrganizationSiteDetail> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) =>
      this.loadSiteDetail(qr.manager, ctx.tenantId, id),
    );
  }

  async update(
    id: string,
    dto: UpdateOrganizationSiteDto,
    auditContext?: MutationAuditContext,
  ): Promise<OrganizationSiteDetail> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const existing = await this.findSiteEntity(qr.manager, ctx.tenantId, id);
      const before = await this.loadSiteDetail(qr.manager, ctx.tenantId, id);

      if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
        await this.ensureSiteCodeAvailable(qr.manager, ctx.tenantId, dto.code, id);
      }

      if (dto.isPrimary === true && !existing.isPrimary) {
        await this.ensurePrimarySiteAvailability(qr.manager, ctx.tenantId, true, id);
      }

      if (dto.name !== undefined) existing.name = dto.name.trim();
      if (dto.code !== undefined) existing.code = dto.code.trim().toUpperCase();
      if (dto.siteType !== undefined) existing.siteType = dto.siteType;
      if (dto.address !== undefined) existing.address = dto.address?.trim() ?? null;
      if (dto.municipality !== undefined) existing.municipality = dto.municipality?.trim() ?? null;
      if (dto.department !== undefined) existing.department = dto.department?.trim() ?? null;
      if (dto.country !== undefined) existing.country = dto.country.trim().toUpperCase();
      if (dto.latitude !== undefined) existing.latitude = this.toNumericColumn(dto.latitude);
      if (dto.longitude !== undefined) existing.longitude = this.toNumericColumn(dto.longitude);
      if (dto.isPrimary !== undefined) existing.isPrimary = dto.isPrimary;
      if (dto.isActive !== undefined) existing.isActive = dto.isActive;

      await qr.manager.save(OrganizationSite, existing);

      if (dto.capabilities !== undefined) {
        await this.replaceCapabilitiesInTransaction(qr.manager, ctx.tenantId, id, dto.capabilities);
      }

      const after = await this.loadSiteDetail(qr.manager, ctx.tenantId, id);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'organization_site',
        entityId: id,
        oldValue: this.sanitizeSiteForAudit(before),
        newValue: this.sanitizeSiteForAudit(after),
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return after;
    });
  }

  async remove(id: string, auditContext?: MutationAuditContext): Promise<void> {
    const ctx = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const existing = await this.findSiteEntity(qr.manager, ctx.tenantId, id);
      const before = await this.loadSiteDetail(qr.manager, ctx.tenantId, id);

      existing.isActive = false;
      await qr.manager.save(OrganizationSite, existing);
      await qr.manager.softRemove(OrganizationSite, existing);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.DELETE,
        entityType: 'organization_site',
        entityId: id,
        oldValue: this.sanitizeSiteForAudit(before),
        newValue: { id, isActive: false, deleted: true },
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });
    });
  }

  async replaceBusinessHours(
    id: string,
    dto: ReplaceSiteBusinessHoursDto,
    auditContext?: MutationAuditContext,
  ): Promise<OrganizationSiteDetail> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.findSiteEntity(qr.manager, ctx.tenantId, id);

      const previous = await qr.manager.find(OrganizationSiteBusinessHour, {
        where: { tenantId: ctx.tenantId, siteId: id },
        order: { weekday: 'ASC' },
      });

      await qr.manager.delete(OrganizationSiteBusinessHour, { tenantId: ctx.tenantId, siteId: id });

      if (dto.businessHours.length > 0) {
        await qr.manager.save(
          OrganizationSiteBusinessHour,
          dto.businessHours.map((entry) =>
            qr.manager.create(OrganizationSiteBusinessHour, {
              tenantId: ctx.tenantId,
              siteId: id,
              weekday: entry.weekday,
              isOpen: entry.isOpen,
              opensAt: entry.isOpen ? (entry.opensAt ?? null) : null,
              closesAt: entry.isOpen ? (entry.closesAt ?? null) : null,
            }),
          ),
        );
      }

      const after = await this.loadSiteDetail(qr.manager, ctx.tenantId, id);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'organization_site_business_hours',
        entityId: id,
        oldValue: { businessHours: previous.map((entry) => this.sanitizeBusinessHour(entry)) },
        newValue: { businessHours: after.businessHours },
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return after;
    });
  }

  async replaceAssignments(
    id: string,
    dto: ReplaceSiteAssignmentsDto,
    auditContext?: MutationAuditContext,
  ): Promise<OrganizationSiteDetail> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.findSiteEntity(qr.manager, ctx.tenantId, id);

      const previous = await qr.manager.find(OrganizationSiteAssignment, {
        where: { tenantId: ctx.tenantId, siteId: id, isActive: true },
        order: { validFrom: 'ASC' },
      });

      if (previous.length > 0) {
        const today = this.currentDate();
        previous.forEach((entry) => {
          entry.isActive = false;
          entry.validTo = entry.validTo ?? today;
        });
        await qr.manager.save(OrganizationSiteAssignment, previous);
      }

      if (dto.assignments.length > 0) {
        await qr.manager.save(
          OrganizationSiteAssignment,
          dto.assignments.map((entry) =>
            qr.manager.create(OrganizationSiteAssignment, {
              tenantId: ctx.tenantId,
              siteId: id,
              userId: entry.userId,
              assignmentType: entry.assignmentType,
              validFrom: entry.validFrom ?? this.currentDate(),
              validTo: entry.validTo ?? null,
              isActive: entry.isActive ?? true,
            }),
          ),
        );
      }

      const after = await this.loadSiteDetail(qr.manager, ctx.tenantId, id);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'organization_site_assignments',
        entityId: id,
        oldValue: { assignments: previous.map((entry) => this.sanitizeAssignment(entry)) },
        newValue: { assignments: after.assignments },
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return after;
    });
  }

  async replaceResponsibilities(
    id: string,
    dto: ReplaceSiteResponsibilitiesDto,
    auditContext?: MutationAuditContext,
  ): Promise<OrganizationSiteDetail> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.findSiteEntity(qr.manager, ctx.tenantId, id);

      const previous = await qr.manager.find(OrganizationSiteResponsibilityEntity, {
        where: { tenantId: ctx.tenantId, siteId: id, validTo: IsNull() },
        order: { validFrom: 'ASC' },
      });

      if (previous.length > 0) {
        const today = this.currentDate();
        previous.forEach((entry) => {
          entry.validTo = entry.validTo ?? today;
        });
        await qr.manager.save(OrganizationSiteResponsibilityEntity, previous);
      }

      if (dto.responsibilities.length > 0) {
        await qr.manager.save(
          OrganizationSiteResponsibilityEntity,
          dto.responsibilities.map((entry) =>
            qr.manager.create(OrganizationSiteResponsibilityEntity, {
              tenantId: ctx.tenantId,
              siteId: id,
              userId: entry.userId,
              responsibility: entry.responsibility,
              validFrom: entry.validFrom ?? this.currentDate(),
              validTo: entry.validTo ?? null,
            }),
          ),
        );
      }

      const after = await this.loadSiteDetail(qr.manager, ctx.tenantId, id);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'organization_site_responsibilities',
        entityId: id,
        oldValue: { responsibilities: previous.map((entry) => this.sanitizeResponsibility(entry)) },
        newValue: { responsibilities: after.responsibilities },
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return after;
    });
  }

  async listByCapabilityForTenant(
    input: ListOrganizationSitesByCapabilityInput,
  ): Promise<OrganizationSiteSummary[]> {
    const ctx = TenantContext.getOrThrow();

    if (ctx.tenantId !== input.tenantId) {
      throw new BadRequestException({
        code: 'TENANT_CONTEXT_MISMATCH',
        message: 'El tenant solicitado no coincide con el contexto autenticado.',
      });
    }

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const capabilities = await qr.manager.find(OrganizationSiteCapabilityEntity, {
        where: {
          tenantId: ctx.tenantId,
          capability: input.capability,
          isEnabled: true,
        },
      });

      if (capabilities.length === 0) {
        return [];
      }

      const siteIds = capabilities.map((entry) => entry.siteId);
      const sites = await qr.manager.find(OrganizationSite, {
        where: { tenantId: ctx.tenantId, id: In(siteIds), isActive: true },
        order: { name: 'ASC' },
      });

      return this.toSummaries(qr.manager, ctx.tenantId, sites);
    });
  }

  private async toSummaries(
    manager: EntityManager,
    tenantId: string,
    sites: OrganizationSite[],
  ): Promise<OrganizationSiteSummary[]> {
    if (sites.length === 0) {
      return [];
    }

    const siteIds = sites.map((site) => site.id);
    const capabilities = await manager.find(OrganizationSiteCapabilityEntity, {
      where: { tenantId, siteId: In(siteIds), isEnabled: true },
      order: { capability: 'ASC' },
    });

    const groupedCapabilities = new Map<string, OrganizationSiteCapability[]>();
    capabilities.forEach((entry) => {
      const values = groupedCapabilities.get(entry.siteId) ?? [];
      values.push(entry.capability);
      groupedCapabilities.set(entry.siteId, values);
    });

    return sites.map((site) => ({
      id: site.id,
      name: site.name,
      code: site.code,
      capabilities: groupedCapabilities.get(site.id) ?? [],
      isActive: site.isActive,
    }));
  }

  private async loadSiteDetail(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<OrganizationSiteDetail> {
    const site = await this.findSiteEntity(manager, tenantId, id);
    const [capabilities, siteBusinessHours, companyBusinessHours, assignments, responsibilities] =
      await Promise.all([
        manager.find(OrganizationSiteCapabilityEntity, {
          where: { tenantId, siteId: id, isEnabled: true },
          order: { capability: 'ASC' },
        }),
        manager.find(OrganizationSiteBusinessHour, {
          where: { tenantId, siteId: id },
          order: { weekday: 'ASC' },
        }),
        manager.find(OrganizationCompanyBusinessHours, {
          where: { tenantId },
          order: { weekday: 'ASC' },
        }),
        manager.find(OrganizationSiteAssignment, {
          where: { tenantId, siteId: id, isActive: true },
          order: { validFrom: 'ASC' },
        }),
        manager.find(OrganizationSiteResponsibilityEntity, {
          where: { tenantId, siteId: id, validTo: IsNull() },
          order: { validFrom: 'ASC' },
        }),
      ]);

    const businessHoursMode: 'BASE' | 'OVERRIDE' =
      siteBusinessHours.length > 0 ? 'OVERRIDE' : 'BASE';

    const businessHoursResolved =
      businessHoursMode === 'OVERRIDE'
        ? siteBusinessHours.map((entry) => this.sanitizeBusinessHour(entry))
        : companyBusinessHours.map((entry) => ({
            weekday: entry.weekday,
            isOpen: entry.isOpen,
            opensAt: entry.opensAt,
            closesAt: entry.closesAt,
          }));

    return {
      id: site.id,
      name: site.name,
      code: site.code,
      capabilities: capabilities.map((entry) => entry.capability),
      isActive: site.isActive,
      siteType: site.siteType,
      address: site.address,
      municipality: site.municipality,
      department: site.department,
      country: site.country,
      latitude: this.toNumber(site.latitude),
      longitude: this.toNumber(site.longitude),
      isPrimary: site.isPrimary,
      businessHoursMode,
      businessHours: siteBusinessHours.map((entry) => this.sanitizeBusinessHour(entry)),
      businessHoursResolved,
      assignments: assignments.map((entry) => this.sanitizeAssignment(entry)),
      responsibilities: responsibilities.map((entry) => this.sanitizeResponsibility(entry)),
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    };
  }

  private async findSiteEntity(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<OrganizationSite> {
    const site = await manager.findOne(OrganizationSite, { where: { tenantId, id } });
    if (!site) {
      throw new NotFoundException(`Sede ${id} no encontrada.`);
    }
    return site;
  }

  private async ensureSiteCodeAvailable(
    manager: EntityManager,
    tenantId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await manager.findOne(OrganizationSite, {
      where: { tenantId, code: code.trim().toUpperCase() },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Ya existe una sede activa con ese código.');
    }
  }

  private async ensurePrimarySiteAvailability(
    manager: EntityManager,
    tenantId: string,
    isPrimary: boolean,
    excludeId?: string,
  ): Promise<void> {
    if (!isPrimary) {
      return;
    }

    const currentPrimary = await manager.findOne(OrganizationSite, {
      where: { tenantId, isPrimary: true },
    });

    if (currentPrimary && currentPrimary.id !== excludeId) {
      throw new ConflictException('Ya existe una sede primaria activa para este tenant.');
    }
  }

  private async replaceCapabilitiesInTransaction(
    manager: EntityManager,
    tenantId: string,
    siteId: string,
    capabilities: OrganizationSiteCapability[],
  ): Promise<void> {
    await manager.delete(OrganizationSiteCapabilityEntity, { tenantId, siteId });

    if (capabilities.length === 0) {
      return;
    }

    await manager.save(
      OrganizationSiteCapabilityEntity,
      capabilities.map((capability) =>
        manager.create(OrganizationSiteCapabilityEntity, {
          tenantId,
          siteId,
          capability,
          isEnabled: true,
        }),
      ),
    );
  }

  private sanitizeSiteForAudit(site: OrganizationSiteDetail) {
    return {
      id: site.id,
      name: site.name,
      code: site.code,
      siteType: site.siteType,
      address: site.address,
      municipality: site.municipality,
      department: site.department,
      country: site.country,
      latitude: site.latitude,
      longitude: site.longitude,
      isPrimary: site.isPrimary,
      isActive: site.isActive,
      capabilities: site.capabilities,
      businessHours: site.businessHours,
      assignments: site.assignments,
      responsibilities: site.responsibilities,
    };
  }

  private sanitizeBusinessHour(
    entry: OrganizationSiteBusinessHour,
  ): OrganizationSiteBusinessHourSnapshot {
    return {
      weekday: entry.weekday,
      isOpen: entry.isOpen,
      opensAt: entry.opensAt,
      closesAt: entry.closesAt,
    };
  }

  private sanitizeAssignment(
    entry: OrganizationSiteAssignment,
  ): OrganizationSiteAssignmentSnapshot {
    return {
      userId: entry.userId,
      assignmentType: entry.assignmentType,
      validFrom: entry.validFrom,
      validTo: entry.validTo,
      isActive: entry.isActive,
    };
  }

  private sanitizeResponsibility(
    entry: OrganizationSiteResponsibilityEntity,
  ): OrganizationSiteResponsibilitySnapshot {
    return {
      userId: entry.userId,
      responsibility: entry.responsibility,
      validFrom: entry.validFrom,
      validTo: entry.validTo,
    };
  }

  private toNumericColumn(value?: number | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    return value.toString();
  }

  private toNumber(value: string | null): number | null {
    return value === null ? null : Number(value);
  }

  private currentDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ─── Horario base empresa ──────────────────────────────────────────────────

  async getCompanyHours(): Promise<OrganizationSiteBusinessHourSnapshot[]> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const rows = await qr.manager.find(OrganizationCompanyBusinessHours, {
        where: { tenantId: ctx.tenantId },
        order: { weekday: 'ASC' },
      });

      return rows.map((entry) => ({
        weekday: entry.weekday,
        isOpen: entry.isOpen,
        opensAt: entry.opensAt,
        closesAt: entry.closesAt,
      }));
    });
  }

  async replaceCompanyHours(
    dto: ReplaceCompanyBusinessHoursDto,
    auditContext?: MutationAuditContext,
  ): Promise<OrganizationSiteBusinessHourSnapshot[]> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const previous = await qr.manager.find(OrganizationCompanyBusinessHours, {
        where: { tenantId: ctx.tenantId },
        order: { weekday: 'ASC' },
      });

      await qr.manager.delete(OrganizationCompanyBusinessHours, { tenantId: ctx.tenantId });

      if (dto.businessHours.length > 0) {
        await qr.manager.save(
          OrganizationCompanyBusinessHours,
          dto.businessHours.map((entry) =>
            qr.manager.create(OrganizationCompanyBusinessHours, {
              tenantId: ctx.tenantId,
              weekday: entry.weekday,
              isOpen: entry.isOpen,
              opensAt: entry.isOpen ? (entry.opensAt ?? null) : null,
              closesAt: entry.isOpen ? (entry.closesAt ?? null) : null,
            }),
          ),
        );
      }

      const after = await qr.manager.find(OrganizationCompanyBusinessHours, {
        where: { tenantId: ctx.tenantId },
        order: { weekday: 'ASC' },
      });

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'organization_company_business_hours',
        entityId: ctx.tenantId,
        oldValue: {
          businessHours: previous.map((e) => ({
            weekday: e.weekday,
            isOpen: e.isOpen,
            opensAt: e.opensAt,
            closesAt: e.closesAt,
          })),
        },
        newValue: {
          businessHours: after.map((e) => ({
            weekday: e.weekday,
            isOpen: e.isOpen,
            opensAt: e.opensAt,
            closesAt: e.closesAt,
          })),
        },
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return after.map((entry) => ({
        weekday: entry.weekday,
        isOpen: entry.isOpen,
        opensAt: entry.opensAt,
        closesAt: entry.closesAt,
      }));
    });
  }

  // ─── Override semanal de sede ──────────────────────────────────────────────

  async clearSiteOverride(
    siteId: string,
    auditContext?: MutationAuditContext,
  ): Promise<OrganizationSiteDetail> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      await this.findSiteEntity(qr.manager, ctx.tenantId, siteId);

      const previous = await qr.manager.find(OrganizationSiteBusinessHour, {
        where: { tenantId: ctx.tenantId, siteId },
        order: { weekday: 'ASC' },
      });

      if (previous.length > 0) {
        await qr.manager.delete(OrganizationSiteBusinessHour, {
          tenantId: ctx.tenantId,
          siteId,
        });

        await this.auditService.log({
          tenantId: ctx.tenantId,
          schemaName: ctx.schemaName,
          userId: auditContext?.userId ?? null,
          action: AuditAction.DELETE,
          entityType: 'organization_site_business_hours',
          entityId: siteId,
          oldValue: { businessHours: previous.map((e) => this.sanitizeBusinessHour(e)) },
          newValue: { businessHoursMode: 'BASE' },
          ipAddress: auditContext?.ipAddress ?? null,
          userAgent: auditContext?.userAgent ?? null,
          requestId: auditContext?.requestId ?? null,
        });
      }

      return this.loadSiteDetail(qr.manager, ctx.tenantId, siteId);
    });
  }

  // ─── Excepciones por fecha ─────────────────────────────────────────────────

  async getExceptions(siteId?: string): Promise<OrganizationBusinessHoursExceptionSnapshot[]> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const rows = await qr.manager.find(OrganizationBusinessHoursException, {
        where: siteId
          ? [
              { tenantId: ctx.tenantId, organizationSiteId: siteId },
              { tenantId: ctx.tenantId, organizationSiteId: IsNull() },
            ]
          : { tenantId: ctx.tenantId },
        order: { exceptionDate: 'ASC' },
      });

      return rows.map((e) => this.sanitizeException(e));
    });
  }

  async createException(
    dto: CreateBusinessHoursExceptionDto,
    auditContext?: MutationAuditContext,
  ): Promise<OrganizationBusinessHoursExceptionSnapshot> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      if (dto.organizationSiteId) {
        await this.findSiteEntity(qr.manager, ctx.tenantId, dto.organizationSiteId);
      }

      const exception = qr.manager.create(OrganizationBusinessHoursException, {
        tenantId: ctx.tenantId,
        organizationSiteId: dto.organizationSiteId ?? null,
        exceptionDate: dto.exceptionDate,
        isRecurring: dto.isRecurring ?? false,
        isOpen: dto.isOpen,
        opensAt: dto.isOpen ? (dto.opensAt ?? null) : null,
        closesAt: dto.isOpen ? (dto.closesAt ?? null) : null,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
      });

      const saved = await qr.manager.save(OrganizationBusinessHoursException, exception);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.CREATE,
        entityType: 'organization_business_hours_exception',
        entityId: saved.id,
        oldValue: null,
        newValue: this.sanitizeException(saved),
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return this.sanitizeException(saved);
    });
  }

  async updateException(
    id: string,
    dto: UpdateBusinessHoursExceptionDto,
    auditContext?: MutationAuditContext,
  ): Promise<OrganizationBusinessHoursExceptionSnapshot> {
    const ctx = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const existing = await qr.manager.findOne(OrganizationBusinessHoursException, {
        where: { tenantId: ctx.tenantId, id },
      });

      if (!existing) {
        throw new NotFoundException(`Excepción ${id} no encontrada.`);
      }

      const before = this.sanitizeException(existing);

      if (dto.exceptionDate !== undefined) existing.exceptionDate = dto.exceptionDate;
      if (dto.isRecurring !== undefined) existing.isRecurring = dto.isRecurring;
      if (dto.isOpen !== undefined) existing.isOpen = dto.isOpen;
      if (dto.name !== undefined) existing.name = dto.name.trim();
      if (dto.description !== undefined) existing.description = dto.description?.trim() ?? null;

      if (existing.isOpen) {
        if (dto.opensAt !== undefined) existing.opensAt = dto.opensAt ?? null;
        if (dto.closesAt !== undefined) existing.closesAt = dto.closesAt ?? null;
      } else {
        existing.opensAt = null;
        existing.closesAt = null;
      }

      const saved = await qr.manager.save(OrganizationBusinessHoursException, existing);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'organization_business_hours_exception',
        entityId: id,
        oldValue: before,
        newValue: this.sanitizeException(saved),
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });

      return this.sanitizeException(saved);
    });
  }

  async deleteException(id: string, auditContext?: MutationAuditContext): Promise<void> {
    const ctx = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const existing = await qr.manager.findOne(OrganizationBusinessHoursException, {
        where: { tenantId: ctx.tenantId, id },
      });

      if (!existing) {
        throw new NotFoundException(`Excepción ${id} no encontrada.`);
      }

      await qr.manager.remove(OrganizationBusinessHoursException, existing);

      await this.auditService.log({
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        userId: auditContext?.userId ?? null,
        action: AuditAction.DELETE,
        entityType: 'organization_business_hours_exception',
        entityId: id,
        oldValue: this.sanitizeException(existing),
        newValue: null,
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        requestId: auditContext?.requestId ?? null,
      });
    });
  }

  private sanitizeException(
    entry: OrganizationBusinessHoursException,
  ): OrganizationBusinessHoursExceptionSnapshot {
    return {
      id: entry.id,
      organizationSiteId: entry.organizationSiteId,
      exceptionDate:
        typeof entry.exceptionDate === 'string'
          ? entry.exceptionDate
          : (entry.exceptionDate as unknown as Date).toISOString().slice(0, 10),
      isRecurring: entry.isRecurring,
      isOpen: entry.isOpen,
      opensAt: entry.opensAt,
      closesAt: entry.closesAt,
      name: entry.name,
      description: entry.description,
      createdAt: entry.createdAt,
    };
  }
}
