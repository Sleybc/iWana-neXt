import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { Tenant } from '@iwana/db';
import { AuditAction, TenantStatus } from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { CreateTenantDto, TenantResponseDto, UpdateTenantDto } from './dto/tenant.dto';
import { TenantSettingsResponseDto, UpdateTenantSettingsDto } from './dto/tenant-settings.dto';
import { TenantSelfResponseDto, TenantSelfSettingsResponseDto } from './dto/tenant-self.dto';

const TENANT_CACHE_TTL_SECONDS = 5 * 60;

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

/**
 * Servicio de gestion de tenants (ISPs clientes).
 *
 * Responsabilidades Sprint 1:
 * - CRUD completo de tenants en public.tenants
 * - Derivacion y validacion del schema_name a partir del slug
 *
 * Fuera del alcance de Sprint 1 (se implementa en Sprint 1 Semana 2+):
 * - TenantProvisioningService (BullMQ worker que ejecuta tenant_template.sql)
 * - TenantSeedService (seed inicial del admin del tenant)
 * - Cache Redis de tenant (TTL 5 min)
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
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly auditService: AuditService,
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

    const tenant = this.tenantRepo.create({
      name: dto.name,
      slug: dto.slug,
      schemaName,
      contactEmail: dto.contactEmail,
      maxSubscribers: dto.maxSubscribers ?? 0,
      settings: dto.settings ?? { timezone: 'America/Bogota', currency: 'COP' },
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

    // TODO Sprint 1 Semana 2: encolar job BullMQ de provisioning de schema
    // await this.tenantProvisioningQueue.add('provision', { tenantId: saved.id, schemaName });

    return this.toResponseDto(saved);
  }

  /** Lista todos los tenants con paginacion basica por offset */
  async findAll(limit = 50, offset = 0): Promise<{ data: TenantResponseDto[]; total: number }> {
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
    dto.city = tenant.city ?? null;
    dto.department = tenant.department ?? null;
    dto.countryCode = tenant.countryCode ?? null;
    dto.phone = tenant.phone ?? null;
    dto.website = tenant.website ?? null;
    dto.createdAt = tenant.createdAt;
    return dto;
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
    if (dto.maxSubscribers !== undefined) tenant.maxSubscribers = dto.maxSubscribers;
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
      tenant.maxSubscribers = dto.maxSubscribers;
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
    dto.createdAt = tenant.createdAt;
    dto.updatedAt = tenant.updatedAt;
    return dto;
  }

  /** Busca un tenant por id con cache Redis para evitar lecturas repetidas al schema publico. */
  private async findTenantEntityById(id: string): Promise<Tenant | null> {
    const cachedTenant = await this.getCachedTenant(this.buildIdCacheKey(id));
    if (cachedTenant) {
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
    const updated = await this.tenantRepo.save(tenant);
    await this.invalidateTenantCache(tenant.id, tenant.slug);
    await this.cacheTenant(updated);
    this.logger.log(`Tenant ${status.toLowerCase()}: id=${updated.id} status=${updated.status}`);

    return this.toResponseDto(updated);
  }

  /**
   * Elimina un tenant y su schema PostgreSQL asociado.
   * OPERACION DESTRUCTIVA - debe usarse con extrema precaución.
   */
  async delete(id: string): Promise<void> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant con id "${id}" no encontrado.`);
    }

    //TODO: Drop schema PostgreSQL cuando esté implementado el tenant-provisioning service
    //await this.provisioningService.dropSchema(tenant.schemaName);

    // Eliminar de cache
    await this.invalidateTenantCache(tenant.id, tenant.slug);

    // Eliminar de la base de datos
    await this.tenantRepo.remove(tenant);
    this.logger.log(`Tenant eliminado: id=${id} schema=${tenant.schemaName}`);
  }
}
