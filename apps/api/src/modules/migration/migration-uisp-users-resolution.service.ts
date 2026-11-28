import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  AuditAction,
  isMigrationImportableUserRole,
  type MigrationImportableUserRole,
  type MigrationUispUser,
  type MigrationUispUserResolveItem,
  type MigrationUispUsersInviteResult,
  type MigrationUispUsersReopenResult,
  type UserRole,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import {
  MIGRATION_MAPPING_AUDIT_ENTITY,
  MIGRATION_UISP_USERS_AUDIT_ENTITY,
} from './migration.constants';
import { MigrationCrypto } from './migration-crypto';
import type { MigrationTenantScope } from './migration-batches.service';
import { MigrationUispUsersService } from './migration-uisp-users.service';
import { MigrationUserDirectoryPort } from './ports/migration-user-directory.port';
import { parseStoredUispStaffName } from './uisp-api/uisp-admins';
import {
  MigrationUserProvisioningPort,
  type MigrationImportedUserInput,
  type MigrationWriteContext,
} from './ports/migration-user-provisioning.port';

interface ReviewRow {
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
}

const ROW_COLUMNS = `id, uisp_user_id, display_name_encrypted, email_encrypted, is_active_in_uisp,
                     source, status, matched_user_id, target_user_id, proposed_role`;

type ResolvedStatus = Exclude<MigrationUispUser['status'], 'PENDIENTE'>;

const STATUS_OF: Record<MigrationUispUserResolveItem['action'], ResolvedStatus> = {
  ENLAZAR: 'ENLAZADO',
  CREAR: 'CREADO',
  DESCARTAR: 'DESCARTADO',
};

function rowNotFound(ids: string[]): NotFoundException {
  return new NotFoundException({
    code: 'MIGRATION_UISP_USER_NOT_FOUND',
    message: 'Alguna fila de usuarios de UISP no existe.',
    details: { ids },
  });
}

function rowAlreadyResolved(ids: string[]): ConflictException {
  return new ConflictException({
    code: 'MIGRATION_UISP_USER_ALREADY_RESOLVED',
    message: 'Alguna fila de usuarios de UISP ya se revisó; vuelve a cargar la lista.',
    details: { ids },
  });
}

function invalidItem(id: string, field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message,
    details: { id, field },
  });
}

/**
 * ENLAZAR sin coincidencia: la fila no tiene usuario de iWana con el mismo correo, o el que
 * tenía ya no existe. Reutiliza `MIGRATION_MAPPING_TARGET_INVALID` (sin código nuevo) y lo
 * distingue con `details.reason = 'SIN_COINCIDENCIA'` para que el portal no hable de «destino».
 */
function linkTargetInvalid(id: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'MIGRATION_MAPPING_TARGET_INVALID',
    message: 'Esa fila no tiene un usuario de iWana con el mismo correo para enlazar.',
    details: { id, reason: 'SIN_COINCIDENCIA' },
  });
}

/**
 * ENLAZAR con `targetUserId` (elección manual, 2026-11-15): el usuario elegido no existe, está
 * borrado o tiene un rol externo (S-5). Mismo código, motivo `USUARIO_NO_VALIDO`.
 */
function manualTargetInvalid(id: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'MIGRATION_MAPPING_TARGET_INVALID',
    message: 'El usuario de iWana elegido no existe o no se puede enlazar a un usuario de UISP.',
    details: { id, reason: 'USUARIO_NO_VALIDO' },
  });
}

/** Usuario al que apunta un ENLAZAR: el elegido a mano (en minúsculas) o la coincidencia por correo. */
function linkCandidate(item: MigrationUispUserResolveItem, row: ReviewRow): string | null {
  return item.targetUserId !== undefined ? item.targetUserId.toLowerCase() : row.matched_user_id;
}

function roleNotAllowed(id: string): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'MIGRATION_USER_ROLE_NOT_ALLOWED',
    message: 'Ese rol no se puede asignar a un usuario traído de UISP.',
    details: { id },
  });
}

/**
 * Resolver e invitar a los usuarios del personal de UISP (ADR-110 D15; spec «usuarios»
 * §2.3–§2.5). Bloque C.
 *
 * - **Resolver es todo o nada**: el lote completo corre en una transacción con las filas
 *   bloqueadas (`FOR UPDATE`); cualquier fila inexistente (404), ya resuelta (409), mal formada
 *   (400), sin coincidencia que enlazar o con rol no permitido (422) revierte todo.
 * - Enlazar usa el usuario elegido a mano (`targetUserId`, cualquier fuente) o, sin él, la
 *   coincidencia por correo; el puerto de Usuarios valida que siga vigente y con rol importable.
 *   Varias filas pueden enlazar al mismo usuario (una persona con dos cuentas en UISP).
 * - Enlazar y crear dejan la equivalencia `USUARIO` (número → usuario, sin etiqueta); descartar
 *   no. Las tres purgan el nombre y el correo de la fila (CHECK de la 211).
 * - Los usuarios se crean e invitan solo por `MigrationUserProvisioningPort` (Usuarios): la
 *   migración no escribe en `users`. Los correos de invitación salen tras el COMMIT.
 * - Auditoría en la misma transacción, solo con ids, números de UISP, rol y conteos.
 */
