import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource, type EntityManager } from 'typeorm';
import { runInTenantSchema, summarizeErrorForLog } from '@iwana/db';
import {
  AuditAction,
  MIGRATION_IMPORT_FETCH_UISP_USERS_JOB,
  MIGRATION_IMPORT_QUEUE,
  UserRole,
  type MigrationFetchUispUsersJob,
  type MigrationUispUser,
  type MigrationUispUsersFetchAccepted,
  type MigrationUispUsersListMeta,
  BUSINESS_JOB_REMOVE_ON_FAIL,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import {
  MIGRATION_FETCH_UISP_USERS_ATTEMPTS,
  MIGRATION_FETCH_UISP_USERS_BACKOFF_MS,
  MIGRATION_UISP_USERS_AUDIT_ENTITY,
  migrationFetchUispUsersJobId,
} from './migration.constants';
import { MigrationCrypto } from './migration-crypto';
import type { MigrationTenantScope } from './migration-batches.service';
import { MigrationPermanentError } from './migration-simulation.service';
import {
  MigrationSourceConnectionService,
  checkResultOf,
  sourceNotConfigured,
} from './migration-source-connection.service';
import { MigrationUserDirectoryPort } from './ports/migration-user-directory.port';
import { UispAdminsResponseError, parseUispAdmins } from './uisp-api/uisp-admins';
import { UispApiClient, UispApiError } from './uisp-api/uisp-api.client';
import {
  collectUispProcessUserRefs,
  type UispProcess,
  type UispProcessRefs,
} from './uisp-api/uisp-process-user-refs';
import { STAGED_ENTITIES_WITH_UISP_USERS, stagedUispUserRefs } from './uisp/uisp-staged-user-refs';

interface UispUserRow {
  id: string;
  uisp_user_id: number;
  display_name_encrypted: string | null;
  email_encrypted: string | null;
  is_active_in_uisp: boolean | null;
  source: MigrationUispUser['source'];
  status: MigrationUispUser['status'];
  matched_user_id: string | null;
  target_user_id: string | null;
  proposed_role: UserRole | null;
  last_fetched_at: Date | string | null;
}

/** Resumen de una lectura (solo conteos, sin PII): va a la auditoría y al log. */
export interface UispUsersFetchSummary {
  api: number;
  nuevos: number;
  actualizados: number;
  /** Filas ya resueltas (o pendientes sin cambio de fuente) que la lectura no tocó. */
  intactos: number;
  coincidencias: number;
  sinDatos: number;
  omitidos: number;
  /**
   * Recorrido de tickets, pagos y tareas de UISP (ADR-110 v1.3 D15): elementos leídos por
   * proceso, números del personal que aparecen ahí y no en `users/admins`, y procesos que no se
   * pudieron leer o que se cortaron por el tope de páginas.
   */
  procesos: {
    leidos: Record<UispProcess, number>;
    eliminadosEnProcesos: number;
    sinLeer: UispProcess[];
    truncados: UispProcess[];
  };
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/** `persona@dominio.co` → `p***@dominio.co` (decisión del bloque A); `null` si no es correo. */
export function maskUispEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return `${Array.from(email)[0]}***@${email.slice(at + 1)}`;
}

/**
 * Usuarios del personal desde la API de UISP (ADR-110 D15; spec 2026-11-15 «usuarios» §2.2,
 * §2.3): encola la lectura, la ejecuta en el job (upsert por número de UISP, coincidencia por
 * HMAC del correo vía Usuarios y filas «sin datos» desde las intermedias vigentes) y lista las
 * filas de revisión. Resolver, crear e invitar son del bloque C.
 */
@Injectable()
export class MigrationUispUsersService {
  private readonly logger = new Logger(MigrationUispUsersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(MIGRATION_IMPORT_QUEUE) private readonly queue: Queue,
    private readonly crypto: MigrationCrypto,
    private readonly auditService: AuditService,
    private readonly connections: MigrationSourceConnectionService,
    private readonly client: UispApiClient,
    private readonly users: MigrationUserDirectoryPort,
  ) {}

  /** «Traer usuarios de UISP»: audita y encola en la misma transacción; payload solo de ids. */
  async requestFetch(
    scope: MigrationTenantScope,
    actorId: string,
  ): Promise<MigrationUispUsersFetchAccepted> {
    const requestedAt = new Date();
    await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const [connection] = (await qr.query(
        `SELECT id FROM migration_source_connections
          WHERE tenant_id = $1 AND source_system = 'UISP'`,
        [scope.tenantId],
      )) as Array<{ id: string }>;
      if (!connection) throw sourceNotConfigured();
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: MIGRATION_UISP_USERS_AUDIT_ENTITY,
          entityId: connection.id,
          userId: actorId,
          tenantId: scope.tenantId,
          schemaName: scope.schemaName,
          newValue: { solicitud: 'TRAER_USUARIOS' },
        },
        qr.manager,
      );
      const payload: MigrationFetchUispUsersJob = {
        version: 1,
        tenantId: scope.tenantId,
        actorId,
      };
      try {
        await this.queue.add(MIGRATION_IMPORT_FETCH_UISP_USERS_JOB, payload, {
          jobId: migrationFetchUispUsersJobId(scope.tenantId, requestedAt),
          attempts: MIGRATION_FETCH_UISP_USERS_ATTEMPTS,
          backoff: { type: 'exponential', delay: MIGRATION_FETCH_UISP_USERS_BACKOFF_MS },
          removeOnComplete: 1_000,
          removeOnFail: BUSINESS_JOB_REMOVE_ON_FAIL, // B(b) familia N: 14 días
        });
      } catch (error) {
        this.logger.error(
          `[migration] No se pudo encolar la lectura de usuarios de UISP (tenant=${scope.tenantId}): ${summarizeErrorForLog(error)}`,
        );
        throw new ServiceUnavailableException({
          code: 'MIGRATION_ENQUEUE_FAILED',
          message: 'No se pudo iniciar la lectura de usuarios. Intenta de nuevo.',
        });
      }
    });
    return { status: 'EN_CURSO', requestedAt: requestedAt.toISOString() };
  }

  /**
   * Job: lee `users/admins` y deja una fila de revisión por número de UISP. Idempotente: una
   * fila resuelta (ENLAZADO, CREADO, DESCARTADO) nunca se reabre ni recupera su PII.
   */
  async fetch(scope: MigrationTenantScope, actorId: string): Promise<UispUsersFetchSummary> {
    const loaded = await this.connections.load(scope);
    if (!loaded) throw new MigrationPermanentError('MIGRATION_SOURCE_NOT_CONFIGURED');

    let parsed: ReturnType<typeof parseUispAdmins>;
    let processes: UispProcessRefs;
    try {
      parsed = parseUispAdmins(await this.client.listAdmins(loaded.connection));
      // Personal eliminado que sigue en tickets, pagos y tareas: solo sus números.
      processes = await collectUispProcessUserRefs((path, limit, offset) =>
        this.client.listPage(loaded.connection, path, limit, offset),
      );
    } catch (error) {
      if (error instanceof UispApiError) {
        await this.connections.recordCheck(scope, checkResultOf(error), actorId);
        if (!error.retryable || error.kind === 'UNAUTHORIZED') {
          throw new MigrationPermanentError(
            error.kind === 'UNAUTHORIZED'
              ? 'MIGRATION_SOURCE_UNAUTHORIZED'
              : 'MIGRATION_SOURCE_UNREACHABLE',
          );
        }
        throw error;
      }
      if (error instanceof UispAdminsResponseError) {
        await this.connections.recordCheck(scope, 'UNREACHABLE', actorId);
        throw new MigrationPermanentError('MIGRATION_SOURCE_UNREACHABLE');
      }
      throw error;
    }

    const summary = await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const hashOf = new Map<number, string>();
      for (const admin of parsed.admins) {
        if (admin.email) hashOf.set(admin.uispUserId, this.crypto.emailHmac(admin.email));
      }
      const matches = await this.users.findUserIdsByEmailHash(
        { manager: qr.manager, tenantId: scope.tenantId },
        [...hashOf.values()],
      );

      const result: UispUsersFetchSummary = {
        api: parsed.admins.length,
        nuevos: 0,
        actualizados: 0,
        intactos: 0,
        coincidencias: 0,
        sinDatos: 0,
        omitidos: parsed.skipped,
        procesos: {
          leidos: processes.leidos,
          eliminadosEnProcesos: 0,
          sinLeer: processes.sinLeer,
          truncados: processes.truncados,
        },
      };
      for (const admin of parsed.admins) {
        const hash = hashOf.get(admin.uispUserId) ?? null;
        const matchedUserId = hash ? (matches.get(hash) ?? null) : null;
        const rows = (await qr.query(
          `INSERT INTO migration_uisp_users
             (tenant_id, uisp_user_id, display_name_encrypted, email_encrypted, email_hash,
              is_active_in_uisp, source, status, matched_user_id, last_fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'API', 'PENDIENTE', $7, now())
           ON CONFLICT (tenant_id, uisp_user_id) DO UPDATE
             SET display_name_encrypted = EXCLUDED.display_name_encrypted,
                 email_encrypted = EXCLUDED.email_encrypted,
                 email_hash = EXCLUDED.email_hash,
                 is_active_in_uisp = EXCLUDED.is_active_in_uisp,
                 source = 'API',
                 matched_user_id = EXCLUDED.matched_user_id,
                 last_fetched_at = now(),
                 updated_at = now()
             WHERE migration_uisp_users.status = 'PENDIENTE'
           RETURNING (xmax = 0) AS inserted`,
          [
            scope.tenantId,
            admin.uispUserId,
            admin.displayName ? this.crypto.encryptText(admin.displayName) : null,
            admin.email ? this.crypto.encryptText(admin.email) : null,
            hash,
            admin.isActive,
            matchedUserId,
          ],
        )) as Array<{ inserted: boolean }>;
        const [row] = rows;
        if (!row) result.intactos += 1;
        else if (row.inserted) result.nuevos += 1;
        else result.actualizados += 1;
        if (row && matchedUserId) result.coincidencias += 1;
      }

      const apiIds = new Set(parsed.admins.map((admin) => admin.uispUserId));
      const inProcesses = [...processes.refs.keys()].filter((id) => !apiIds.has(id));
      result.procesos.eliminadosEnProcesos = inProcesses.length;
      const referenced = new Set([
        ...(await this.stagedReferences(qr.manager, scope.tenantId)).keys(),
        ...inProcesses,
      ]);
      const missing = [...referenced].filter((id) => !apiIds.has(id)).sort((a, b) => a - b);
      if (missing.length > 0) {
        // Una fila «sin datos» pendiente que vuelve a aparecer renueva `last_fetched_at`: la
        // purga de 30 días solo se lleva las que ya no aparecen en ninguna lectura.
        const rows = (await qr.query(
          `INSERT INTO migration_uisp_users
             (tenant_id, uisp_user_id, source, status, last_fetched_at)
           SELECT $1, ids.id, 'SIN_DATOS', 'PENDIENTE', now()
             FROM unnest($2::int[]) AS ids(id)
           ON CONFLICT (tenant_id, uisp_user_id) DO UPDATE
             SET last_fetched_at = now(), updated_at = now()
             WHERE migration_uisp_users.status = 'PENDIENTE'
               AND migration_uisp_users.source = 'SIN_DATOS'
           RETURNING uisp_user_id, (xmax = 0) AS inserted`,
          [scope.tenantId, missing],
        )) as Array<{ uisp_user_id: number; inserted: boolean }>;
        result.sinDatos = rows.filter((row) => row.inserted).length;
      }

      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: MIGRATION_UISP_USERS_AUDIT_ENTITY,
          entityId: loaded.id,
          userId: actorId,
          tenantId: scope.tenantId,
          schemaName: scope.schemaName,
          newValue: { lectura: 'USERS_ADMINS_Y_PROCESOS', ...result },
        },
        qr.manager,
      );
      return result;
    });

    await this.connections.recordCheck(scope, 'OK', actorId);
    this.logger.log(
      `[migration] Usuarios de UISP leídos (tenant=${scope.tenantId}, api=${summary.api}, ` +
        `nuevos=${summary.nuevos}, actualizados=${summary.actualizados}, ` +
        `intactos=${summary.intactos}, sinDatos=${summary.sinDatos}, omitidos=${summary.omitidos}, ` +
        `tickets=${summary.procesos.leidos.TICKETS}, pagos=${summary.procesos.leidos.PAGOS}, ` +
        `tareas=${summary.procesos.leidos.TAREAS}, ` +
        `eliminadosEnProcesos=${summary.procesos.eliminadosEnProcesos}, ` +
        `sinLeer=${summary.procesos.sinLeer.join('|') || '-'}, ` +
        `truncados=${summary.procesos.truncados.join('|') || '-'}).`,
    );
    return summary;
  }

  /**
   * Fallo definitivo del job (permanente o último intento): deja `lastCheckResult` en la conexión
   * para que el portal, que sondea `lastCheckedAt`, deje de esperar (revisión del bloque D).
   *
   * - Errores de UISP (`UispApiError`) y permanentes ya registrados por `fetch`: no repite.
   * - Sin conexión (`MIGRATION_SOURCE_NOT_CONFIGURED`): no hay fila donde registrar. La lista
   *   conserva su `meta` (no cambia `lastFetchedAt`) y `GET /migration/uisp-connection`
   *   devuelve `data: null`; esa es la señal coherente para cortar la espera.
   * - Cualquier otro error (base de datos, clave ilegible, etc.): `UNREACHABLE`, el único
   *   resultado del contrato que pide al administrador probar la conexión y reintentar. No se
   *   amplía el enum del contrato.
   */
  async recordFetchFailure(
    scope: MigrationTenantScope,
    actorId: string,
    error: unknown,
  ): Promise<void> {
    if (error instanceof UispApiError || error instanceof MigrationPermanentError) return;
    await this.connections.recordCheck(scope, 'UNREACHABLE', actorId);
  }

  /** Lista de revisión: nombre descifrado, correo completo solo para ADMIN, lotes que la mencionan. */
  async list(
    scope: MigrationTenantScope,
    viewer: { id: string; role: UserRole },
  ): Promise<{ data: MigrationUispUser[]; meta: MigrationUispUsersListMeta }> {
    return runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT id, uisp_user_id, display_name_encrypted, email_encrypted, is_active_in_uisp,
                source, status, matched_user_id, target_user_id, proposed_role, last_fetched_at
           FROM migration_uisp_users
          WHERE tenant_id = $1
          ORDER BY (status = 'PENDIENTE') DESC, uisp_user_id`,
        [scope.tenantId],
      )) as UispUserRow[];
      const references = await this.stagedReferences(qr.manager, scope.tenantId);
      const fullEmail = viewer.role === UserRole.ADMIN;
      let lastFetchedAt: string | null = null;
      const data = rows.map((row): MigrationUispUser => {
        if (row.last_fetched_at) {
          const fetched = iso(row.last_fetched_at);
          if (!lastFetchedAt || fetched > lastFetchedAt) lastFetchedAt = fetched;
        }
        const email = this.decrypt(row.email_encrypted, row.id, 'email');
        return {
          id: row.id,
          uispUserId: Number(row.uisp_user_id),
          displayName: this.decrypt(row.display_name_encrypted, row.id, 'displayName'),
          email: email === null ? null : fullEmail ? email : maskUispEmail(email),
          isActiveInUisp: row.is_active_in_uisp,
          source: row.source,
          status: row.status,
          matchedUserId: row.matched_user_id,
          targetUserId: row.target_user_id,
          proposedRole: row.proposed_role,
          referencedInBatches: references.get(Number(row.uisp_user_id))?.size ?? 0,
        };
      });
      if (data.length > 0) {
        // Listado con nombres y correos del personal (ADR-067 §5): solo el conteo.
        await this.auditService.logWithin(
          {
            action: AuditAction.LIST_ACCESS,
            entityType: MIGRATION_UISP_USERS_AUDIT_ENTITY,
            entityId: scope.tenantId,
            userId: viewer.id,
            tenantId: scope.tenantId,
            schemaName: scope.schemaName,
            newValue: { filas: data.length, correoCompleto: fullEmail },
          },
          qr.manager,
        );
      }
      return { data, meta: { total: data.length, lastFetchedAt } };
    });
  }

  /**
   * Número de UISP → lotes vigentes (sin purgar) cuyas intermedias lo mencionan. Descifra solo
   * tickets y pagos; una carga ilegible se omite y se cuenta en el log (sin contenido). Público
   * para la respuesta de «resolver» (bloque C), que corre en su propia transacción.
   */
  async stagedReferences(
    manager: EntityManager,
    tenantId: string,
  ): Promise<Map<number, Set<string>>> {
    const rows = (await manager.query(
      `SELECT r.batch_id::text AS batch_id, r.entity, r.payload_encrypted
         FROM migration_staging_records r
         JOIN migration_batches b ON b.id = r.batch_id AND b.tenant_id = r.tenant_id
        WHERE r.tenant_id = $1 AND b.purged_at IS NULL AND r.entity = ANY($2::varchar[])`,
      [tenantId, [...STAGED_ENTITIES_WITH_UISP_USERS]],
    )) as Array<{ batch_id: string; entity: string; payload_encrypted: string }>;
    const references = new Map<number, Set<string>>();
    let unreadable = 0;
    for (const row of rows) {
      let payload: unknown;
      try {
        payload = this.crypto.decryptPayload(row.payload_encrypted);
      } catch {
        unreadable += 1;
        continue;
      }
      for (const id of stagedUispUserRefs(row.entity, payload)) {
        const batches = references.get(id) ?? new Set<string>();
        batches.add(row.batch_id);
        references.set(id, batches);
      }
    }
    if (unreadable > 0) {
      this.logger.warn(
        `[migration] ${unreadable} intermedia(s) ilegible(s) omitida(s) al buscar usuarios de UISP (tenant=${tenantId}).`,
      );
    }
    return references;
  }

  private decrypt(value: string | null, rowId: string, field: string): string | null {
    if (value === null) return null;
    try {
      return this.crypto.decryptText(value);
    } catch {
      this.logger.warn(`[migration] Fila de usuario de UISP ${rowId}: ${field} ilegible.`);
      return null;
    }
  }
}
