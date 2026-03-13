import {
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
import { TenantStatus } from '@iwana/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { CreateTenantDto, TenantResponseDto, UpdateTenantDto } from './dto/tenant.dto';

const TENANT_CACHE_TTL_SECONDS = 5 * 60;

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
      this.redis.set(this.buildIdCacheKey(tenant.id), serializedTenant, 'EX', TENANT_CACHE_TTL_SECONDS),
      this.redis.set(this.buildSlugCacheKey(tenant.slug), serializedTenant, 'EX', TENANT_CACHE_TTL_SECONDS),
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
}