@Injectable()
export class MigrationUispUsersResolutionService {
  private readonly logger = new Logger(MigrationUispUsersResolutionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: MigrationCrypto,
    private readonly auditService: AuditService,
    private readonly reviewRows: MigrationUispUsersService,
    private readonly directory: MigrationUserDirectoryPort,
    private readonly provisioning: MigrationUserProvisioningPort,
  ) {}

  async resolve(
    scope: MigrationTenantScope,
    items: MigrationUispUserResolveItem[],
    actorId: string,
  ): Promise<MigrationUispUser[]> {
    const created: string[] = [];
    const data = await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const ctx: MigrationWriteContext = {
        manager: qr.manager,
        tenantId: scope.tenantId,
        schemaName: scope.schemaName,
        actorId,
      };
      const ids = items.map((item) => item.id);
      const rows = (await qr.query(
        `SELECT ${ROW_COLUMNS} FROM migration_uisp_users
          WHERE tenant_id = $1 AND id = ANY($2::uuid[])
          ORDER BY id
          FOR UPDATE`,
        [scope.tenantId, ids],
      )) as ReviewRow[];
      const byId = new Map(rows.map((row) => [row.id, row]));

      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length > 0) throw rowNotFound(missing);
      const resolved = rows.filter((row) => row.status !== 'PENDIENTE').map((row) => row.id);
      if (resolved.length > 0) throw rowAlreadyResolved(resolved);

      for (const item of items) this.assertItem(item, byId.get(item.id)!);
      // Usuarios vigentes con rol importable (S-5), según el puerto de Usuarios.
      const linkable = await this.directory.existingUserIds(
        ctx,
        items
          .filter((item) => item.action === 'ENLAZAR')
          .map((item) => linkCandidate(item, byId.get(item.id)!)!),
      );
      // Todos los ENLAZAR se validan antes de escribir nada (ni crear usuarios).
      for (const item of items) {
        if (item.action !== 'ENLAZAR') continue;
        if (linkable.has(linkCandidate(item, byId.get(item.id)!)!)) continue;
        throw item.targetUserId !== undefined
          ? manualTargetInvalid(item.id)
          : linkTargetInvalid(item.id);
      }

      for (const item of items) {
        const row = byId.get(item.id)!;
        let targetUserId: string | null = null;
        if (item.action === 'ENLAZAR') {
          targetUserId = linkCandidate(item, row);
        } else if (item.action === 'CREAR') {
          const result = await this.provisioning.createImportedUser(ctx, {
            uispUserId: Number(row.uisp_user_id),
            // `assertItem` ya comprobó que es un rol importable.
            role: item.role as MigrationImportableUserRole,
            ...this.nameFor(row, item),
            email: this.decrypt(row.email_encrypted, row.id, 'email'),
            activeInUisp: row.source === 'API' && row.is_active_in_uisp === true,
            ...(item.isOperationalResource === undefined
              ? {}
              : { isOperationalResource: item.isOperationalResource }),
          });
          targetUserId = result.userId;
          created.push(result.userId);
        }
        if (targetUserId) {
          await this.upsertUserMapping(qr.manager, scope, ctx, row, targetUserId);
        }
        await this.markResolved(qr.manager, scope, ctx, row, item, targetUserId);
      }

