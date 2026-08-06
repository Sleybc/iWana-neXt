import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { DataSource, FindOptionsWhere, MoreThan } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { User } from '@iwana/db';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  AuditAction,
  DocumentType,
  isPlatformOnlyRole,
  isTenantAssignableRole,
  PlatformRole,
  USERS_BULK_CREATE_JOB,
  USERS_BULK_CREATE_QUEUE,
  UserRole,
  UserStatus,
  type UsersBulkCreateAcceptedResponse,
  type UsersBulkCreateFailedItem,
  type UsersBulkCreateJobPayload,
  type UsersBulkCreateSucceededItem,
  type UsersBulkJobResultResponse,
  type UsersBulkJobStatusResponse,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { clampPickerSearchLimit, type PickerSearchResult } from '../../common/pagination';
import { REDIS_CLIENT } from '../redis/redis.module';
import { SearchQueueService } from '../search/search-queue.service';
import { TenantService } from '../tenant/tenant.service';
import {
  AdminChangeUserLoginEmailDto,
  ChangeUserLoginEmailDto,
  CreateUserDto,
  UpdateProfileDto,
  UpdateUserDto,
  UserResponseDto,
} from './dto/user.dto';
import type { BulkCreateUserItem } from './dto/bulk-create-users.dto';

/** Iteraciones bcrypt para hashes de password de usuarios creados por admin */
const BCRYPT_ROUNDS = 12;

/** Longitud del password temporal en bytes (16 bytes → 32 chars hex) */
const TEMP_PASSWORD_BYTES = 16;

/** TTL de rastros de Idempotency-Key en Redis (24 h), alineado a auth. */
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** TTL del resultado one-time de bulk (credenciales temporales). */
const BULK_RESULT_TTL_SECONDS = 24 * 60 * 60;

/** Umbral de similitud trigram (typos leves; p. ej. lilina↔liliana). */
const TRGM_SIMILARITY_THRESHOLD = 0.35;

interface IdempotencyRecord {
  fingerprint: string;
  userId?: string;
  issued?: boolean;
  jobId?: string;
}

interface BulkResultStore {
  summary: { total: number; succeeded: number; failed: number };
  succeeded: UsersBulkCreateSucceededItem[];
  failed: UsersBulkCreateFailedItem[];
  credentialsClaimed: boolean;
}

export interface SearchIndexUserRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  role: UserRole;
  status: UserStatus;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  route: string;
  updatedAt: number;
}

