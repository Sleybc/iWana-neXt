import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { MediaUsage, Tenant, runInTenantSchema } from '@iwana/db';
import type { MediaThemeVariant } from '@iwana/db';
import { AuditAction, TenantStatus } from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import type { MediaAssetResponseDto } from '../media/dto/media-asset-response.dto';
import { REDIS_CLIENT } from '../redis/redis.module';
import { CreateTenantDto, TenantResponseDto, UpdateTenantDto } from './dto/tenant.dto';
import { TenantSettingsResponseDto, UpdateTenantSettingsDto } from './dto/tenant-settings.dto';
import {
  TenantPublicBrandingResponseDto,
  TenantSelfResponseDto,
  TenantSelfSettingsResponseDto,
} from './dto/tenant-self.dto';
import { TenantPublicBrandingDto, UploadTenantBrandingAssetDto } from './dto/tenant-branding.dto';
import {
  UpdateTenantSelfBrandingDto,
  UpdateTenantSelfProfileDto,
  UpdateTenantSelfSettingsDto,
} from './dto/tenant-self-update.dto';
import {
  CreateCommercialNodeDto,
  CreateCoverageZoneDto,
  CoverageAdminResponseDto,
  CoverageCheckResponseDto,
  UpdateCommercialNodeDto,
  UpdateCoverageZoneDto,
} from './dto/tenant-commercial-coverage.dto';
import {
  CreatePlanCatalogItemDto,
  PlanCatalogItemResponseDto,
  UpdatePlanCatalogItemDto,
} from './dto/tenant-plan-catalog.dto';
import {
  CreateAdditionalProductDto,
  UpdateAdditionalProductDto,
  AdditionalProductResponseDto,
} from './dto/tenant-additional-products.dto';
import { AdditionalProduct } from './entities/additional-product.entity';
import { CommercialNode } from './entities/commercial-node.entity';
import { CoverageZone } from './entities/coverage-zone.entity';
import { PlanCatalogItem } from './entities/plan-catalog-item.entity';

const TENANT_CACHE_TTL_SECONDS = 5 * 60;

type BrandingUrlKey =
  | 'logoLightUrl'
  | 'logoDarkUrl'
  | 'sealLightUrl'
  | 'sealDarkUrl'
  | 'faviconLightUrl'
  | 'faviconDarkUrl'
  | 'loginBackgroundLightUrl'
  | 'loginBackgroundDarkUrl';

type BrandingAssetKey =
  | 'logoLightAssetId'
  | 'logoDarkAssetId'
  | 'sealLightAssetId'
  | 'sealDarkAssetId'
  | 'faviconLightAssetId'
  | 'faviconDarkAssetId'
  | 'loginBackgroundLightAssetId'
  | 'loginBackgroundDarkAssetId';

interface BrandingSlotConfig {
  usage: MediaUsage;
  themeVariant: NonNullable<MediaThemeVariant>;
  urlKey: BrandingUrlKey;
  assetKey: BrandingAssetKey;
}

const BRANDING_SLOT_CONFIGS: BrandingSlotConfig[] = [
  {
    usage: MediaUsage.LOGO,
    themeVariant: 'light',
    urlKey: 'logoLightUrl',
    assetKey: 'logoLightAssetId',
  },
  {
    usage: MediaUsage.LOGO,
    themeVariant: 'dark',
    urlKey: 'logoDarkUrl',
    assetKey: 'logoDarkAssetId',
  },
  {
    usage: MediaUsage.SEAL,
    themeVariant: 'light',
    urlKey: 'sealLightUrl',
    assetKey: 'sealLightAssetId',
  },
  {
    usage: MediaUsage.SEAL,
    themeVariant: 'dark',
    urlKey: 'sealDarkUrl',
    assetKey: 'sealDarkAssetId',
  },
  {
    usage: MediaUsage.FAVICON,
    themeVariant: 'light',
    urlKey: 'faviconLightUrl',
    assetKey: 'faviconLightAssetId',
  },
  {
    usage: MediaUsage.FAVICON,
    themeVariant: 'dark',
    urlKey: 'faviconDarkUrl',
    assetKey: 'faviconDarkAssetId',
  },
  {
    usage: MediaUsage.LOGIN_BACKGROUND,
    themeVariant: 'light',
    urlKey: 'loginBackgroundLightUrl',
    assetKey: 'loginBackgroundLightAssetId',
  },
  {
    usage: MediaUsage.LOGIN_BACKGROUND,
    themeVariant: 'dark',
    urlKey: 'loginBackgroundDarkUrl',
    assetKey: 'loginBackgroundDarkAssetId',
  },
];

const DEFAULT_TENANT_SETTINGS = {
  timezone: 'America/Bogota',
  currency: 'COP',
  language: 'es-CO',
  country: 'CO',
  features: {
    billing: false,
    mfa_required_all: false,
  },
};

interface TenantListFilters {
  status?: TenantStatus;
  search?: string;
}

interface EffectiveTenantBrandingMetadata {
  displayName: string;
  productName: string;
  surfaceName: string;
  metadataTitle: string;
  metadataDescription: string;
}