      return this.readRows(qr.manager, scope.tenantId, ids);
    });

    this.provisioning.publishCreatedUsers(scope.tenantId, created);
    this.logger.log(
      `[migration] Usuarios de UISP resueltos (tenant=${scope.tenantId}, filas=${items.length}, creados=${created.length}).`,
    );
    return data;
  }

  /**
   * Invita (o reinvita) a los usuarios creados desde UISP: solo filas `CREADO` cuyo usuario siga
   * en `PENDING_VERIFICATION` con correo real. El resto se cuenta como omitido, sin error.
   */
  async invite(
    scope: MigrationTenantScope & { tenantSlug?: string },
    ids: string[],
    actorId: string,
  ): Promise<MigrationUispUsersInviteResult> {
    let dispatch: (() => void) | null = null;
    const result = await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      const ctx: MigrationWriteContext = {
        manager: qr.manager,
        tenantId: scope.tenantId,
        schemaName: scope.schemaName,
        actorId,
        ...(scope.tenantSlug ? { tenantSlug: scope.tenantSlug } : {}),
      };
      const rows = (await qr.query(
        `SELECT id, target_user_id::text AS target_user_id FROM migration_uisp_users
          WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'CREADO'
            AND target_user_id IS NOT NULL`,
        [scope.tenantId, ids],
      )) as Array<{ id: string; target_user_id: string }>;
      const prepared = await this.provisioning.prepareInvitations(
        ctx,
        rows.map((row) => row.target_user_id),
      );
      dispatch = prepared.dispatch;
      const invitedUsers = new Set(prepared.invited);
      const invitedRows = rows.filter((row) => invitedUsers.has(row.target_user_id));
      const counts: MigrationUispUsersInviteResult = {
        invitados: invitedRows.length,
        omitidos: ids.length - invitedRows.length,
      };
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: MIGRATION_UISP_USERS_AUDIT_ENTITY,
          entityId: scope.tenantId,
          userId: actorId,
          tenantId: scope.tenantId,
          schemaName: scope.schemaName,
          newValue: {
            accion: 'INVITAR',
            ...counts,
            filas: invitedRows.map((row) => row.id),
          },
        },
        qr.manager,
      );
      return counts;
    });
    (dispatch as (() => void) | null)?.();
    return result;
  }

  /**
   * Recuperar descartados (spec §2.3, v1.4): las filas `DESCARTADO` vuelven a `PENDIENTE`. Ya no
   * tienen nombre ni correo; la siguiente lectura se los devuelve a las de la API (el upsert solo
   * escribe filas pendientes). Enlazadas y creadas no se tocan: se cuentan como omitidas.
   */
  async reopen(
    scope: MigrationTenantScope,
    ids: string[],
    actorId: string,
  ): Promise<MigrationUispUsersReopenResult> {
    const result = await runInTenantSchema(this.dataSource, scope.schemaName, async (qr) => {
      // CTE: TypeORM devuelve `[filas, conteo]` en un UPDATE suelto y filas en un SELECT.
      const rows = (await qr.query(
        `WITH reopened AS (
           UPDATE migration_uisp_users
              SET status = 'PENDIENTE', updated_at = now()
            WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'DESCARTADO'
           RETURNING id
         )
         SELECT id::text AS id FROM reopened ORDER BY id`,
        [scope.tenantId, ids],
      )) as Array<{ id: string }>;
      const counts: MigrationUispUsersReopenResult = {
        recuperados: rows.length,
        omitidos: ids.length - rows.length,
      };
      if (rows.length > 0) {
        await this.auditService.logWithin(
          {
            action: AuditAction.UPDATE,
            entityType: MIGRATION_UISP_USERS_AUDIT_ENTITY,
            entityId: scope.tenantId,
            userId: actorId,
            tenantId: scope.tenantId,
            schemaName: scope.schemaName,
            newValue: { accion: 'RECUPERAR', ...counts, filas: rows.map((row) => row.id) },
          },
          qr.manager,
        );
      }
      return counts;
    });
    this.logger.log(
      `[migration] Usuarios de UISP recuperados (tenant=${scope.tenantId}, recuperados=${result.recuperados}, omitidos=${result.omitidos}).`,
    );
    return result;
  }

  /** Reglas por ítem que no dependen de otras tablas; se comprueban antes de escribir. */
  private assertItem(item: MigrationUispUserResolveItem, row: ReviewRow): void {
    if (item.action === 'ENLAZAR' && !linkCandidate(item, row)) throw linkTargetInvalid(row.id);
    if (item.action !== 'CREAR') return;
    if (!item.role || !isMigrationImportableUserRole(item.role)) throw roleNotAllowed(row.id);
    if (row.source === 'SIN_DATOS' && item.displayName === undefined) {
      throw invalidItem(
        row.id,
        'displayName',
        'Para crear un usuario de UISP sin datos hay que escribir su nombre.',
      );
    }
    if (row.source === 'API' && item.displayName !== undefined) {
      throw invalidItem(
        row.id,
        'displayName',
        'El nombre solo se escribe para usuarios de UISP sin datos.',
      );
    }
  }

  /**
   * Nombre de la fila descifrado (con nombre y apellido de UISP por separado), el escrito para
   * «sin datos» o, si es ilegible, uno genérico. Sin partes, el adaptador parte `displayName`.
   */
  private nameFor(
    row: ReviewRow,
    item: MigrationUispUserResolveItem,
  ): Pick<MigrationImportedUserInput, 'displayName' | 'firstName' | 'lastName'> {
    if (item.displayName !== undefined) return { displayName: item.displayName };
    const decrypted = this.decrypt(row.display_name_encrypted, row.id, 'displayName');
    const name = decrypted === null ? null : parseStoredUispStaffName(decrypted);
    if (!name?.displayName.trim()) {
      return { displayName: `Usuario de UISP ${Number(row.uisp_user_id)}` };
    }
    return {
      displayName: name.displayName.trim(),
      ...(name.firstName || name.lastName
        ? { firstName: name.firstName, lastName: name.lastName }
        : {}),
    };
  }

  private async upsertUserMapping(
    manager: EntityManager,
    scope: MigrationTenantScope,
    ctx: MigrationWriteContext,
    row: ReviewRow,
    targetUserId: string,
  ): Promise<void> {
    const [mapping] = (await manager.query(
      `INSERT INTO migration_mappings
         (tenant_id, source_system, kind, external_value, external_label, action, target_ref,
          created_by)
       VALUES ($1, 'UISP', 'USUARIO', $2, NULL, 'EQUIVALE', $3, $4)
       ON CONFLICT (tenant_id, source_system, kind, external_value) DO UPDATE
         SET action = 'EQUIVALE', target_ref = EXCLUDED.target_ref, external_label = NULL,
             updated_by = EXCLUDED.created_by, updated_at = now()
       RETURNING id::text AS id, (xmax = 0) AS inserted`,
      [scope.tenantId, String(Number(row.uisp_user_id)), targetUserId, ctx.actorId],
    )) as Array<{ id: string; inserted: boolean }>;
    await this.auditService.logWithin(
      {
        action: mapping!.inserted ? AuditAction.CREATE : AuditAction.UPDATE,
        entityType: MIGRATION_MAPPING_AUDIT_ENTITY,
        entityId: mapping!.id,
        userId: ctx.actorId,
        tenantId: scope.tenantId,
        schemaName: scope.schemaName,
        newValue: {
          kind: 'USUARIO',
          externalValue: String(Number(row.uisp_user_id)),
          action: 'EQUIVALE',
          targetRef: targetUserId,
        },
      },
      manager,
    );
  }

  private async markResolved(
    manager: EntityManager,
    scope: MigrationTenantScope,
    ctx: MigrationWriteContext,
    row: ReviewRow,
    item: MigrationUispUserResolveItem,
    targetUserId: string | null,
  ): Promise<void> {
    const status = STATUS_OF[item.action];
    const proposedRole = item.action === 'CREAR' ? (item.role ?? null) : row.proposed_role;
    await manager.query(
      `UPDATE migration_uisp_users
          SET status = $3, target_user_id = $4, proposed_role = $5,
              display_name_encrypted = NULL, email_encrypted = NULL, email_hash = NULL,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'PENDIENTE'`,
      [scope.tenantId, row.id, status, targetUserId, proposedRole],
    );
    await this.auditService.logWithin(
      {
        action: AuditAction.UPDATE,
        entityType: MIGRATION_UISP_USERS_AUDIT_ENTITY,
        entityId: row.id,
        userId: ctx.actorId,
        tenantId: scope.tenantId,
        schemaName: scope.schemaName,
        oldValue: { status: row.status },
        newValue: {
          accion: item.action,
          ...(item.action === 'ENLAZAR'
            ? { origen: item.targetUserId !== undefined ? 'MANUAL' : 'CORREO' }
            : {}),
          uispUserId: Number(row.uisp_user_id),
          status,
          targetUserId,
          proposedRole,
          datosPersonalesPurgados: true,
        },
      },
      manager,
    );
  }

  /** Filas resueltas tal como las verá la lista: sin PII (purgada) y con sus lotes vigentes. */
  private async readRows(
    manager: EntityManager,
    tenantId: string,
    ids: string[],
  ): Promise<MigrationUispUser[]> {
    const rows = (await manager.query(
      `SELECT ${ROW_COLUMNS} FROM migration_uisp_users
        WHERE tenant_id = $1 AND id = ANY($2::uuid[])
        ORDER BY uisp_user_id`,
      [tenantId, ids],
    )) as ReviewRow[];
    const references = await this.reviewRows.stagedReferences(manager, tenantId);
    return rows.map((row) => ({
      id: row.id,
      uispUserId: Number(row.uisp_user_id),
      displayName: null,
      email: null,
      isActiveInUisp: row.is_active_in_uisp,
      source: row.source,
      status: row.status,
      matchedUserId: row.matched_user_id,
      targetUserId: row.target_user_id,
      proposedRole: row.proposed_role,
      referencedInBatches: references.get(Number(row.uisp_user_id))?.size ?? 0,
    }));
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