/**
 * Servicio de gestion de usuarios por tenant.
 *
 * Opera siempre dentro del schema del tenant via TenantContext + runInTenantSchema.
 * El email se persiste en texto plano y mantiene emailHash como derivado HMAC-SHA-256
 * (SEC-P1 / PII_HASH_KEY; búsqueda determinista sin exponer el email en índices SHA crudos).
 * para compatibilidad transversal con autenticacion y bootstrap.
 *
 * Operaciones disponibles:
 * - findAll: listado cursor-based con filtros por status y rol
 * - findOne: obtener usuario por ID
 * - create: crear usuario (opcionalmente con password temporal)
 * - update: actualizar status y/o rol (ADMIN o propio usuario)
 * - remove: soft delete (solo ADMIN, no puede borrar a otro ADMIN del mismo tenant)
 *
 * SEGURIDAD:
 * - Email en texto plano con unique constraint; emailHash HMAC-SHA-256 (SEC-P1)
 * - Password temporal generado con crypto.randomBytes (nunca predecible)
 * - Audit trail en CREATE, UPDATE, DELETE via AuditService
 * - RBAC: ADMIN no puede eliminar a otro ADMIN (RF-RBAC-04)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (endpoints 11-15)
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly tenantService: TenantService,
    private readonly searchQueueService: SearchQueueService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(USERS_BULK_CREATE_QUEUE)
    private readonly usersBulkCreateQueue: Queue<UsersBulkCreateJobPayload>,
  ) {}

  private assertCanReadUser(id: string, actorUserId: string, actorRole: string): void {
    if (
      actorRole !== UserRole.ADMIN &&
      actorRole !== PlatformRole.SYSTEM_ADMIN &&
      actorUserId !== id
    ) {
      throw new ForbiddenException('No tienes permisos para ver este usuario.');
    }
  }

  private fingerprintPayload(payload: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private buildIdempotencyCacheKey(
    scope: string,
    tenantId: string,
    idempotencyKey: string,
  ): string {
    return `users:${scope}:${tenantId}:${idempotencyKey}`;
  }

  private async readIdempotencyRecord(
    scope: string,
    idempotencyKey: string,
  ): Promise<{ cacheKey: string; record: IdempotencyRecord | null }> {
    const { tenantId } = TenantContext.getOrThrow();
    const cacheKey = this.buildIdempotencyCacheKey(scope, tenantId, idempotencyKey.trim());
    const raw = await this.redis.get(cacheKey);
    if (!raw) {
      return { cacheKey, record: null };
    }

    return { cacheKey, record: JSON.parse(raw) as IdempotencyRecord };
  }

  private async writeIdempotencyRecord(cacheKey: string, record: IdempotencyRecord): Promise<void> {
    await this.redis.set(cacheKey, JSON.stringify(record), 'EX', IDEMPOTENCY_TTL_SECONDS);
  }

  private assertSameIdempotencyFingerprint(record: IdempotencyRecord, fingerprint: string): void {
    if (record.fingerprint !== fingerprint) {
      throw new ConflictException(
        'La Idempotency-Key ya se uso con un payload distinto. Use una clave nueva.',
      );
    }
  }

  private getDefaultOperationalResource(role: UserRole): boolean {
    return role === UserRole.TECHNICIAN || role === UserRole.CONTRACTOR;
  }

  /**
   * Ningun usuario cuyo rol PERSISTIDO sea de plataforma es administrable desde
   * el CRUD del tenant, salvo por un actor de plataforma.
   *
   * Tras ADR-061 §4 ese estado ya no deberia existir: `UserRole` no contiene los
   * roles de plataforma y la migracion tenant 085 anade el CHECK equivalente en
   * la columna. La comprobacion se conserva —y se unifica aqui— porque opera
   * sobre el literal leido de la base, no sobre el tipo: un schema creado fuera
   * del runner de migraciones no tiene el CHECK.
   *
   * Sustituye a tres comprobaciones que solo miraban `SYSTEM_ADMIN` y dejaban
   * `IWANA_SUPPORT` sin cubrir.
   */
  private assertTargetIsNotPlatformUser(targetRole: string, actorRole: string): void {
    if (isPlatformOnlyRole(targetRole) && !isPlatformOnlyRole(actorRole)) {
      throw new ForbiddenException(
        'No tienes permisos para administrar a un usuario con rol de plataforma.',
      );
    }
  }

  /**
   * Frontera de asignacion de roles del CRUD de tenant (H-01 / ADR-061 §4).
   *
   * Tras sacar los roles de plataforma de `UserRole`, el tipo ya impide el
   * estado invalido en el camino tipado. La validacion se conserva —y no solo
   * en el DTO— porque `bulkCreate` entra por un schema Zod distinto, porque un
   * servicio no debe confiar en que su unico llamador sea el controlador, y
   * porque `isTenantAssignableRole` comprueba pertenencia positiva: rechaza
   * cualquier literal desconocido, no solo los dos roles de plataforma de hoy.
   */
  private assertTenantAssignableRole(role: UserRole): void {
    if (!isTenantAssignableRole(role)) {
      throw new ForbiddenException('El rol indicado no puede asignarse a un usuario del tenant.');
    }
  }

  /**
   * Estado inicial completo de un usuario recien dado de alta.
   *
   * FUENTE UNICA para las dos ramas de `create()`: alta nueva y resurreccion de
   * un usuario soft-deleted. Antes eran dos bloques copiados a mano y la rama de
   * resurreccion olvidaba `passwordResetToken`, `passwordResetTokenExpiresAt` y
   * `passwordResetExpiresAt` (H-04): un token de reset emitido en la vida
   * anterior del registro seguia siendo canjeable tras recrear la cuenta, y el
   * `passwordResetExpiresAt` heredado —ya vencido— dejaba al usuario resucitado
   * sin poder iniciar sesion con su contrasena temporal.
   *
   * El objeto cubre TODAS las columnas de `User` salvo las gestionadas por
   * TypeORM. Lo que sobrevive a una resurreccion es, por tanto, una lista
   * explicita y corta: `id`, `createdAt`, `updatedAt` y `deletedAt` (que la
   * propia rama limpia). Cualquier columna nueva de `User` que no se anada aqui
   * rompera el typecheck en vez de filtrarse en silencio.
   */
  private buildInitialUserState(params: {
    dto: CreateUserDto;
    normalizedEmail: string;
    emailHash: string;
    passwordHash: string;
    tenantId: string;
    isOperationalResource: boolean;
  }): Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
    const { dto, normalizedEmail, emailHash, passwordHash, tenantId, isOperationalResource } =
      params;

    return {
      email: normalizedEmail,
      emailHash,
      passwordHash,
      role: dto.role,
      status: UserStatus.PENDING_VERIFICATION,
      tenantId,
      mfaEnabled: false,
      mfaSecret: null,
      mfaRequired: dto.mfaRequired ?? false,
      isOperationalResource,
      passwordResetRequired: !dto.password,
      // Credenciales de recuperacion: siempre en blanco en un alta.
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
      passwordResetExpiresAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      emailVerified: false,
      emailVerificationToken: null,
      firstName: dto.firstName?.trim() ?? null,
      lastName: dto.lastName?.trim() ?? null,
      phone: dto.phone ?? null,
      jobTitle: dto.jobTitle ?? null,
      documentType: dto.documentType ?? null,
      documentNumber: dto.documentNumber?.trim() ?? null,
      avatarUrl: dto.avatarUrl ?? null,
    };
  }

  /**
   * Lista usuarios del tenant con paginación cursor-based.
   *
   * Semántica estable (FE-01 / H-05):
   * - `total` = tamaño del conjunto filtrado (status/role/search), sin cursor.
   * - `nextCursor` = id del último ítem de la página si hay más tras el filtro.
   * - El cursor se aplica **después** del filtro (nunca antes).
   *
   * Con `search`, la coincidencia ocurre en PostgreSQL (`pg_trgm` + ILIKE),
   * no en memoria Node (ADR-062).
   */
  async findAll(params: {
    cursor?: string;
    limit?: number;
    status?: UserStatus;
    role?: UserRole;
    search?: string;
  }): Promise<{ data: UserResponseDto[]; meta: { nextCursor: string | null; total: number } }> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const requested = params.limit ?? 50;
    const limit =
      Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 100) : 50;

    const normalizedSearch = this.normalizeSearchValue(params.search ?? '');

    // Designacion de admin principal (ADR-063): una sola lectura para toda la
    // pagina. Vive en `public.tenants`, fuera del schema del tenant, asi que se
    // resuelve antes de entrar en `runInTenantSchema`.
    const principalAdminUserId = await this.tenantService.getPrincipalAdminUserId(tenantId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (!normalizedSearch) {
        const where: FindOptionsWhere<User> = {};
        if (params.cursor) where.id = MoreThan(params.cursor);
        if (params.status) where.status = params.status;
        if (params.role) where.role = params.role;

        const users = await qr.manager.find(User, {
          where,
          order: { id: 'ASC' },
          take: limit + 1,
        });

        const totalWhere: FindOptionsWhere<User> = {};
        if (params.status) totalWhere.status = params.status;
        if (params.role) totalWhere.role = params.role;
        const total = await qr.manager.count(User, { where: totalWhere });

        const hasNext = users.length > limit;
        const items = hasNext ? users.slice(0, limit) : users;

        return {
          data: items.map((u) => this.toDto(u, principalAdminUserId)),
          meta: {
            nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
            total,
          },
        };
      }

      await qr.query(`SELECT set_config('pg_trgm.similarity_threshold', $1, true)`, [
        String(TRGM_SIMILARITY_THRESHOLD),
      ]);

      const filterClauses: string[] = ['deleted_at IS NULL'];
      const filterParams: unknown[] = [];

      if (params.status) {
        filterParams.push(params.status);
        filterClauses.push(`status = $${filterParams.length}`);
      }
      if (params.role) {
        filterParams.push(params.role);
        filterClauses.push(`role = $${filterParams.length}`);
      }

      filterParams.push(normalizedSearch);
      const qIdx = filterParams.length;
      filterParams.push(`%${this.escapeLikePattern(normalizedSearch)}%`);
      const likeIdx = filterParams.length;

      filterClauses.push(`(
        email ILIKE $${likeIdx} ESCAPE '\\'
        OR coalesce(first_name, '') ILIKE $${likeIdx} ESCAPE '\\'
        OR coalesce(last_name, '') ILIKE $${likeIdx} ESCAPE '\\'
        OR coalesce(job_title, '') ILIKE $${likeIdx} ESCAPE '\\'
        OR email % $${qIdx}
        OR coalesce(first_name, '') % $${qIdx}
        OR coalesce(last_name, '') % $${qIdx}
        OR coalesce(job_title, '') % $${qIdx}
        OR (coalesce(first_name, '') || ' ' || coalesce(last_name, '')) % $${qIdx}
      )`);

      const filterSql = filterClauses.join(' AND ');

      const countRows = (await qr.query(
        `SELECT COUNT(*)::int AS total FROM users WHERE ${filterSql}`,
        filterParams,
      )) as Array<{ total: number }>;
      const total = countRows[0]?.total ?? 0;

      const pageParams = [...filterParams];
      let pageSql = `SELECT * FROM users WHERE ${filterSql}`;
      if (params.cursor) {
        pageParams.push(params.cursor);
        pageSql += ` AND id > $${pageParams.length}`;
      }
      pageParams.push(limit + 1);
      pageSql += ` ORDER BY id ASC LIMIT $${pageParams.length}`;

      const rows = (await qr.query(pageSql, pageParams)) as Array<Record<string, unknown>>;
      const users = rows.map((row) => this.mapUserRow(row));
      const hasNext = users.length > limit;
      const items = hasNext ? users.slice(0, limit) : users;

      return {
        data: items.map((u) => this.toDto(u, principalAdminUserId)),
        meta: {
          nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
          total,
        },
      };
    });
  }

  /**
   * Lookup typeahead E-4 para pickers (atribución de usuarios, etc.).
   * Respuesta `{ data: { id, label, sublabel }[], total }` — máx. 20.
   * Label: nombre completo o email (precedente portal `buildInternalUserLabel`).
   * Sublabel: email si hay nombre; sin PII extra (documento/teléfono fuera).
   */
  async searchForPicker(params: {
    q?: string | undefined;
    status?: UserStatus | undefined;
    limit?: number | undefined;
  }): Promise<PickerSearchResult> {
    const { schemaName } = TenantContext.getOrThrow();
    const limit = clampPickerSearchLimit(params.limit);
    const normalizedSearch = this.normalizeSearchValue(params.q ?? '');

    if (!normalizedSearch) {
      return { data: [], total: 0 };
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.query(`SELECT set_config('pg_trgm.similarity_threshold', $1, true)`, [
        String(TRGM_SIMILARITY_THRESHOLD),
      ]);

      const filterClauses: string[] = ['deleted_at IS NULL'];
      const filterParams: unknown[] = [];

      if (params.status) {
        filterParams.push(params.status);
        filterClauses.push(`status = $${filterParams.length}`);
      }

      filterParams.push(normalizedSearch);
      const qIdx = filterParams.length;
      filterParams.push(`%${this.escapeLikePattern(normalizedSearch)}%`);
      const likeIdx = filterParams.length;

      filterClauses.push(`(
        email ILIKE $${likeIdx} ESCAPE '\\'
        OR coalesce(first_name, '') ILIKE $${likeIdx} ESCAPE '\\'
        OR coalesce(last_name, '') ILIKE $${likeIdx} ESCAPE '\\'
        OR coalesce(job_title, '') ILIKE $${likeIdx} ESCAPE '\\'
        OR email % $${qIdx}
        OR coalesce(first_name, '') % $${qIdx}
        OR coalesce(last_name, '') % $${qIdx}
        OR coalesce(job_title, '') % $${qIdx}
        OR (coalesce(first_name, '') || ' ' || coalesce(last_name, '')) % $${qIdx}
      )`);

      const filterSql = filterClauses.join(' AND ');

      const countRows = (await qr.query(
        `SELECT COUNT(*)::int AS total FROM users WHERE ${filterSql}`,
        filterParams,
      )) as Array<{ total: number }>;
      const total = countRows[0]?.total ?? 0;

      const pageParams = [...filterParams, limit];
      const pageSql = `
        SELECT id, email, first_name, last_name, job_title
        FROM users
        WHERE ${filterSql}
        ORDER BY
          GREATEST(
            similarity(email, $${qIdx}),
            similarity(coalesce(first_name, ''), $${qIdx}),
            similarity(coalesce(last_name, ''), $${qIdx}),
            similarity(coalesce(first_name, '') || ' ' || coalesce(last_name, ''), $${qIdx})
          ) DESC,
          id ASC
        LIMIT $${pageParams.length}
      `;

      const rows = (await qr.query(pageSql, pageParams)) as Array<{
        id: string;
        email: string;
        first_name: string | null;
        last_name: string | null;
        job_title: string | null;
      }>;

      return {
        data: rows.map((row) => this.toPickerItem(row)),
        total,
      };
    });
  }

  private toPickerItem(row: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    job_title?: string | null;
  }): { id: string; label: string; sublabel?: string | null } {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    if (fullName) {
      return { id: row.id, label: fullName, sublabel: row.email };
    }
    return {
      id: row.id,
      label: row.email,
      sublabel: row.job_title?.trim() || null,
    };
  }

  /**
   * Obtiene un usuario del tenant por UUID.
   * Lanza NotFoundException si no existe o fue eliminado (soft delete).
   * Cuando se proveen actorUserId/actorRole (ruta HTTP), aplica autorizacion de
   * negocio (H-08): ADMIN/SYSTEM_ADMIN o el propio usuario. Callers internos
   * del modulith pueden omitir el actor.
   */
  async findOne(id: string, actorUserId?: string, actorRole?: string): Promise<UserResponseDto> {
    if (actorUserId !== undefined && actorRole !== undefined) {
      this.assertCanReadUser(id, actorUserId, actorRole);
    }
    return this.findUserDtoById(id);
  }

  /**
   * Crea un usuario en el tenant.
   *
   * - El email se almacena en texto plano y se indexa por unique + emailHash derivado.
   * - Si no se provee password, se genera uno temporal y se activa passwordResetRequired.
   * - Lanza ConflictException si ya existe un usuario con ese email en el tenant.
   * - Idempotente por Idempotency-Key (Redis): mismo key + mismo payload no duplica;
   *   el password temporal solo se devuelve en la primera respuesta (no se cachea).
   */
  async create(
    dto: CreateUserDto,
    actorUserId: string,
    ipAddress: string = 'unknown',
    idempotencyKey?: string,
  ): Promise<UserResponseDto & { temporaryPassword?: string }> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    // Frontera de roles: ningun rol de plataforma puede entrar por aqui (H-01).
    this.assertTenantAssignableRole(dto.role);

    const fingerprint = this.fingerprintPayload({
      email: dto.email.toLowerCase().trim(),
      role: dto.role,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      phone: dto.phone ?? null,
      jobTitle: dto.jobTitle ?? null,
      documentType: dto.documentType ?? null,
      documentNumber: dto.documentNumber ?? null,
      mfaRequired: dto.mfaRequired ?? null,
      isOperationalResource: dto.isOperationalResource ?? null,
      hasPassword: Boolean(dto.password),
    });

    let cacheKey: string | null = null;
    if (idempotencyKey?.trim()) {
      const lookup = await this.readIdempotencyRecord('create', idempotencyKey);
      cacheKey = lookup.cacheKey;
      if (lookup.record) {
        this.assertSameIdempotencyFingerprint(lookup.record, fingerprint);
        if (lookup.record.userId) {
          // Reintento: misma clave, mismo payload — devolver el usuario ya creado.
          return this.findUserDtoById(lookup.record.userId);
        }
      }
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const emailHash = hashEmail(dto.email);

      const normalizedEmail = dto.email.toLowerCase().trim();
      const existing = await qr.manager.findOne(User, {
        where: { email: normalizedEmail },
        withDeleted: true,
      });
      if (existing && !existing.deletedAt) {
        // Usuario activo con ese email — conflicto real
        throw new ConflictException('Ya existe un usuario con ese email en este tenant.');
      }

      // Generar o usar el password provisto
      let temporaryPassword: string | undefined;
      let passwordHash: string;

      if (dto.password) {
        passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      } else {
        temporaryPassword = crypto.randomBytes(TEMP_PASSWORD_BYTES).toString('hex');
        passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      }

      let user: User;
      const isOperationalResource =
        dto.isOperationalResource ?? this.getDefaultOperationalResource(dto.role);

      // Fuente unica del estado inicial — comun a alta nueva y a resurreccion (H-04).
      const initialState = this.buildInitialUserState({
        dto,
        normalizedEmail,
        emailHash,
        passwordHash,
        tenantId,
        isOperationalResource,
      });

      if (existing?.deletedAt) {
        /**
         * El usuario fue eliminado (soft delete) pero el email_hmac tiene unique constraint
         * a nivel de columna PostgreSQL — no se puede insertar una fila nueva con el mismo hash.
         * Solución: restaurar el registro eliminado y reinicializar todos sus campos con los
         * nuevos datos, como si fuera un usuario completamente nuevo.
         */
        await qr.manager.restore(User, { id: existing.id });
        Object.assign(existing, initialState);
        /**
         * CRÍTICO: limpiar deletedAt en el objeto en memoria ANTES de save().
         * restore() limpia deleted_at en la BD, pero el objeto TypeScript todavía
         * tiene deletedAt = Date. Si se omite esta línea, save() re-escribe el valor
         * antiguo a la BD y el usuario queda soft-deleted inmediatamente otra vez.
         */
        existing.deletedAt = null;
        await qr.manager.save(User, existing);
        user = existing;
      } else {
        // Usuario nuevo — insertar registro fresco
        user = qr.manager.create(User, initialState);
        await qr.manager.save(User, user);
      }

      // Audit trail — actor real (H-02); sin PII en newValue.
      await this.auditService.log({
        action: AuditAction.CREATE,
        entityType: 'User',
        entityId: user.id,
        userId: actorUserId,
        newValue: {
          role: user.role,
          status: user.status,
          tenantId: user.tenantId,
          isOperationalResource: user.isOperationalResource,
        },
        ipAddress: ipAddress || null,
      });

      if (cacheKey) {
        await this.writeIdempotencyRecord(cacheKey, {
          fingerprint,
          userId: user.id,
        });
      }

      const dto_result = this.toDto(user);
      this.fireAndForget(
        this.searchQueueService.enqueueUserUpsert(user.tenantId, user.id),
        'cola de busqueda upsert usuario',
      );
      return temporaryPassword ? { ...dto_result, temporaryPassword } : dto_result;
    });
  }

  /**
   * Encola alta masiva de usuarios (D-3=A / H-06).
   *
   * Devuelve de inmediato el identificador de trabajo. El worker procesa con
   * tenant explícito en el payload (ALS no propaga). Las contraseñas temporales
   * solo se entregan vía `claimBulkJobResult` (one-time).
   */
  async bulkCreate(
    users: BulkCreateUserItem[],
    actorUserId: string,
    ipAddress: string = 'unknown',
    idempotencyKey?: string,
  ): Promise<UsersBulkCreateAcceptedResponse> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }

    const { schemaName, tenantId, tenantSlug } = TenantContext.getOrThrow();
    const key = idempotencyKey.trim();
    const fingerprint = this.fingerprintPayload({
      users: users.map((u) => ({
        email: u.email.toLowerCase().trim(),
        role: u.role,
        firstName: u.firstName ?? null,
        lastName: u.lastName ?? null,
        phone: u.phone ?? null,
        jobTitle: u.jobTitle ?? null,
        documentType: u.documentType ?? null,
        documentNumber: u.documentNumber ?? null,
        isOperationalResource: u.isOperationalResource ?? null,
      })),
    });

    const lookup = await this.readIdempotencyRecord('bulk-create', key);
    if (lookup.record) {
      this.assertSameIdempotencyFingerprint(lookup.record, fingerprint);
      if (lookup.record.jobId) {
        const existing = await this.usersBulkCreateQueue.getJob(lookup.record.jobId);
        if (existing) {
          const state = await existing.getState();
          return {
            jobId: lookup.record.jobId,
            status: this.mapAcceptedJobStatus(state),
          };
        }
      }
    }

    const payload: UsersBulkCreateJobPayload = {
      tenantId,
      schemaName,
      tenantSlug: tenantSlug ?? schemaName.replace(/^tenant_/, ''),
      actorUserId,
      ipAddress: ipAddress || 'unknown',
      idempotencyKey: key,
      users: users.map((u) => {
        const item: UsersBulkCreateJobPayload['users'][number] = {
          email: u.email,
          role: u.role,
        };
        if (u.firstName !== undefined) item.firstName = u.firstName;
        if (u.lastName !== undefined) item.lastName = u.lastName;
        if (u.phone !== undefined) item.phone = u.phone;
        if (u.jobTitle !== undefined) item.jobTitle = u.jobTitle;
        if (u.documentType !== undefined) item.documentType = u.documentType;
        if (u.documentNumber !== undefined) item.documentNumber = u.documentNumber;
        if (u.isOperationalResource !== undefined) {
          item.isOperationalResource = u.isOperationalResource;
        }
        return item;
      }),
    };

    const job = await this.usersBulkCreateQueue.add(USERS_BULK_CREATE_JOB, payload, {
      jobId: `users-bulk-${tenantId}-${key}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: BULK_RESULT_TTL_SECONDS },
      removeOnFail: { age: BULK_RESULT_TTL_SECONDS },
    });

    const jobId = String(job.id);
    await this.writeIdempotencyRecord(lookup.cacheKey, { fingerprint, jobId });

    return { jobId, status: 'queued' };
  }

  /**
   * Estado del job de bulk sin secretos (UX: progreso / resumen).
   */
  async getBulkJobStatus(jobId: string): Promise<UsersBulkJobStatusResponse> {
    const { tenantId } = TenantContext.getOrThrow();
    const job = await this.usersBulkCreateQueue.getJob(jobId);
    if (!job || job.data.tenantId !== tenantId) {
      throw new NotFoundException('Importación no encontrada.');
    }

    const state = await job.getState();
    const store = await this.readBulkResultStore(tenantId, jobId);

    let status: UsersBulkJobStatusResponse['status'] = 'unknown';
    if (state === 'completed') status = 'completed';
    else if (state === 'failed') status = 'failed';
    else if (state === 'active') status = 'active';
    else if (state === 'waiting' || state === 'delayed') status = 'queued';

    // La marca atomica es la autoridad: sobrevive a una reescritura del store
    // (p. ej. un reintento del job), que antes des-reclamaba credenciales ya
    // entregadas al devolver el flag a `false`.
    const reclamado =
      (store?.credentialsClaimed ?? false) ||
      (await this.isBulkCredentialsClaimed(tenantId, jobId));

    const response: UsersBulkJobStatusResponse = {
      jobId,
      status,
      summary: store?.summary ?? null,
      failed: store?.failed ?? [],
      credentialsClaimed: reclamado,
    };
    if (state === 'failed') {
      response.errorMessage = String(job.failedReason ?? 'Error en la importación');
    }
    return response;
  }

  /**
   * Reclama el resultado one-time con contraseñas temporales (UX §2).
   * Una sola revelación; reintentos posteriores omiten `temporaryPassword`.
   */
  async claimBulkJobResult(jobId: string): Promise<UsersBulkJobResultResponse> {
    const { tenantId } = TenantContext.getOrThrow();
    const job = await this.usersBulkCreateQueue.getJob(jobId);
    if (!job || job.data.tenantId !== tenantId) {
      throw new NotFoundException('Importación no encontrada.');
    }

    const state = await job.getState();
    if (state !== 'completed') {
      throw new BadRequestException('La importación aún no ha terminado.');
    }

    const store = await this.readBulkResultStore(tenantId, jobId);
    if (!store) {
      throw new NotFoundException('Resultado de importación no disponible.');
    }

    // D-1: quien revela lo decide `SET NX`, no el flag del store. El
    // read-modify-write anterior dejaba pasar dos peticiones concurrentes —
    // ambas leian `credentialsClaimed: false` y ambas devolvian los secretos.
    const revelar = await this.tryMarkBulkCredentialsClaimed(tenantId, jobId);

    if (!revelar) {
      return {
        jobId,
        status: 'completed',
        summary: store.summary,
        succeeded: store.succeeded.map(({ temporaryPassword: _tp, ...rest }) => rest),
        failed: store.failed,
        credentialsClaimed: true,
      };
    }

    store.credentialsClaimed = true;
    await this.writeBulkResultStore(tenantId, jobId, store);

    return {
      jobId,
      status: 'completed',
      summary: store.summary,
      succeeded: store.succeeded,
      failed: store.failed,
      credentialsClaimed: true,
    };
  }

  /**
   * Ejecuta el lote (invocado por el worker con tenant explícito).
   * `createdAt` se lee del registro persistido.
   */
  async executeBulkCreateJob(payload: UsersBulkCreateJobPayload, jobId: string): Promise<void> {
    // D-5: unico camino de escritura del modulo que no pasa por TenantMiddleware,
    // asi que valida por si mismo el contexto que recibe ANTES de tocar nada.
    const contexto = await this.resolveBulkJobContext(payload);
    if (!contexto) {
      await this.writeBulkResultStore(payload.tenantId, jobId, {
        summary: { total: payload.users.length, succeeded: 0, failed: payload.users.length },
        succeeded: [],
        failed: payload.users.map((item, index) => ({
          rowIndex: index + 1,
          email: item.email,
          // Motivo generico a proposito: el detalle del schema no viaja al cliente.
          reason: 'No fue posible validar el contexto del tenant para esta importacion.',
        })),
        credentialsClaimed: false,
      });
      return;
    }

    // D-2: el reintento parte del resultado del intento anterior — las filas ya
    // creadas se reconocen por idempotencia y conservan su contrasena temporal,
    // que no es recuperable de la base (solo se persiste el hash).
    const previo = await this.readBulkResultStore(payload.tenantId, jobId);
    const passwordsPrevias = new Map(
      (previo?.succeeded ?? [])
        .filter((fila) => Boolean(fila.temporaryPassword))
        .map((fila) => [fila.email, fila.temporaryPassword]),
    );

    return TenantContext.run(contexto, async () => {
      {
        const succeeded: UsersBulkCreateSucceededItem[] = [];
        const failed: UsersBulkCreateFailedItem[] = [];

        for (let i = 0; i < payload.users.length; i++) {
          const item = payload.users[i]!;
          const rowIndex = i + 1;

          try {
            const dto = new CreateUserDto();
            dto.email = item.email;
            dto.role = item.role as UserRole;
            if (item.firstName !== undefined) dto.firstName = item.firstName;
            if (item.lastName !== undefined) dto.lastName = item.lastName;
            if (item.phone !== undefined) dto.phone = item.phone;
            if (item.jobTitle !== undefined) dto.jobTitle = item.jobTitle;
            if (item.documentType !== undefined) {
              dto.documentType = item.documentType as DocumentType;
            }
            if (item.documentNumber !== undefined) dto.documentNumber = item.documentNumber;
            if (item.isOperationalResource !== undefined) {
              dto.isOperationalResource = item.isOperationalResource;
            }

            const result = await this.create(
              dto,
              payload.actorUserId,
              payload.ipAddress,
              // D-2: idempotencia POR FILA. Sin ella, un reintento reportaba como
              // duplicadas las filas que el intento anterior si creo — y sus
              // contrasenas temporales quedaban irrecuperables.
              this.buildBulkRowIdempotencyKey(payload.idempotencyKey, rowIndex),
            );

            succeeded.push({
              email: item.email,
              firstName: item.firstName ?? null,
              lastName: item.lastName ?? null,
              role: item.role,
              // En un replay idempotente `create` no reemite contrasena: se
              // arrastra la del intento previo.
              temporaryPassword: result.temporaryPassword ?? passwordsPrevias.get(item.email) ?? '',
              createdAt:
                result.createdAt instanceof Date
                  ? result.createdAt.toISOString()
                  : String(result.createdAt),
            });
          } catch (error: unknown) {
            failed.push({
              rowIndex,
              email: item.email,
              reason: this.describeBulkRowFailure(error),
            });
          }
        }

        const store: BulkResultStore = {
          summary: {
            total: payload.users.length,
            succeeded: succeeded.length,
            failed: failed.length,
          },
          succeeded,
          failed,
          // Un reintento reescribe el store; no puede des-reclamar credenciales
          // que ya se entregaron.
          credentialsClaimed: previo?.credentialsClaimed ?? false,
        };

        await this.writeBulkResultStore(payload.tenantId, jobId, store);
      }
    });
  }

  /**
   * Actualiza status y/o rol del usuario.
   * Registra oldValue/newValue en el audit trail.
   * Idempotente por Idempotency-Key cuando se provee.
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    actorUserId: string,
    actorRole: string,
    idempotencyKey?: string,
  ): Promise<UserResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    // Frontera de roles: la escalada empezaba en un PATCH con role SYSTEM_ADMIN (H-01).
    if (dto.role !== undefined) {
      this.assertTenantAssignableRole(dto.role);
    }

    const fingerprint = this.fingerprintPayload({ id, ...dto });
    let cacheKey: string | null = null;
    if (idempotencyKey?.trim()) {
      const lookup = await this.readIdempotencyRecord('update', idempotencyKey);
      cacheKey = lookup.cacheKey;
      if (lookup.record) {
        this.assertSameIdempotencyFingerprint(lookup.record, fingerprint);
        if (lookup.record.userId) {
          return this.findUserDtoById(lookup.record.userId);
        }
      }
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException(`Usuario ${id} no encontrado.`);

      // Un usuario no-ADMIN solo puede actualizar su propio perfil
      if (
        actorRole !== UserRole.ADMIN &&
        actorRole !== PlatformRole.SYSTEM_ADMIN &&
        actorUserId !== id
      ) {
        throw new ForbiddenException('No tienes permisos para actualizar este usuario.');
      }

      // E-01: ADMIN peer barrier — mismo modelo que remove().
      // R-01: exime self-edit (un ADMIN sí puede editar su propia fila).
      if (
        user.id !== actorUserId &&
        user.role === UserRole.ADMIN &&
        actorRole !== PlatformRole.SYSTEM_ADMIN
      ) {
        throw new ForbiddenException('No es posible modificar a otro administrador del tenant.');
      }

      if (await this.isPrincipalAdminUser(user.tenantId, user.id)) {
        throw new ConflictException(
          'No es posible modificar al administrador principal de la empresa. ' +
            'Designa primero a otro administrador principal.',
        );
      }

      const oldValue = {
        status: user.status,
        role: user.role,
        isOperationalResource: user.isOperationalResource,
      };

      if (dto.status !== undefined) user.status = dto.status;
      if (dto.role !== undefined) user.role = dto.role;
      // Perfil personal — texto plano, manteniendo compatibilidad de lectura legacy.
      if (dto.firstName !== undefined) user.firstName = dto.firstName?.trim() ?? null;
      if (dto.lastName !== undefined) user.lastName = dto.lastName?.trim() ?? null;
      if (dto.phone !== undefined) user.phone = dto.phone ?? null;
      if (dto.jobTitle !== undefined) user.jobTitle = dto.jobTitle ?? null;
      if (dto.documentType !== undefined) user.documentType = dto.documentType ?? null;
      if (dto.documentNumber !== undefined)
        user.documentNumber = dto.documentNumber?.trim() ?? null;
      if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl ?? null;
      if (dto.mfaRequired !== undefined) user.mfaRequired = dto.mfaRequired;
      if (dto.isOperationalResource !== undefined)
        user.isOperationalResource = dto.isOperationalResource;

      await qr.manager.save(User, user);

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'User',
        entityId: id,
        userId: actorUserId,
        oldValue,
        newValue: {
          status: user.status,
          role: user.role,
          isOperationalResource: user.isOperationalResource,
        },
      });

      if (cacheKey) {
        await this.writeIdempotencyRecord(cacheKey, { fingerprint, userId: user.id });
      }

      this.fireAndForget(
        this.searchQueueService.enqueueUserUpsert(user.tenantId, user.id),
        'cola de busqueda upsert usuario',
      );
      return this.toDto(user);
    });
  }

  /**
   * Cambia el email de acceso del propio usuario.
   * Si el usuario coincide con el ADMIN principal del tenant, sincroniza también
   * el email de contacto de la empresa en public.tenants.
   */
  async changeLoginEmail(
    id: string,
    dto: ChangeUserLoginEmailDto,
    actorUserId: string,
  ): Promise<UserResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) {
        throw new NotFoundException(`Usuario ${id} no encontrado.`);
      }

      if (actorUserId !== id) {
        throw new ForbiddenException('No tienes permisos para cambiar este email de acceso.');
      }

      const passwordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!passwordValid) {
        throw new BadRequestException('La contraseña actual no es válida.');
      }

      const normalizedEmail = dto.email.toLowerCase().trim();
      const previousEmailHash = user.emailHash;
      const nextEmailHash = hashEmail(normalizedEmail);

      if (nextEmailHash !== previousEmailHash) {
        const existingUser = await qr.manager.findOne(User, {
          where: { email: normalizedEmail },
          withDeleted: false,
        });

        if (existingUser && existingUser.id !== user.id) {
          throw new ConflictException('Ya existe un usuario con ese email en este tenant.');
        }

        user.email = normalizedEmail;
        user.emailHash = nextEmailHash;
        await qr.manager.save(User, user);
      }

      const shouldSyncContactEmail = dto.syncCompanyContactEmail !== false;
      const shouldUpdateTenantContactEmail = shouldSyncContactEmail
        ? await this.isPrincipalAdminUser(user.tenantId, user.id)
        : false;

      if (shouldUpdateTenantContactEmail) {
        await this.tenantService.updateTenantSelfProfile(
          user.tenantId,
          { contactEmail: normalizedEmail },
          actorUserId,
        );
      }

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'UserLoginEmail',
        entityId: user.id,
        userId: actorUserId,
        oldValue: {
          previousEmailHash,
        },
        newValue: {
          nextEmailHash,
          loginEmailChanged: nextEmailHash !== previousEmailHash,
          companyContactEmailSynced: shouldUpdateTenantContactEmail,
        },
      });

      this.fireAndForget(
        this.searchQueueService.enqueueUserUpsert(user.tenantId, user.id),
        'cola de busqueda upsert usuario',
      );
      return this.toDto(user);
    });
  }

  /**
   * Cambia el email de acceso de un usuario por acción administrativa.
   * No requiere contraseña actual, pero mantiene controles RBAC y auditoría.
   * Idempotente por Idempotency-Key cuando se provee.
   */
  async changeLoginEmailAsAdmin(
    id: string,
    dto: AdminChangeUserLoginEmailDto,
    actorUserId: string,
    actorRole: string,
    idempotencyKey?: string,
  ): Promise<UserResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    const fingerprint = this.fingerprintPayload({
      id,
      email: dto.email.toLowerCase().trim(),
      syncCompanyContactEmail: dto.syncCompanyContactEmail ?? true,
    });
    let cacheKey: string | null = null;
    if (idempotencyKey?.trim()) {
      const lookup = await this.readIdempotencyRecord('login-email-admin', idempotencyKey);
      cacheKey = lookup.cacheKey;
      if (lookup.record) {
        this.assertSameIdempotencyFingerprint(lookup.record, fingerprint);
        if (lookup.record.userId) {
          return this.findUserDtoById(lookup.record.userId);
        }
      }
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) {
        throw new NotFoundException(`Usuario ${id} no encontrado.`);
      }

      // Defensa en profundidad tras ADR-061 §4: el dominio de `users.role` ya no
      // admite roles de plataforma (enum + CHECK de la migracion tenant 085),
      // pero la comprobacion se hace sobre el literal persistido para cubrir un
      // schema que no haya pasado por el runner.
      this.assertTargetIsNotPlatformUser(user.role, actorRole);

      // E-01: ADMIN peer barrier — mismo modelo que remove().
      if (user.role === UserRole.ADMIN && actorRole !== PlatformRole.SYSTEM_ADMIN) {
        throw new ForbiddenException(
          'No es posible modificar el email de otro administrador del tenant.',
        );
      }

      if (await this.isPrincipalAdminUser(user.tenantId, user.id)) {
        throw new ConflictException(
          'No es posible modificar el email del administrador principal de la empresa. ' +
            'Designa primero a otro administrador principal.',
        );
      }

      const normalizedEmail = dto.email.toLowerCase().trim();
      const previousEmailHash = user.emailHash;
      const nextEmailHash = hashEmail(normalizedEmail);
      const emailChanged = nextEmailHash !== previousEmailHash;

      if (emailChanged) {
        const existingUser = await qr.manager.findOne(User, {
          where: { email: normalizedEmail },
          withDeleted: false,
        });

        if (existingUser && existingUser.id !== user.id) {
          throw new ConflictException('Ya existe un usuario con ese email en este tenant.');
        }

        user.email = normalizedEmail;
        user.emailHash = nextEmailHash;
        await qr.manager.save(User, user);
      }

      const shouldSyncContactEmail = dto.syncCompanyContactEmail !== false;
      const shouldUpdateTenantContactEmail =
        shouldSyncContactEmail && emailChanged
          ? await this.isPrincipalAdminUser(user.tenantId, user.id)
          : false;

      if (shouldUpdateTenantContactEmail) {
        await this.tenantService.updateTenantSelfProfile(
          user.tenantId,
          { contactEmail: normalizedEmail },
          actorUserId,
        );
      }

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'UserLoginEmailAdmin',
        entityId: user.id,
        userId: actorUserId,
        oldValue: {
          previousEmailHash,
        },
        newValue: {
          nextEmailHash,
          loginEmailChanged: emailChanged,
          companyContactEmailSynced: shouldUpdateTenantContactEmail,
        },
      });

      if (cacheKey) {
        await this.writeIdempotencyRecord(cacheKey, { fingerprint, userId: user.id });
      }

      this.fireAndForget(
        this.searchQueueService.enqueueUserUpsert(user.tenantId, user.id),
        'cola de busqueda upsert usuario',
      );
      return this.toDto(user);
    });
  }

  /**
   * Soft delete de usuario.
   *
   * RF-RBAC-04: un ADMIN de tenant no puede eliminar a otro ADMIN del mismo
   * tenant; un SYSTEM_ADMIN de plataforma sí (incluidos ADMINs).
   *
   * ADR-063: el administrador principal designado NO puede eliminarse mientras
   * lo sea — ni siquiera por un SYSTEM_ADMIN. Hay que transferir la designación
   * primero (`transferPrincipalAdmin`). El modo de fallo que motivó el ADR es
   * exactamente que el borrado moviera el principal en silencio; permitir el
   * borrado y reasignar aquí lo reintroduciría por otra vía.
   */
  async remove(id: string, actorUserId: string, actorRole: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException(`Usuario ${id} no encontrado.`);

      if (user.id === actorUserId) {
        throw new BadRequestException('No puedes eliminar tu propio usuario.');
      }

      // Defensa en profundidad tras ADR-061 §4 — ver `assertTargetIsNotPlatformUser`.
      // Antes esta regla solo miraba `role === ADMIN`, asi que un objetivo con
      // rol de plataforma persistido no quedaba protegido en absoluto.
      this.assertTargetIsNotPlatformUser(user.role, actorRole);

      // RF-RBAC-04: solo aplica para ADMIN de tenant — SYSTEM_ADMIN puede eliminar ADMINs
      if (user.role === UserRole.ADMIN && actorRole !== PlatformRole.SYSTEM_ADMIN) {
        throw new ForbiddenException('No es posible eliminar a otro administrador del tenant.');
      }

      if (await this.isPrincipalAdminUser(user.tenantId, user.id)) {
        throw new ConflictException(
          'No es posible eliminar al administrador principal de la empresa. ' +
            'Designa primero a otro administrador principal.',
        );
      }

      // Soft delete via softRemove — establece deletedAt
      await qr.manager.softRemove(User, user);

      await this.auditService.log({
        action: AuditAction.DELETE,
        entityType: 'User',
        entityId: id,
        userId: actorUserId,
      });

      this.fireAndForget(
        this.searchQueueService.enqueueUserDelete(id),
        'cola de busqueda delete usuario',
      );
    });
  }

  /**
   * Transfiere la designación de administrador principal del tenant (ADR-063).
   *
   * Es la ÚNICA vía por la que el principal cambia. Deliberadamente explícita y
   * auditada: la alternativa —dejar que un borrado la moviera— es el modo de
   * fallo que el ADR corrige.
   *
   * Validaciones que pertenecen a este módulo (dueño de `users`): el sucesor
   * existe en el schema del tenant, está activo, no tiene soft-delete y es
   * `UserRole.ADMIN`. La persistencia y el asiento de auditoría los hace
   * `TenantService`, dueño de `public.tenants`.
   */
  async transferPrincipalAdmin(
    newPrincipalUserId: string,
    actorUserId: string,
  ): Promise<UserResponseDto> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    const successor = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id: newPrincipalUserId } });
      if (!user) {
        throw new NotFoundException(`Usuario ${newPrincipalUserId} no encontrado.`);
      }

      if (user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
        throw new BadRequestException(
          'El administrador principal debe ser un usuario activo de la empresa.',
        );
      }

      if (user.role !== UserRole.ADMIN) {
        throw new BadRequestException(
          'Solo un usuario con rol de administrador puede ser administrador principal.',
        );
      }

      return user;
    });

    await this.tenantService.setPrincipalAdminUserId(tenantId, successor.id, actorUserId);

    return this.toDto(successor);
  }

  /** Reinicia el password de un usuario por acción administrativa. */
  async resetPassword(
    id: string,
    actorId: string,
    actorRole: string,
    ipAddress: string,
    password?: string,
    idempotencyKey?: string,
  ): Promise<{ temporaryPassword: string }> {
    const { schemaName } = TenantContext.getOrThrow();

    const fingerprint = this.fingerprintPayload({
      id,
      hasPassword: Boolean(password),
    });

    if (idempotencyKey?.trim()) {
      const lookup = await this.readIdempotencyRecord('reset-password', idempotencyKey);
      if (lookup.record) {
        this.assertSameIdempotencyFingerprint(lookup.record, fingerprint);
        // Misma clave que auth: no se re-sirve la contraseña temporal.
        throw new ConflictException(
          'Ya se emitio una contraseña temporal con esta clave de idempotencia. ' +
            'La contraseña solo se muestra una vez. Si se perdio, use una clave nueva.',
        );
      }
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) {
        throw new NotFoundException(`Usuario ${id} no encontrado.`);
      }

      // Defensa en profundidad tras ADR-061 §4 — ver `assertTargetIsNotPlatformUser`.
      this.assertTargetIsNotPlatformUser(user.role, actorRole);

      // E-01: ADMIN peer barrier — mismo modelo que remove().
      if (user.role === UserRole.ADMIN && actorRole !== PlatformRole.SYSTEM_ADMIN) {
        throw new ForbiddenException(
          'No es posible reiniciar la contraseña de otro administrador del tenant.',
        );
      }

      if (await this.isPrincipalAdminUser(user.tenantId, user.id)) {
        throw new ConflictException(
          'No es posible reiniciar la contraseña del administrador principal de la empresa. ' +
            'Designa primero a otro administrador principal.',
        );
      }

      const temporaryPassword = password ?? crypto.randomBytes(TEMP_PASSWORD_BYTES).toString('hex');
      user.passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      user.passwordResetRequired = true;
      await qr.manager.save(User, user);

      await this.auditService.log({
        action: AuditAction.PASSWORD_CHANGED,
        entityType: 'UserPasswordReset',
        entityId: user.id,
        userId: actorId,
        ipAddress,
      });

      if (idempotencyKey?.trim()) {
        const { tenantId } = TenantContext.getOrThrow();
        const cacheKey = this.buildIdempotencyCacheKey(
          'reset-password',
          tenantId,
          idempotencyKey.trim(),
        );
        await this.writeIdempotencyRecord(cacheKey, {
          fingerprint,
          userId: user.id,
          issued: true,
        });
      }

      return { temporaryPassword };
    });
  }

  /** Retorna el perfil del usuario autenticado. */
  async findMe(actorId: string): Promise<UserResponseDto> {
    return this.findUserDtoById(actorId);
  }

  /**
   * Expone un read-model mínimo para indexación cross-tenant en búsqueda global.
   * Mantiene el boundary de UsersModule: SearchModule no toca la tabla directamente.
   */
  async listForSearchIndex(params: {
    schemaName: string;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
  }): Promise<SearchIndexUserRecord[]> {
    return runInTenantSchema(this.dataSource, params.schemaName, async (qr) => {
      const users = await qr.manager.find(User, {
        where: { tenantId: params.tenantId },
        order: { updatedAt: 'DESC' },
      });

      return users.map((user) => {
        const dto = this.toDto(user);
        const routeParams = new URLSearchParams({
          tenant: params.tenantSlug,
          search: dto.id,
          openUser: dto.id,
        });

        return {
          id: dto.id,
          email: dto.email,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          jobTitle: dto.jobTitle ?? null,
          role: dto.role,
          status: dto.status,
          tenantId: params.tenantId,
          tenantSlug: params.tenantSlug,
          tenantName: params.tenantName,
          route: `/users?${routeParams.toString()}`,
          updatedAt: dto.updatedAt.getTime(),
        } satisfies SearchIndexUserRecord;
      });
    });
  }

  /** Actualiza solo los campos de perfil del usuario autenticado. */
  async updateMe(
    actorId: string,
    dto: UpdateProfileDto,
    ipAddress: string,
  ): Promise<UserResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id: actorId } });
      if (!user) {
        throw new NotFoundException(`Usuario ${actorId} no encontrado.`);
      }

      if (dto.firstName !== undefined) user.firstName = dto.firstName?.trim() ?? null;
      if (dto.lastName !== undefined) user.lastName = dto.lastName?.trim() ?? null;
      if (dto.phone !== undefined) user.phone = dto.phone ?? null;
      if (dto.jobTitle !== undefined) user.jobTitle = dto.jobTitle ?? null;
      if (dto.documentType !== undefined) user.documentType = dto.documentType ?? null;
      if (dto.documentNumber !== undefined)
        user.documentNumber = dto.documentNumber?.trim() ?? null;
      if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl ?? null;

      await qr.manager.save(User, user);

      this.fireAndForget(
        this.auditService.log({
          action: AuditAction.UPDATE,
          entityType: 'UserProfile',
          entityId: user.id,
          userId: actorId,
          ipAddress,
        }),
        'auditoria update perfil propio',
      );

      return this.toDto(user);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /** Carga un usuario por id sin re-evaluar autorizacion (uso interno / findMe). */
  private async findUserDtoById(id: string): Promise<UserResponseDto> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    const principalAdminUserId = await this.tenantService.getPrincipalAdminUserId(tenantId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException(`Usuario ${id} no encontrado.`);
      return this.toDto(user, principalAdminUserId);
    });
  }

  /**
   * Convierte entidad User a DTO publico.
   * Perfil en texto plano (H-14: sin ruta de descifrado legacy).
   * documentNumber se devuelve para edicion en portal interno autenticado.
   */
  private toDto(user: User, principalAdminUserId?: string | null): UserResponseDto {
    return {
      ...(principalAdminUserId !== undefined
        ? { isPrincipalAdmin: principalAdminUserId === user.id }
        : {}),
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      status: user.status as UserStatus,
      tenantId: user.tenantId,
      mfaEnabled: user.mfaEnabled,
      mfaRequired: user.mfaRequired,
      isOperationalResource: user.isOperationalResource,
      emailVerified: user.emailVerified,
      passwordResetRequired: user.passwordResetRequired,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      phone: user.phone ?? null,
      jobTitle: user.jobTitle ?? null,
      documentType: (user.documentType as DocumentType) ?? null,
      avatarUrl: user.avatarUrl ?? null,
      documentNumber: user.documentNumber ?? null,
    };
  }

  /**
   * Fire-and-forget con registro visible de fallo (H-13).
   * No interrumpe la petición; solo deja de silenciar el rechazo.
   * Promise.resolve tolera callers/mocks que no retornan una Promise.
   */
  private fireAndForget(task: PromiseLike<unknown> | unknown, context: string): void {
    void Promise.resolve(task).catch((err: unknown) => {
      this.logger.warn(`Fallo en ${context}: ${String(err)}`);
    });
  }

  private normalizeSearchValue(value: string | null | undefined): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  private escapeLikePattern(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  private mapUserRow(row: Record<string, unknown>): User {
    return {
      id: String(row['id']),
      email: String(row['email']),
      emailHash: String(row['email_hmac'] ?? row['emailHash'] ?? ''),
      passwordHash: String(row['password_hash'] ?? row['passwordHash'] ?? ''),
      role: row['role'] as UserRole,
      status: row['status'] as UserStatus,
      tenantId: String(row['tenant_id'] ?? row['tenantId'] ?? ''),
      mfaEnabled: Boolean(row['mfa_enabled'] ?? row['mfaEnabled']),
      mfaSecret: (row['mfa_secret'] ?? row['mfaSecret'] ?? null) as string | null,
      mfaRequired: Boolean(row['mfa_required'] ?? row['mfaRequired']),
      isOperationalResource: Boolean(
        row['is_operational_resource'] ?? row['isOperationalResource'],
      ),
      passwordResetRequired: Boolean(
        row['password_reset_required'] ?? row['passwordResetRequired'],
      ),
      passwordResetToken: (row['password_reset_token'] ?? row['passwordResetToken'] ?? null) as
        | string
        | null,
      passwordResetTokenExpiresAt: (row['password_reset_token_expires_at'] ??
        row['passwordResetTokenExpiresAt'] ??
        null) as Date | null,
      passwordResetExpiresAt: (row['password_reset_expires_at'] ??
        row['passwordResetExpiresAt'] ??
        null) as Date | null,
      failedLoginAttempts: Number(row['failed_login_attempts'] ?? row['failedLoginAttempts'] ?? 0),
      lockedUntil: (row['locked_until'] ?? row['lockedUntil'] ?? null) as Date | null,
      lastLoginAt: (row['last_login_at'] ?? row['lastLoginAt'] ?? null) as Date | null,
      emailVerified: Boolean(row['email_verified'] ?? row['emailVerified']),
      emailVerificationToken: (row['email_verification_token'] ??
        row['emailVerificationToken'] ??
        null) as string | null,
      firstName: (row['first_name'] ?? row['firstName'] ?? null) as string | null,
      lastName: (row['last_name'] ?? row['lastName'] ?? null) as string | null,
      phone: (row['phone'] ?? null) as string | null,
      jobTitle: (row['job_title'] ?? row['jobTitle'] ?? null) as string | null,
      documentType: (row['document_type'] ?? row['documentType'] ?? null) as DocumentType | null,
      documentNumber: (row['document_number'] ?? row['documentNumber'] ?? null) as string | null,
      avatarUrl: (row['avatar_url'] ?? row['avatarUrl'] ?? null) as string | null,
      createdAt: new Date(String(row['created_at'] ?? row['createdAt'])),
      updatedAt: new Date(String(row['updated_at'] ?? row['updatedAt'])),
      deletedAt: (row['deleted_at'] ?? row['deletedAt'] ?? null) as Date | null,
    } as User;
  }

  /**
   * Estado que se anuncia al aceptar (o reconocer) un lote.
   *
   * D-3: el mapeo anterior colapsaba en `queued` todo lo que no fuera
   * `completed`/`active`, asi que un lote que agoto sus reintentos se anunciaba
   * como encolado. Como el jobId es determinista, BullMQ deduplicaba y no habia
   * nada que esperar: el cliente polleaba para siempre un job en `failed`.
   */
  private mapAcceptedJobStatus(state: string): UsersBulkCreateAcceptedResponse['status'] {
    if (state === 'completed') return 'completed';
    if (state === 'failed') return 'failed';
    if (state === 'active') return 'active';
    return 'queued';
  }

  /** Clave de idempotencia por fila del lote (D-2). Estable entre reintentos. */
  private buildBulkRowIdempotencyKey(batchKey: string, rowIndex: number): string {
    return `bulk:${batchKey}:${rowIndex}`;
  }

  /**
   * Motivo accionable para el operador (D-4).
   *
   * Los errores de negocio ya vienen redactados y se conservan. Cualquier otro
   * se resume: antes se propagaba `error.message` literal al cliente, y un
   * schema invalido devolvia por HTTP el nombre del schema y la regla interna
   * de aislamiento.
   */
  private describeBulkRowFailure(error: unknown): string {
    if (error instanceof ConflictException) {
      return 'El email ya existe en este tenant.';
    }

    if (
      error instanceof BadRequestException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException
    ) {
      return error.message;
    }

    if (error instanceof Error) {
      this.logger.error(`Fallo inesperado al crear usuario en lote: ${error.message}`);
    }

    return 'Error desconocido al crear el usuario.';
  }

  /**
   * Contexto autoritativo del job (D-5).
   *
   * El payload llega de la cola, no de `TenantMiddleware`. `isValidSchemaName`
   * solo exige el prefijo `tenant_`, asi que no verificaba que el schema fuese
   * de verdad el del tenant: un payload con el tenantId de A y el schema de B
   * habria escrito los usuarios en B guardando el resultado —con credenciales—
   * bajo la clave de A. El slug tambien se toma del registro, no del payload.
   *
   * Fail-closed: si el registro no confirma el par, no se escribe nada.
   */
  private async resolveBulkJobContext(
    payload: UsersBulkCreateJobPayload,
  ): Promise<{ tenantId: string; schemaName: string; tenantSlug: string } | null> {
    try {
      const tenant = await this.tenantService.findById(payload.tenantId);
      if (!tenant || tenant.schemaName !== payload.schemaName) {
        this.logger.error(
          `Contexto de job bulk incoherente para tenant ${payload.tenantId}: el schema del payload no corresponde al registro.`,
        );
        return null;
      }

      return {
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        tenantSlug: tenant.slug,
      };
    } catch (error: unknown) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(`No fue posible resolver el contexto del job bulk: ${detalle}`);
      return null;
    }
  }

  private bulkResultCacheKey(tenantId: string, jobId: string): string {
    return `users:bulk-result:${tenantId}:${jobId}`;
  }

  /** Clave dedicada de la marca de reclamo one-time, independiente del store. */
  private bulkClaimCacheKey(tenantId: string, jobId: string): string {
    return `users:bulk-claim:${tenantId}:${jobId}`;
  }

  /**
   * Marca el reclamo de forma atomica (D-1).
   *
   * `SET NX` resuelve en un solo viaje quien revela las credenciales: devuelve
   * `false` a cualquier llamada posterior o concurrente. Vive en su propia clave
   * para que reescribir el store —un reintento del job— no la borre.
   */
  private async tryMarkBulkCredentialsClaimed(tenantId: string, jobId: string): Promise<boolean> {
    const result = await this.redis.set(
      this.bulkClaimCacheKey(tenantId, jobId),
      '1',
      'EX',
      BULK_RESULT_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  private async isBulkCredentialsClaimed(tenantId: string, jobId: string): Promise<boolean> {
    return (await this.redis.get(this.bulkClaimCacheKey(tenantId, jobId))) !== null;
  }

  private async readBulkResultStore(
    tenantId: string,
    jobId: string,
  ): Promise<BulkResultStore | null> {
    const raw = await this.redis.get(this.bulkResultCacheKey(tenantId, jobId));
    if (!raw) return null;
    return JSON.parse(raw) as BulkResultStore;
  }

  private async writeBulkResultStore(
    tenantId: string,
    jobId: string,
    store: BulkResultStore,
  ): Promise<void> {
    await this.redis.set(
      this.bulkResultCacheKey(tenantId, jobId),
      JSON.stringify(store),
      'EX',
      BULK_RESULT_TTL_SECONDS,
    );
  }

  /**
   * ¿Es este usuario el administrador principal del tenant? (ADR-063)
   *
   * Lee el atributo explícito `public.tenants.principal_admin_user_id` a través
   * de `TenantService` — la tabla es del boundary del módulo de tenant, no de
   * este. Antes la regla se **derivaba** («el ADMIN activo más antiguo por
   * `createdAt`»), y por eso el principal cambiaba en silencio cuando se
   * eliminaba a ese usuario. Ese modo de fallo es el que motivó el ADR.
   *
   * Un tenant sin designación devuelve `false` para todos: la regla derivada
   * tampoco señalaba a nadie cuando no había ADMIN activo.
   */
  private async isPrincipalAdminUser(tenantId: string, userId: string): Promise<boolean> {
    const principalAdminUserId = await this.tenantService.getPrincipalAdminUserId(tenantId);

    return principalAdminUserId !== null && principalAdminUserId === userId;
  }
}