/**
 * Servicio de gestion de tenants (ISPs clientes).
 *
 * Responsabilidades Sprint 1:
 * - CRUD completo de tenants en public.tenants
 * - Derivacion y validacion del schema_name a partir del slug
 *
 * El provisioning real del schema y el seed inicial viven fuera de este servicio:
 * - TenantController crea el tenant y luego encola provisioning via BullMQ.
 * - El worker ejecuta tenant_template.sql y el seed inicial del ADMIN.
 * - Este servicio conserva la logica CRUD y de configuracion sobre public.tenants.
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/tenant)
 * - ADR-017: Multi-tenant schema-per-tenant isolation
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly auditService: AuditService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * Crea un tenant nuevo.
   *
   * El schemaName se deriva del slug con prefijo "tenant_" y guiones
   * convertidos a guiones_bajos (ej: "mi-isp" → "tenant_mi_isp").
   * El provisioning del schema PostgreSQL real se delega al worker BullMQ.
   */
  async create(dto: CreateTenantDto): Promise<TenantResponseDto> {
    const schemaName = this.buildSchemaName(dto.slug);

    // Verificar unicidad antes de insertar para devolver error comprensible
    const existing = await this.tenantRepo.findOne({
      where: [{ slug: dto.slug }, { schemaName }],
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un tenant con slug "${dto.slug}" o schema_name "${schemaName}".`,
      );
    }

    const requestedSettings = dto.settings ?? {};
    const requestedFeatures = requestedSettings.features ?? {};
    const validatedSettings: Record<string, unknown> = {
      timezone: requestedSettings.timezone ?? DEFAULT_TENANT_SETTINGS.timezone,
      currency: requestedSettings.currency ?? DEFAULT_TENANT_SETTINGS.currency,
      language: requestedSettings.language ?? DEFAULT_TENANT_SETTINGS.language,
      country: requestedSettings.country ?? DEFAULT_TENANT_SETTINGS.country,
      features: {
        billing: requestedFeatures.billing ?? DEFAULT_TENANT_SETTINGS.features.billing,
        mfa_required_all:
          requestedFeatures.mfa_required_all ?? DEFAULT_TENANT_SETTINGS.features.mfa_required_all,
      },
    };

    const tenant = this.tenantRepo.create({
      name: dto.name,
      slug: dto.slug,
      schemaName,
      contactEmail: dto.contactEmail,
      maxSubscribers: dto.maxSubscribers ?? null,
      settings: validatedSettings,
      status: TenantStatus.PROVISIONING, // El worker lo activa a ACTIVE post-provisioning
      // Datos legales opcionales
      legalName: dto.legalName ?? null,
      nit: dto.nit ?? null,
      nitDv: dto.nitDv ?? null,
      companyType: dto.companyType ?? null,
      // Dirección opcional
      address: dto.address ?? null,
      city: dto.city ?? null,
      department: dto.department ?? null,
      countryCode: dto.countryCode ?? 'CO',
      postalCode: dto.postalCode ?? null,
      coordinates: dto.coordinates ?? null,
      // Contacto adicional opcional
      phone: dto.phone ?? null,
      website: dto.website ?? null,
      economicSector: dto.economicSector ?? null,
    });

    const saved = await this.tenantRepo.save(tenant);
    await this.cacheTenant(saved);
    this.logger.log(`Tenant creado: id=${saved.id} slug=${saved.slug}`);

    return this.toResponseDto(saved);
  }

  /** Lista tenants con paginación y filtros operativos de plataforma. */
  async findAll(
    limit = 50,
    offset = 0,
    filters: TenantListFilters = {},
  ): Promise<{ data: TenantResponseDto[]; total: number }> {
    if (filters.status || filters.search?.trim()) {
      const queryBuilder = this.tenantRepo
        .createQueryBuilder('tenant')
        .orderBy('tenant.createdAt', 'DESC')
        .take(limit)
        .skip(offset);

      if (filters.status) {
        queryBuilder.andWhere('tenant.status = :status', { status: filters.status });
      }

      if (filters.search?.trim()) {
        queryBuilder.andWhere(
          '(tenant.name ILIKE :search OR tenant.slug ILIKE :search OR tenant.contactEmail ILIKE :search)',
          { search: `%${filters.search.trim()}%` },
        );
      }

      const [tenants, total] = await queryBuilder.getManyAndCount();

      return {
        data: tenants.map((t) => this.toResponseDto(t)),
        total,
      };
    }

    const [tenants, total] = await this.tenantRepo.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      data: tenants.map((t) => this.toResponseDto(t)),
      total,
    };
  }

  /** Busca un tenant por su UUID */
  async findOne(id: string): Promise<TenantResponseDto> {
    const tenant = await this.findTenantEntityById(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${id}" no encontrado.`);
    }
    return this.toResponseDto(tenant);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SELF-SERVICE DEL TENANT AUTENTICADO
  // HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.2
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Retorna datos base del tenant para el panel empresarial (self-service).
   * Expone solo los campos no sensibles relevantes para el dashboard.
   */
  async getTenantSelf(tenantId: string): Promise<TenantSelfResponseDto> {
    const tenant = await this.findTenantEntityById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
    }
    return this.toSelfResponseDto(tenant);
  }

  /**
   * Retorna el branding público consumido por el login del portal.
   * Solo expone URLs resolubles y el nombre comercial del tenant activo.
   */
  async getTenantPublicBranding(slug: string): Promise<TenantPublicBrandingResponseDto> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) {
      throw new BadRequestException('slug es requerido.');
    }

    const tenant = await this.findBySlug(normalizedSlug);
    if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
      throw new NotFoundException(`Tenant con slug "${normalizedSlug}" no encontrado.`);
    }

    return this.toPublicBrandingDto(tenant);
  }

  /**
   * Retorna la configuración operativa del tenant autenticado (self-service).
   * Aplica defaults para claves faltantes — nunca devuelve undefined.
   */
  async getTenantSelfSettings(tenantId: string): Promise<TenantSelfSettingsResponseDto> {
    const tenant = await this.findTenantEntityById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
    }
    return this.toSelfSettingsDto(tenant);
  }

  /**
   * Actualiza solo campos tenant-managed del perfil empresarial self-service.
   * `name`, `slug` y `status` permanecen fuera del alcance hasta confirmación de ownership.
   */
  async updateTenantSelfProfile(
    tenantId: string,
    dto: UpdateTenantSelfProfileDto,
    actorUserId?: string,
  ): Promise<TenantSelfResponseDto> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
    }

    const oldValue = this.toSelfResponseDto(tenant);

    if (dto.contactEmail !== undefined) tenant.contactEmail = dto.contactEmail;
    if (dto.legalName !== undefined) tenant.legalName = dto.legalName ?? null;
    if (dto.nit !== undefined) tenant.nit = dto.nit ?? null;
    if (dto.city !== undefined) tenant.city = dto.city ?? null;
    if (dto.department !== undefined) tenant.department = dto.department ?? null;
    if (dto.countryCode !== undefined) tenant.countryCode = dto.countryCode ?? null;
    if (dto.phone !== undefined) tenant.phone = dto.phone ?? null;
    if (dto.website !== undefined) tenant.website = dto.website ?? null;

    const saved = await this.tenantRepo.save(tenant);
    await this.invalidateTenantCache(saved.id, saved.slug);
    await this.cacheTenant(saved);

    const newValue = this.toSelfResponseDto(saved);

    await this.auditService.log({
      tenantId: saved.id,
      schemaName: saved.schemaName,
      userId: actorUserId ?? null,
      action: AuditAction.UPDATE,
      entityType: 'TenantProfile',
      entityId: saved.id,
      oldValue: oldValue as unknown as Record<string, unknown>,
      newValue: newValue as unknown as Record<string, unknown>,
    });

    return newValue;
  }

  /**
   * Actualiza solo settings tenant-managed del portal empresarial.
   * Cualquier campo de plataforma queda fuera del contrato self-service.
   */
  async updateTenantSelfSettings(
    tenantId: string,
    dto: UpdateTenantSelfSettingsDto,
    actorUserId?: string,
  ): Promise<TenantSelfSettingsResponseDto> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
    }

    if (dto.timezone !== undefined) {
      this.assertValidTimezone(dto.timezone);
    }

    const oldValue = this.toSelfSettingsDto(tenant);
    const currentSettings = this.asRecord(tenant.settings);
    const currentFeatures = this.asRecord(currentSettings['features']);

    tenant.settings = {
      ...currentSettings,
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.language !== undefined ? { language: dto.language } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.features
        ? {
            features: {
              ...currentFeatures,
              ...(dto.features.mfa_required_all !== undefined
                ? { mfa_required_all: dto.features.mfa_required_all }
                : {}),
            },
          }
        : {}),
    };

    const saved = await this.tenantRepo.save(tenant);
    await this.invalidateTenantCache(saved.id, saved.slug);
    await this.cacheTenant(saved);

    const newValue = this.toSelfSettingsDto(saved);

    await this.auditService.log({
      tenantId: saved.id,
      schemaName: saved.schemaName,
      userId: actorUserId ?? null,
      action: AuditAction.UPDATE,
      entityType: 'TenantSettings',
      entityId: saved.id,
      oldValue: oldValue as unknown as Record<string, unknown>,
      newValue: newValue as unknown as Record<string, unknown>,
    });

    return newValue;
  }

  /**
   * Actualiza solo campos de branding del tenant autenticado.
   * Campos de plataforma quedan fuera del contrato self-service.
   */
  async updateTenantSelfBranding(
    tenantId: string,
    dto: UpdateTenantSelfBrandingDto,
    actorUserId?: string,
  ): Promise<TenantSelfResponseDto> {
    const saved = await this.updateBrandingState(tenantId, dto, actorUserId);
    return this.toSelfResponseDto(saved);
  }

  /**
   * Actualiza branding de un tenant desde la consola de plataforma.
   * Reutiliza el mismo contrato híbrido URL/assetId del endpoint self-service.
   */
  async updateTenantBranding(
    tenantId: string,
    dto: UpdateTenantSelfBrandingDto,
    actorUserId?: string,
  ): Promise<TenantResponseDto> {
    const saved = await this.updateBrandingState(tenantId, dto, actorUserId);
    return this.toResponseDto(saved);
  }

  /**
   * Sube un asset de branding y lo asigna inmediatamente al slot correspondiente.
   */
  async uploadTenantBrandingAsset(
    tenantId: string,
    dto: UploadTenantBrandingAssetDto,
    file: Express.Multer.File,
    actorUserId?: string,
  ): Promise<MediaAssetResponseDto> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
    }

    const oldValue = this.toBrandingAuditPayload(tenant);
    const asset = await this.mediaService.upload(
      tenant.schemaName,
      { usage: dto.usage, themeVariant: dto.themeVariant },
      file,
      actorUserId,
    );

    const slotConfig = this.getBrandingSlotConfig(dto.usage, dto.themeVariant);
    await this.assignBrandingAssetToSlot(tenant, slotConfig, asset);

    const saved = await this.tenantRepo.save(tenant);
    await this.invalidateTenantCache(saved.id, saved.slug);
    await this.cacheTenant(saved);

    await this.auditService.log({
      tenantId: saved.id,
      schemaName: saved.schemaName,
      userId: actorUserId ?? null,
      action: AuditAction.UPDATE,
      entityType: 'TenantBranding',
      entityId: saved.id,
      oldValue: oldValue as unknown as Record<string, unknown>,
      newValue: this.toBrandingAuditPayload(saved) as unknown as Record<string, unknown>,
    });

    return asset;
  }

  /**
   * Devuelve la configuración comercial de cobertura para administración tenant.
   */
  async getCoverageAdmin(tenantId: string, schemaName: string): Promise<CoverageAdminResponseDto> {
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const nodes = await qr.manager.find(CommercialNode, {
          where: { tenantId },
          order: { createdAt: 'DESC' },
        });
        const zones = await qr.manager.find(CoverageZone, {
          where: { tenantId },
          order: { createdAt: 'DESC' },
        });

        return {
          nodes: nodes.map((item) => this.toCommercialNodeDto(item)),
          zones: zones.map((item) => this.toCoverageZoneDto(item)),
        };
      });
    } catch (error) {
      // Compatibilidad temporal: algunos tenants legacy aun no tienen tablas MOD03 en su schema.
      if (this.isTenantCommercialSchemaCompatibilityError(error)) {
        this.logger.warn(
          `Cobertura comercial no disponible en schema ${schemaName}. Se retorna configuración vacía hasta aplicar migraciones tenant.`,
        );
        return { nodes: [], zones: [] };
      }
      throw error;
    }
  }

  /**
   * Evalúa factibilidad comercial inicial sin invadir lógica de provisioning técnico.
   */
  async checkCoverage(
    tenantId: string,
    schemaName: string,
    address: string,
    latitude?: number,
    longitude?: number,
  ): Promise<CoverageCheckResponseDto> {
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const nodes = await qr.manager.find(CommercialNode, {
          where: { tenantId, isActive: true },
        });
        const zones = await qr.manager.find(CoverageZone, {
          where: { tenantId, isActive: true },
        });

        const matches: Array<{
          id: string;
          name: string;
          type: 'NODE' | 'ZONE';
          available: boolean;
        }> = [];

        if (latitude !== undefined && longitude !== undefined) {
          for (const node of nodes) {
            const distanceKm = this.calculateDistanceKm(
              latitude,
              longitude,
              node.latitude,
              node.longitude,
            );
            if (distanceKm <= 5) {
              matches.push({ id: node.id, name: node.name, type: 'NODE', available: true });
            }
          }

          for (const zone of zones) {
            const distanceKm = this.calculateDistanceKm(
              latitude,
              longitude,
              zone.centerLatitude,
              zone.centerLongitude,
            );
            if (distanceKm <= Number(zone.radiusKm)) {
              matches.push({ id: zone.id, name: zone.name, type: 'ZONE', available: true });
            }
          }
        }

        if (matches.length > 0) {
          return {
            available: true,
            reason: 'Cobertura comercial disponible para la ubicación consultada.',
            matches,
          };
        }

        return {
          available: false,
          reason:
            latitude !== undefined && longitude !== undefined
              ? 'No se encontró cobertura comercial activa para la ubicación consultada.'
              : `No hay cobertura comercial activa configurada para la dirección ${address}.`,
          matches: [],
        };
      });
    } catch (error) {
      if (this.isTenantCommercialSchemaCompatibilityError(error)) {
        this.logger.warn(
          `Validación de cobertura no disponible en schema ${schemaName}. Se retorna respuesta no viable por compatibilidad temporal.`,
        );
        return {
          available: false,
          reason:
            'La cobertura comercial aún no está habilitada para esta empresa. Aplica migraciones tenant y reintenta.',
          matches: [],
        };
      }
      throw error;
    }
  }

  /**
   * Crea un nodo comercial en el schema del tenant autenticado con auditoría.
   */
  async createCommercialNode(
    tenantId: string,
    schemaName: string,
    dto: CreateCommercialNodeDto,
    actorUserId?: string,
  ): Promise<CoverageAdminResponseDto> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(CommercialNode, {
        tenantId,
        name: dto.name,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isActive: dto.isActive ?? true,
      });
      const saved = await qr.manager.save(CommercialNode, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.CREATE,
        entityType: 'CommercialNode',
        entityId: saved.id,
        newValue: this.toCommercialNodeDto(saved) as unknown as Record<string, unknown>,
      });

      return this.getCoverageAdmin(tenantId, schemaName);
    });
  }

  /**
   * Actualiza un nodo comercial tenant-managed y registra delta de auditoría.
   */
  async updateCommercialNode(
    tenantId: string,
    schemaName: string,
    nodeId: string,
    dto: UpdateCommercialNodeDto,
    actorUserId?: string,
  ): Promise<CoverageAdminResponseDto> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(CommercialNode, {
        where: { id: nodeId, tenantId },
      });
      if (!entity) {
        throw new NotFoundException(`Nodo comercial con id "${nodeId}" no encontrado.`);
      }

      const oldValue = this.toCommercialNodeDto(entity);
      if (dto.name !== undefined) entity.name = dto.name;
      if (dto.latitude !== undefined) entity.latitude = dto.latitude;
      if (dto.longitude !== undefined) entity.longitude = dto.longitude;
      if (dto.isActive !== undefined) entity.isActive = dto.isActive;

      const saved = await qr.manager.save(CommercialNode, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'CommercialNode',
        entityId: saved.id,
        oldValue: oldValue as unknown as Record<string, unknown>,
        newValue: this.toCommercialNodeDto(saved) as unknown as Record<string, unknown>,
      });

      return this.getCoverageAdmin(tenantId, schemaName);
    });
  }

  async createCoverageZone(
    tenantId: string,
    schemaName: string,
    dto: CreateCoverageZoneDto,
    actorUserId?: string,
  ): Promise<CoverageAdminResponseDto> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(CoverageZone, {
        tenantId,
        name: dto.name,
        centerLatitude: dto.centerLatitude,
        centerLongitude: dto.centerLongitude,
        radiusKm: dto.radiusKm.toFixed(2),
        isActive: dto.isActive ?? true,
      });
      const saved = await qr.manager.save(CoverageZone, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.CREATE,
        entityType: 'CoverageZone',
        entityId: saved.id,
        newValue: this.toCoverageZoneDto(saved) as unknown as Record<string, unknown>,
      });

      return this.getCoverageAdmin(tenantId, schemaName);
    });
  }

  async updateCoverageZone(
    tenantId: string,
    schemaName: string,
    zoneId: string,
    dto: UpdateCoverageZoneDto,
    actorUserId?: string,
  ): Promise<CoverageAdminResponseDto> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(CoverageZone, {
        where: { id: zoneId, tenantId },
      });
      if (!entity) {
        throw new NotFoundException(`Zona de cobertura con id "${zoneId}" no encontrada.`);
      }

      const oldValue = this.toCoverageZoneDto(entity);
      if (dto.name !== undefined) entity.name = dto.name;
      if (dto.centerLatitude !== undefined) entity.centerLatitude = dto.centerLatitude;
      if (dto.centerLongitude !== undefined) entity.centerLongitude = dto.centerLongitude;
      if (dto.radiusKm !== undefined) entity.radiusKm = dto.radiusKm.toFixed(2);
      if (dto.isActive !== undefined) entity.isActive = dto.isActive;

      const saved = await qr.manager.save(CoverageZone, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'CoverageZone',
        entityId: saved.id,
        oldValue: oldValue as unknown as Record<string, unknown>,
        newValue: this.toCoverageZoneDto(saved) as unknown as Record<string, unknown>,
      });

      return this.getCoverageAdmin(tenantId, schemaName);
    });
  }

  /**
   * Soft-delete idempotente para nodos comerciales tenant-managed.
   */
  async removeCoverageNode(
    tenantId: string,
    schemaName: string,
    nodeId: string,
    actorUserId?: string,
  ): Promise<CoverageAdminResponseDto> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(CommercialNode, {
        where: { id: nodeId, tenantId },
        withDeleted: true,
      });
      if (!entity) {
        throw new NotFoundException(`Nodo comercial con id "${nodeId}" no encontrado.`);
      }

      if (entity.deletedAt) {
        return this.getCoverageAdmin(tenantId, schemaName);
      }

      const oldValue = this.toCommercialNodeDto(entity);
      entity.isActive = false;
      entity.deletedAt = new Date();

      await qr.manager.save(CommercialNode, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.DELETE,
        entityType: 'CommercialNode',
        entityId: entity.id,
        oldValue: oldValue as unknown as Record<string, unknown>,
        newValue: this.toCommercialNodeDto(entity) as unknown as Record<string, unknown>,
      });

      return this.getCoverageAdmin(tenantId, schemaName);
    });
  }

  /**
   * Soft-delete idempotente para zonas de cobertura tenant-managed.
   */
  async removeCoverageZone(
    tenantId: string,
    schemaName: string,
    zoneId: string,
    actorUserId?: string,
  ): Promise<CoverageAdminResponseDto> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(CoverageZone, {
        where: { id: zoneId, tenantId },
        withDeleted: true,
      });
      if (!entity) {
        throw new NotFoundException(`Zona de cobertura con id "${zoneId}" no encontrada.`);
      }

      if (entity.deletedAt) {
        return this.getCoverageAdmin(tenantId, schemaName);
      }

      const oldValue = this.toCoverageZoneDto(entity);
      entity.isActive = false;
      entity.deletedAt = new Date();

      await qr.manager.save(CoverageZone, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.DELETE,
        entityType: 'CoverageZone',
        entityId: entity.id,
        oldValue: oldValue as unknown as Record<string, unknown>,
        newValue: this.toCoverageZoneDto(entity) as unknown as Record<string, unknown>,
      });

      return this.getCoverageAdmin(tenantId, schemaName);
    });
  }

  /**
   * Retorna catálogo activo para consumo self-service y CRM read-only.
   */
  async getPlanCatalog(
    tenantId: string,
    schemaName: string,
  ): Promise<PlanCatalogItemResponseDto[]> {
    try {
      return await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const items = await qr.manager.find(PlanCatalogItem, {
          where: { tenantId },
          order: { createdAt: 'DESC' },
        });
        return items.map((item) => this.toPlanCatalogDto(item));
      });
    } catch (error) {
      if (this.isTenantCommercialSchemaCompatibilityError(error)) {
        this.logger.warn(
          `Catalogo comercial no disponible en schema ${schemaName}. Se retorna lista vacía hasta aplicar migraciones tenant.`,
        );
        return [];
      }
      throw error;
    }
  }

  async createPlanCatalogItem(
    tenantId: string,
    schemaName: string,
    dto: CreatePlanCatalogItemDto,
    actorUserId?: string,
  ): Promise<PlanCatalogItemResponseDto[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Regla comercial: installationRule faltante se interpreta como ALWAYS.
      // Si la regla es NONE, la instalacion siempre se cobra en 0 sin importar el payload.
      const installationRule = dto.installationRule ?? 'ALWAYS';
      const installationFee =
        installationRule === 'NONE' ? '0.00' : (dto.installationFee ?? 0).toFixed(2);

      const entity = qr.manager.create(PlanCatalogItem, {
        tenantId,
        name: dto.name,
        technology: dto.technology,
        installationRule,
        downloadSpeedMbps: dto.downloadSpeedMbps,
        uploadSpeedMbps: dto.uploadSpeedMbps,
        basePrice: dto.basePrice.toFixed(2),
        installationFee,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        isActive: dto.isActive ?? true,
      });

      const saved = await qr.manager.save(PlanCatalogItem, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.CREATE,
        entityType: 'PlanCatalogItem',
        entityId: saved.id,
        newValue: this.toPlanCatalogDto(saved) as unknown as Record<string, unknown>,
      });

      return this.getPlanCatalog(tenantId, schemaName);
    });
  }

  async updatePlanCatalogItem(
    tenantId: string,
    schemaName: string,
    planId: string,
    dto: UpdatePlanCatalogItemDto,
    actorUserId?: string,
  ): Promise<PlanCatalogItemResponseDto[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(PlanCatalogItem, {
        where: { id: planId, tenantId },
      });
      if (!entity) {
        throw new NotFoundException(`Plan con id "${planId}" no encontrado.`);
      }

      const oldValue = this.toPlanCatalogDto(entity);

      if (dto.name !== undefined) entity.name = dto.name;
      if (dto.technology !== undefined) entity.technology = dto.technology;
      if (dto.downloadSpeedMbps !== undefined) entity.downloadSpeedMbps = dto.downloadSpeedMbps;
      if (dto.uploadSpeedMbps !== undefined) entity.uploadSpeedMbps = dto.uploadSpeedMbps;
      if (dto.basePrice !== undefined) entity.basePrice = dto.basePrice.toFixed(2);
      if (dto.installationRule !== undefined) entity.installationRule = dto.installationRule;
      // La regla efectiva siempre manda sobre installationFee para evitar estados inconsistentes.
      if (entity.installationRule === 'NONE') {
        entity.installationFee = '0.00';
      } else if (dto.installationFee !== undefined) {
        entity.installationFee = dto.installationFee.toFixed(2);
      }
      if (dto.validFrom !== undefined)
        entity.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
      if (dto.validTo !== undefined) entity.validTo = dto.validTo ? new Date(dto.validTo) : null;
      if (dto.isActive !== undefined) entity.isActive = dto.isActive;

      const saved = await qr.manager.save(PlanCatalogItem, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'PlanCatalogItem',
        entityId: saved.id,
        oldValue: oldValue as unknown as Record<string, unknown>,
        newValue: this.toPlanCatalogDto(saved) as unknown as Record<string, unknown>,
      });

      return this.getPlanCatalog(tenantId, schemaName);
    });
  }

  /**
   * Soft-delete idempotente de plan del catálogo para el tenant autenticado.
   */
  async removePlanCatalogItem(
    tenantId: string,
    schemaName: string,
    planId: string,
    actorUserId?: string,
  ): Promise<PlanCatalogItemResponseDto[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(PlanCatalogItem, {
        where: { id: planId, tenantId },
        withDeleted: true,
      });
      if (!entity) {
        throw new NotFoundException(`Plan con id "${planId}" no encontrado.`);
      }

      if (entity.deletedAt) {
        return this.getPlanCatalog(tenantId, schemaName);
      }

      const oldValue = this.toPlanCatalogDto(entity);
      entity.isActive = false;
      entity.deletedAt = new Date();

      await qr.manager.save(PlanCatalogItem, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.DELETE,
        entityType: 'PlanCatalogItem',
        entityId: entity.id,
        oldValue: oldValue as unknown as Record<string, unknown>,
        newValue: this.toPlanCatalogDto(entity) as unknown as Record<string, unknown>,
      });

      return this.getPlanCatalog(tenantId, schemaName);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ADDITIONAL PRODUCTS
  // ══════════════════════════════════════════════════════════════════════════════

  async getAdditionalProducts(
    tenantId: string,
    schemaName: string,
  ): Promise<AdditionalProductResponseDto[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const items = await qr.manager.find(AdditionalProduct, {
        where: { tenantId },
        order: { category: 'ASC', sortOrder: 'ASC' },
      });
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        sortOrder: item.sortOrder,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    });
  }

  async createAdditionalProduct(
    tenantId: string,
    schemaName: string,
    dto: CreateAdditionalProductDto,
    actorUserId?: string,
  ): Promise<AdditionalProductResponseDto[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(AdditionalProduct, {
        tenantId,
        name: dto.name,
        category: dto.category,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      });

      const saved = await qr.manager.save(AdditionalProduct, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.CREATE,
        entityType: 'AdditionalProduct',
        entityId: saved.id,
        newValue: {
          id: saved.id,
          name: saved.name,
          category: saved.category,
          sortOrder: saved.sortOrder,
          isActive: saved.isActive,
        },
      });

      return this.getAdditionalProducts(tenantId, schemaName);
    });
  }

  async updateAdditionalProduct(
    tenantId: string,
    schemaName: string,
    productId: string,
    dto: UpdateAdditionalProductDto,
    actorUserId?: string,
  ): Promise<AdditionalProductResponseDto[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(AdditionalProduct, {
        where: { id: productId, tenantId },
      });
      if (!entity) {
        throw new NotFoundException(`Producto adicional con id "${productId}" no encontrado.`);
      }

      const oldValue = {
        id: entity.id,
        name: entity.name,
        category: entity.category,
        sortOrder: entity.sortOrder,
        isActive: entity.isActive,
      };

      if (dto.name !== undefined) entity.name = dto.name;
      if (dto.category !== undefined) entity.category = dto.category;
      if (dto.sortOrder !== undefined) entity.sortOrder = dto.sortOrder;
      if (dto.isActive !== undefined) entity.isActive = dto.isActive;

      const saved = await qr.manager.save(AdditionalProduct, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.UPDATE,
        entityType: 'AdditionalProduct',
        entityId: saved.id,
        oldValue,
        newValue: {
          id: saved.id,
          name: saved.name,
          category: saved.category,
          sortOrder: saved.sortOrder,
          isActive: saved.isActive,
        },
      });

      return this.getAdditionalProducts(tenantId, schemaName);
    });
  }

  async removeAdditionalProduct(
    tenantId: string,
    schemaName: string,
    productId: string,
    actorUserId?: string,
  ): Promise<AdditionalProductResponseDto[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(AdditionalProduct, {
        where: { id: productId, tenantId },
        withDeleted: true,
      });
      if (!entity) {
        throw new NotFoundException(`Producto adicional con id "${productId}" no encontrado.`);
      }

      if (entity.deletedAt) {
        return this.getAdditionalProducts(tenantId, schemaName);
      }

      const oldValue = {
        id: entity.id,
        name: entity.name,
        category: entity.category,
        sortOrder: entity.sortOrder,
        isActive: entity.isActive,
      };

      entity.isActive = false;
      entity.deletedAt = new Date();

      await qr.manager.save(AdditionalProduct, entity);

      await this.auditService.log({
        tenantId,
        schemaName,
        userId: actorUserId ?? null,
        action: AuditAction.DELETE,
        entityType: 'AdditionalProduct',
        entityId: entity.id,
        oldValue,
        newValue: { id: entity.id, name: entity.name, isActive: false },
      });

      return this.getAdditionalProducts(tenantId, schemaName);
    });
  }

  /** Mapea Tenant a TenantSelfResponseDto — solo campos del panel empresarial. */
  private toSelfResponseDto(tenant: Tenant): TenantSelfResponseDto {
    const dto = new TenantSelfResponseDto();
    dto.id = tenant.id;
    dto.name = tenant.name;
    dto.slug = tenant.slug;
    dto.status = tenant.status;
    dto.contactEmail = tenant.contactEmail;
    dto.legalName = tenant.legalName ?? null;
    dto.nit = tenant.nit ?? null;
    dto.nitDv = tenant.nitDv ?? null;
    dto.city = tenant.city ?? null;
    dto.department = tenant.department ?? null;
    dto.countryCode = tenant.countryCode ?? null;
    dto.phone = tenant.phone ?? null;
    dto.website = tenant.website ?? null;
    dto.createdAt = tenant.createdAt;
    // Branding
    dto.logoLightUrl = tenant.logoLightUrl ?? null;
    dto.logoLightAssetId = tenant.logoLightAssetId ?? null;
    dto.logoDarkUrl = tenant.logoDarkUrl ?? null;
    dto.logoDarkAssetId = tenant.logoDarkAssetId ?? null;
    dto.sealLightUrl = tenant.sealLightUrl ?? null;
    dto.sealLightAssetId = tenant.sealLightAssetId ?? null;
    dto.sealDarkUrl = tenant.sealDarkUrl ?? null;
    dto.sealDarkAssetId = tenant.sealDarkAssetId ?? null;
    dto.faviconLightUrl = tenant.faviconLightUrl ?? null;
    dto.faviconLightAssetId = tenant.faviconLightAssetId ?? null;
    dto.faviconDarkUrl = tenant.faviconDarkUrl ?? null;
    dto.faviconDarkAssetId = tenant.faviconDarkAssetId ?? null;
    dto.loginBackgroundLightUrl = tenant.loginBackgroundLightUrl ?? null;
    dto.loginBackgroundLightAssetId = tenant.loginBackgroundLightAssetId ?? null;
    dto.loginBackgroundDarkUrl = tenant.loginBackgroundDarkUrl ?? null;
    dto.loginBackgroundDarkAssetId = tenant.loginBackgroundDarkAssetId ?? null;
    dto.showTenantName = tenant.showTenantName ?? true;
    dto.brandingProductName = tenant.brandingProductName ?? null;
    dto.brandingSurfaceName = tenant.brandingSurfaceName ?? null;
    dto.brandingMetadataTitle = tenant.brandingMetadataTitle ?? null;
    dto.brandingMetadataDescription = tenant.brandingMetadataDescription ?? null;
    return dto;
  }

  private toPublicBrandingDto(tenant: Tenant): TenantPublicBrandingDto {
    const metadata = this.resolveEffectiveBrandingMetadata(tenant);

    return {
      displayName: metadata.displayName,
      productName: metadata.productName,
      surfaceName: metadata.surfaceName,
      metadataTitle: metadata.metadataTitle,
      metadataDescription: metadata.metadataDescription,
      showTenantName: tenant.showTenantName ?? true,
      logoLightUrl: tenant.logoLightUrl ?? null,
      logoDarkUrl: tenant.logoDarkUrl ?? null,
      sealLightUrl: tenant.sealLightUrl ?? null,
      sealDarkUrl: tenant.sealDarkUrl ?? null,
      faviconLightUrl: tenant.faviconLightUrl ?? null,
      faviconDarkUrl: tenant.faviconDarkUrl ?? null,
      loginBackgroundLightUrl: tenant.loginBackgroundLightUrl ?? null,
      loginBackgroundDarkUrl: tenant.loginBackgroundDarkUrl ?? null,
    };
  }

  private toCommercialNodeDto(entity: CommercialNode) {
    return {
      id: entity.id,
      name: entity.name,
      latitude: entity.latitude,
      longitude: entity.longitude,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toCoverageZoneDto(entity: CoverageZone) {
    return {
      id: entity.id,
      name: entity.name,
      centerLatitude: entity.centerLatitude,
      centerLongitude: entity.centerLongitude,
      radiusKm: Number(entity.radiusKm),
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toPlanCatalogDto(entity: PlanCatalogItem): PlanCatalogItemResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      technology: entity.technology,
      installationRule: entity.installationRule,
      downloadSpeedMbps: entity.downloadSpeedMbps,
      uploadSpeedMbps: entity.uploadSpeedMbps,
      basePrice: Number(entity.basePrice),
      installationFee: Number(entity.installationFee),
      validFrom: entity.validFrom,
      validTo: entity.validTo,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private calculateDistanceKm(latA: number, lonA: number, latB: number, lonB: number): number {
    const earthRadiusKm = 6371;
    const dLat = this.toRadians(latB - latA);
    const dLon = this.toRadians(lonB - lonA);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(latA)) *
        Math.cos(this.toRadians(latB)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  private isTenantCommercialSchemaCompatibilityError(error: unknown): boolean {
    const pgCode = this.extractPgErrorCode(error);
    return pgCode === '42P01' || pgCode === '42703';
  }

  private extractPgErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const visited = new Set<object>();
    const stack: Array<Record<string, unknown>> = [error as Record<string, unknown>];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (typeof current.code === 'string') {
        return current.code;
      }

      if (current.driverError && typeof current.driverError === 'object') {
        stack.push(current.driverError as Record<string, unknown>);
      }

      if (current.cause && typeof current.cause === 'object') {
        stack.push(current.cause as Record<string, unknown>);
      }
    }

    return undefined;
  }

  /** Normaliza configuración operativa aplicando defaults. */
  private toSelfSettingsDto(tenant: Tenant): TenantSelfSettingsResponseDto {
    const settings = this.asRecord(tenant.settings);
    const features = this.asRecord(settings['features']);
    const dto = new TenantSelfSettingsResponseDto();
    dto.timezone = String(settings['timezone'] ?? 'America/Bogota');
    dto.currency = String(settings['currency'] ?? 'COP');
    dto.language = String(settings['language'] ?? 'es-CO');
    dto.country = String(settings['country'] ?? 'CO');
    dto.fiberInstallationThresholdMeters = Number(
      settings['fiberInstallationThresholdMeters'] ?? 50,
    );
    dto.features = {
      billing: Boolean(features['billing'] ?? false),
      mfa_required_all: Boolean(features['mfa_required_all'] ?? false),
    };
    return dto;
  }

  /** Busca un tenant por su slug — usado en TenantMiddleware */
  async findBySlug(slug: string): Promise<Tenant | null> {
    const cachedTenant = await this.getCachedTenant(this.buildSlugCacheKey(slug));
    if (cachedTenant) {
      return cachedTenant;
    }

    const tenant = await this.tenantRepo.findOne({ where: { slug } });
    if (tenant) {
      await this.cacheTenant(tenant);
    }
    return tenant;
  }

  /**
   * Busca un tenant por UUID devolviendo la entidad completa.
   * Se usa en el resolver de contexto cuando el JWT ya trae tenantId + schemaName.
   */
  async findById(id: string): Promise<Tenant | null> {
    return this.findTenantEntityById(id);
  }

  /**
   * Actualiza datos de un tenant existente.
   *
   * INMUTABLE: slug y schemaName no se pueden modificar post-creacion.
   * Si se intenta cambiar el status a SUSPENDED, se registra en auditoria
   * (implementado en Sprint 1 Semana 2+ via AuditInterceptor).
   */
  async update(id: string, dto: UpdateTenantDto): Promise<TenantResponseDto> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${id}" no encontrado.`);
    }

    // Aplicar solo los campos presentes en el DTO (operacion PATCH)
    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.status !== undefined) tenant.status = dto.status;
    if (dto.contactEmail !== undefined) tenant.contactEmail = dto.contactEmail;
    if (dto.maxSubscribers !== undefined) tenant.maxSubscribers = dto.maxSubscribers ?? null;
    if (dto.settings !== undefined) tenant.settings = dto.settings;
    // Datos legales
    if (dto.legalName !== undefined) tenant.legalName = dto.legalName ?? null;
    if (dto.nit !== undefined) tenant.nit = dto.nit ?? null;
    if (dto.nitDv !== undefined) tenant.nitDv = dto.nitDv ?? null;
    if (dto.companyType !== undefined) tenant.companyType = dto.companyType ?? null;
    // Dirección
    if (dto.address !== undefined) tenant.address = dto.address ?? null;
    if (dto.city !== undefined) tenant.city = dto.city ?? null;
    if (dto.department !== undefined) tenant.department = dto.department ?? null;
    if (dto.countryCode !== undefined) tenant.countryCode = dto.countryCode ?? null;
    if (dto.postalCode !== undefined) tenant.postalCode = dto.postalCode ?? null;
    if (dto.coordinates !== undefined) tenant.coordinates = dto.coordinates ?? null;
    // Contacto adicional
    if (dto.phone !== undefined) tenant.phone = dto.phone ?? null;
    if (dto.website !== undefined) tenant.website = dto.website ?? null;
    if (dto.economicSector !== undefined) tenant.economicSector = dto.economicSector ?? null;

    const updated = await this.tenantRepo.save(tenant);
    await this.invalidateTenantCache(tenant.id, tenant.slug);
    await this.cacheTenant(updated);
    this.logger.log(`Tenant actualizado: id=${updated.id} status=${updated.status}`);

    return this.toResponseDto(updated);
  }

  /** Suspende un tenant y fuerza invalidacion de cache para cortar acceso inmediato. */
  async suspend(id: string): Promise<TenantResponseDto> {
    return this.updateStatus(id, TenantStatus.SUSPENDED);
  }

  /** Activa un tenant previamente suspendido o inactivo. */
  async activate(id: string): Promise<TenantResponseDto> {
    return this.updateStatus(id, TenantStatus.ACTIVE);
  }

  /**
   * Lee settings funcionales del tenant aplicando defaults para claves faltantes.
   */
  async getSettings(tenantId: string): Promise<TenantSettingsResponseDto> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
    }

    return this.normalizeTenantSettings(tenant);
  }

  /**
   * Aplica merge parcial de configuración funcional y persiste el JSONB `settings`.
   */
  async updateSettings(
    tenantId: string,
    dto: UpdateTenantSettingsDto,
    actorUserId?: string,
  ): Promise<TenantSettingsResponseDto> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
    }

    if (dto.timezone !== undefined) {
      this.assertValidTimezone(dto.timezone);
    }

    const oldValue = this.normalizeTenantSettings(tenant);

    const currentSettings = this.asRecord(tenant.settings);
    const currentFeatures = this.asRecord(currentSettings['features']);

    tenant.settings = {
      ...currentSettings,
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.language !== undefined ? { language: dto.language } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.fiberInstallationThresholdMeters !== undefined
        ? { fiberInstallationThresholdMeters: dto.fiberInstallationThresholdMeters }
        : {}),
      ...(dto.features
        ? {
            features: {
              ...currentFeatures,
              ...(dto.features.billing !== undefined ? { billing: dto.features.billing } : {}),
              ...(dto.features.mfa_required_all !== undefined
                ? { mfa_required_all: dto.features.mfa_required_all }
                : {}),
            },
          }
        : {}),
    };

    if (dto.maxSubscribers !== undefined) {
      tenant.maxSubscribers = dto.maxSubscribers ?? null;
    }

    const saved = await this.tenantRepo.save(tenant);
    await this.invalidateTenantCache(saved.id, saved.slug);
    await this.cacheTenant(saved);

    const newValue = this.normalizeTenantSettings(saved);

    await this.auditService.log({
      tenantId: saved.id,
      schemaName: saved.schemaName,
      userId: actorUserId ?? null,
      action: AuditAction.UPDATE,
      entityType: 'TenantSettings',
      entityId: saved.id,
      oldValue: oldValue as unknown as Record<string, unknown>,
      newValue: newValue as unknown as Record<string, unknown>,
    });

    return newValue;
  }

  /**
   * Convierte el slug del tenant al nombre del schema PostgreSQL.
   *
   * Reglas:
   * - Prefijo fijo: "tenant_"
   * - Guiones "-" → guiones_bajos "_" (PostgreSQL acepta _ en nombres de schema)
   * - Solo caracteres validos: [a-z0-9_]
   * - Longitud maxima resultante: 63 chars (limite PostgreSQL)
   *
   * Ejemplo: "mi-isp-colombia" → "tenant_mi_isp_colombia"
   */
  buildSchemaName(slug: string): string {
    const normalized = slug.toLowerCase().replace(/-/g, '_');
    return `tenant_${normalized}`;
  }

  /** Mapea entidad Tenant a DTO de respuesta publica */
  private toResponseDto(tenant: Tenant): TenantResponseDto {
    const dto = new TenantResponseDto();
    dto.id = tenant.id;
    dto.name = tenant.name;
    dto.slug = tenant.slug;
    dto.schemaName = tenant.schemaName;
    dto.status = tenant.status;
    dto.contactEmail = tenant.contactEmail;
    dto.maxSubscribers = tenant.maxSubscribers;
    dto.settings = tenant.settings;
    // Datos legales
    dto.legalName = tenant.legalName ?? null;
    dto.nit = tenant.nit ?? null;
    dto.nitDv = tenant.nitDv ?? null;
    dto.companyType = tenant.companyType ?? null;
    // Dirección
    dto.address = tenant.address ?? null;
    dto.city = tenant.city ?? null;
    dto.department = tenant.department ?? null;
    dto.countryCode = tenant.countryCode ?? null;
    dto.postalCode = tenant.postalCode ?? null;
    dto.coordinates = tenant.coordinates ?? null;
    // Contacto adicional
    dto.phone = tenant.phone ?? null;
    dto.website = tenant.website ?? null;
    dto.economicSector = tenant.economicSector ?? null;
    // Branding
    dto.logoLightUrl = tenant.logoLightUrl ?? null;
    dto.logoLightAssetId = tenant.logoLightAssetId ?? null;
    dto.logoDarkUrl = tenant.logoDarkUrl ?? null;
    dto.logoDarkAssetId = tenant.logoDarkAssetId ?? null;
    dto.sealLightUrl = tenant.sealLightUrl ?? null;
    dto.sealLightAssetId = tenant.sealLightAssetId ?? null;
    dto.sealDarkUrl = tenant.sealDarkUrl ?? null;
    dto.sealDarkAssetId = tenant.sealDarkAssetId ?? null;
    dto.faviconLightUrl = tenant.faviconLightUrl ?? null;
    dto.faviconLightAssetId = tenant.faviconLightAssetId ?? null;
    dto.faviconDarkUrl = tenant.faviconDarkUrl ?? null;
    dto.faviconDarkAssetId = tenant.faviconDarkAssetId ?? null;
    dto.loginBackgroundLightUrl = tenant.loginBackgroundLightUrl ?? null;
    dto.loginBackgroundLightAssetId = tenant.loginBackgroundLightAssetId ?? null;
    dto.loginBackgroundDarkUrl = tenant.loginBackgroundDarkUrl ?? null;
    dto.loginBackgroundDarkAssetId = tenant.loginBackgroundDarkAssetId ?? null;
    dto.showTenantName = tenant.showTenantName ?? true;
    dto.brandingProductName = tenant.brandingProductName ?? null;
    dto.brandingSurfaceName = tenant.brandingSurfaceName ?? null;
    dto.brandingMetadataTitle = tenant.brandingMetadataTitle ?? null;
    dto.brandingMetadataDescription = tenant.brandingMetadataDescription ?? null;
    dto.createdAt = tenant.createdAt;
    dto.updatedAt = tenant.updatedAt;
    return dto;
  }

  private async updateBrandingState(
    tenantId: string,
    dto: UpdateTenantSelfBrandingDto,
    actorUserId?: string,
  ): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${tenantId}" no encontrado.`);
    }

    const oldValue = this.toBrandingAuditPayload(tenant);

    await this.applyBrandingUpdate(tenant, dto);
    if (dto.showTenantName !== undefined) {
      tenant.showTenantName = dto.showTenantName;
    }
    if (dto.brandingProductName !== undefined) {
      tenant.brandingProductName = dto.brandingProductName ?? null;
    }
    if (dto.brandingSurfaceName !== undefined) {
      tenant.brandingSurfaceName = dto.brandingSurfaceName ?? null;
    }
    if (dto.brandingMetadataTitle !== undefined) {
      tenant.brandingMetadataTitle = dto.brandingMetadataTitle ?? null;
    }
    if (dto.brandingMetadataDescription !== undefined) {
      tenant.brandingMetadataDescription = dto.brandingMetadataDescription ?? null;
    }

    const saved = await this.tenantRepo.save(tenant);
    await this.invalidateTenantCache(saved.id, saved.slug);
    await this.cacheTenant(saved);

    await this.auditService.log({
      tenantId: saved.id,
      schemaName: saved.schemaName,
      userId: actorUserId ?? null,
      action: AuditAction.UPDATE,
      entityType: 'TenantBranding',
      entityId: saved.id,
      oldValue: oldValue as unknown as Record<string, unknown>,
      newValue: this.toBrandingAuditPayload(saved) as unknown as Record<string, unknown>,
    });

    return saved;
  }

  private async applyBrandingUpdate(
    tenant: Tenant,
    dto: UpdateTenantSelfBrandingDto,
  ): Promise<void> {
    for (const config of BRANDING_SLOT_CONFIGS) {
      const nextUrl = dto[config.urlKey];
      const nextAssetId = dto[config.assetKey];

      if (nextUrl === undefined && nextAssetId === undefined) {
        continue;
      }

      const previousAssetId = tenant[config.assetKey];

      if (nextAssetId !== undefined) {
        if (nextAssetId === null) {
          await this.softDeletePreviousBrandingAsset(tenant.schemaName, previousAssetId, null);
          tenant[config.assetKey] = null;
          tenant[config.urlKey] = nextUrl ?? null;
          continue;
        }

        const asset = await this.assertBrandingAssetMatchesSlot(
          nextAssetId,
          tenant.schemaName,
          config,
        );
        await this.softDeletePreviousBrandingAsset(tenant.schemaName, previousAssetId, asset.id);
        tenant[config.assetKey] = asset.id;
        tenant[config.urlKey] = this.requireBrandingPublicUrl(asset, config);
        continue;
      }

      await this.softDeletePreviousBrandingAsset(tenant.schemaName, previousAssetId, null);
      tenant[config.assetKey] = null;
      tenant[config.urlKey] = nextUrl ?? null;
    }
  }

  private async assignBrandingAssetToSlot(
    tenant: Tenant,
    config: BrandingSlotConfig,
    asset: MediaAssetResponseDto,
  ): Promise<void> {
    const previousAssetId = tenant[config.assetKey];
    await this.softDeletePreviousBrandingAsset(tenant.schemaName, previousAssetId, asset.id);
    tenant[config.assetKey] = asset.id;
    tenant[config.urlKey] = this.requireBrandingPublicUrl(asset, config);
  }

  private getBrandingSlotConfig(
    usage: MediaUsage,
    themeVariant: NonNullable<MediaThemeVariant>,
  ): BrandingSlotConfig {
    const config = BRANDING_SLOT_CONFIGS.find(
      (item) => item.usage === usage && item.themeVariant === themeVariant,
    );

    if (!config) {
      throw new BadRequestException(
        `No existe un slot de branding para usage='${usage}' y themeVariant='${themeVariant}'.`,
      );
    }

    return config;
  }

  private async assertBrandingAssetMatchesSlot(
    assetId: string,
    tenantSchema: string,
    config: BrandingSlotConfig,
  ): Promise<MediaAssetResponseDto> {
    const asset = await this.mediaService.findOne(assetId, tenantSchema);

    if (asset.usage !== config.usage) {
      throw new BadRequestException(
        `El asset ${assetId} no corresponde al usage esperado para el slot ${config.urlKey}.`,
      );
    }

    if (asset.themeVariant !== config.themeVariant) {
      throw new BadRequestException(
        `El asset ${assetId} no corresponde a la variante ${config.themeVariant}.`,
      );
    }

    return asset;
  }

  private requireBrandingPublicUrl(
    asset: MediaAssetResponseDto,
    config: BrandingSlotConfig,
  ): string {
    if (!asset.publicUrl) {
      throw new BadRequestException(
        `El asset asignado al slot ${config.urlKey} no tiene una URL pública resoluble.`,
      );
    }

    return asset.publicUrl;
  }

  private async softDeletePreviousBrandingAsset(
    tenantSchema: string,
    previousAssetId: string | null,
    nextAssetId: string | null,
  ): Promise<void> {
    if (!previousAssetId || previousAssetId === nextAssetId) {
      return;
    }

    await this.mediaService.softDelete(previousAssetId, tenantSchema);
  }

  private toBrandingAuditPayload(tenant: Tenant): Record<string, unknown> {
    return {
      logoLightUrl: tenant.logoLightUrl ?? null,
      logoLightAssetId: tenant.logoLightAssetId ?? null,
      logoDarkUrl: tenant.logoDarkUrl ?? null,
      logoDarkAssetId: tenant.logoDarkAssetId ?? null,
      sealLightUrl: tenant.sealLightUrl ?? null,
      sealLightAssetId: tenant.sealLightAssetId ?? null,
      sealDarkUrl: tenant.sealDarkUrl ?? null,
      sealDarkAssetId: tenant.sealDarkAssetId ?? null,
      faviconLightUrl: tenant.faviconLightUrl ?? null,
      faviconLightAssetId: tenant.faviconLightAssetId ?? null,
      faviconDarkUrl: tenant.faviconDarkUrl ?? null,
      faviconDarkAssetId: tenant.faviconDarkAssetId ?? null,
      loginBackgroundLightUrl: tenant.loginBackgroundLightUrl ?? null,
      loginBackgroundLightAssetId: tenant.loginBackgroundLightAssetId ?? null,
      loginBackgroundDarkUrl: tenant.loginBackgroundDarkUrl ?? null,
      loginBackgroundDarkAssetId: tenant.loginBackgroundDarkAssetId ?? null,
      showTenantName: tenant.showTenantName ?? true,
      brandingProductName: tenant.brandingProductName ?? null,
      brandingSurfaceName: tenant.brandingSurfaceName ?? null,
      brandingMetadataTitle: tenant.brandingMetadataTitle ?? null,
      brandingMetadataDescription: tenant.brandingMetadataDescription ?? null,
    };
  }

  private resolveEffectiveBrandingMetadata(tenant: Tenant): EffectiveTenantBrandingMetadata {
    const fallbackDisplayName = this.normalizeNullableBrandingText(tenant.legalName) ?? tenant.name;
    const productName =
      this.normalizeNullableBrandingText(tenant.brandingProductName) ?? fallbackDisplayName;
    const surfaceName =
      this.normalizeNullableBrandingText(tenant.brandingSurfaceName) ?? 'Portal empresarial';
    const metadataTitle =
      this.normalizeNullableBrandingText(tenant.brandingMetadataTitle) ??
      `${productName} — Portal empresarial`;
    const metadataDescription =
      this.normalizeNullableBrandingText(tenant.brandingMetadataDescription) ??
      `Portal empresarial para la operación de ${productName} en iWana neXt.`;

    return {
      displayName: productName,
      productName,
      surfaceName,
      metadataTitle,
      metadataDescription,
    };
  }

  private normalizeNullableBrandingText(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  }

  /** Busca un tenant por id con cache Redis para evitar lecturas repetidas al schema publico. */
  private async findTenantEntityById(id: string): Promise<Tenant | null> {
    const cachedTenant = await this.getCachedTenant(this.buildIdCacheKey(id));
    if (cachedTenant && cachedTenant.status !== 'PROVISIONING') {
      return cachedTenant;
    }

    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (tenant) {
      await this.cacheTenant(tenant);
    }
    return tenant;
  }

  /** Persiste el tenant en cache por id y slug para resolver middleware y CRUD de plataforma. */
  private async cacheTenant(tenant: Tenant): Promise<void> {
    const serializedTenant = JSON.stringify(tenant);
    await Promise.all([
      this.redis.set(
        this.buildIdCacheKey(tenant.id),
        serializedTenant,
        'EX',
        TENANT_CACHE_TTL_SECONDS,
      ),
      this.redis.set(
        this.buildSlugCacheKey(tenant.slug),
        serializedTenant,
        'EX',
        TENANT_CACHE_TTL_SECONDS,
      ),
    ]);
  }

  /** Elimina las entradas cacheadas del tenant cuando cambia su estado o metadata operativa. */
  private async invalidateTenantCache(id: string, slug: string): Promise<void> {
    await this.redis.del(this.buildIdCacheKey(id), this.buildSlugCacheKey(slug));
  }

  /** Lee y deserializa un tenant desde Redis. */
  private async getCachedTenant(cacheKey: string): Promise<Tenant | null> {
    const cachedValue = await this.redis.get(cacheKey);
    if (!cachedValue) {
      return null;
    }

    return JSON.parse(cachedValue) as Tenant;
  }

  private buildIdCacheKey(id: string): string {
    return `tenant:id:${id}`;
  }

  private buildSlugCacheKey(slug: string): string {
    return `tenant:slug:${slug}`;
  }

  /** Normaliza settings JSONB para entregar un contrato estable en API. */
  private normalizeTenantSettings(tenant: Tenant): TenantSettingsResponseDto {
    const settings = this.asRecord(tenant.settings);
    const features = this.asRecord(settings['features']);

    return {
      tenantId: tenant.id,
      timezone: this.stringOrDefault(settings['timezone'], DEFAULT_TENANT_SETTINGS.timezone),
      currency: this.stringOrDefault(settings['currency'], DEFAULT_TENANT_SETTINGS.currency),
      language: this.stringOrDefault(settings['language'], DEFAULT_TENANT_SETTINGS.language),
      country: this.stringOrDefault(settings['country'], DEFAULT_TENANT_SETTINGS.country),
      maxSubscribers: tenant.maxSubscribers,
      fiberInstallationThresholdMeters:
        typeof settings['fiberInstallationThresholdMeters'] === 'number' &&
        Number.isFinite(settings['fiberInstallationThresholdMeters'])
          ? settings['fiberInstallationThresholdMeters']
          : 50,
      features: {
        billing: this.booleanOrDefault(
          features['billing'],
          DEFAULT_TENANT_SETTINGS.features.billing,
        ),
        mfa_required_all: this.booleanOrDefault(
          features['mfa_required_all'],
          DEFAULT_TENANT_SETTINGS.features.mfa_required_all,
        ),
      },
    };
  }

  private assertValidTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('es-CO', { timeZone: timezone }).format(new Date());
    } catch {
      throw new BadRequestException('timezone inválida. Debe ser un identificador IANA.');
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private stringOrDefault(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private booleanOrDefault(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  /** Actualiza solo el estado operativo del tenant manteniendo invalidez de cache consistente. */
  private async updateStatus(id: string, status: TenantStatus): Promise<TenantResponseDto> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${id}" no encontrado.`);
    }

    tenant.status = status;
    if (status === TenantStatus.ACTIVE) {
      tenant.deletedAt = null;
    }
    const updated = await this.tenantRepo.save(tenant);
    await this.invalidateTenantCache(tenant.id, tenant.slug);
    await this.cacheTenant(updated);
    this.logger.log(`Tenant ${status.toLowerCase()}: id=${updated.id} status=${updated.status}`);

    return this.toResponseDto(updated);
  }

  /** Marca el tenant para eliminacion diferida; el schema queda retenido hasta la purga. */
  async delete(id: string): Promise<void> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${id}" no encontrado.`);
    }

    const oldValue = this.toResponseDto(tenant) as unknown as Record<string, unknown>;
    tenant.status = TenantStatus.MARKED_FOR_DELETION;
    tenant.deletedAt = new Date();

    const saved = await this.tenantRepo.save(tenant);
    await this.invalidateTenantCache(saved.id, saved.slug);

    await this.auditService.log({
      tenantId: saved.id,
      schemaName: saved.schemaName,
      userId: null,
      action: AuditAction.DELETE,
      entityType: 'Tenant',
      entityId: saved.id,
      oldValue,
      newValue: this.toResponseDto(saved) as unknown as Record<string, unknown>,
    });

    this.logger.log(`Tenant marcado para eliminacion: id=${id} schema=${tenant.schemaName}`);
  }
}
