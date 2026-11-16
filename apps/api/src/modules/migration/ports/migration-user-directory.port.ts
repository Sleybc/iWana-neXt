import { Injectable } from '@nestjs/common';
import type { MigrationReadContext } from './migration-import.ports';

/**
 * Puerto de la migración hacia Usuarios (MOD04) para la atribución por la equivalencia
 * `USUARIO` (ADR-110 D15; spec «usuarios» §2.6) y la coincidencia por correo (§2.2). Lo implementa el módulo de Usuarios: la
 * migración nunca lee `users`. Corre en la transacción del llamador.
 */
@Injectable()
export abstract class MigrationUserDirectoryPort {
  /**
   * De los ids dados, los que siguen siendo usuarios vigentes (no borrados) del tenant, en
   * cualquier estado: un usuario inactivo conserva su historial.
   */
  abstract existingUserIds(ctx: MigrationReadContext, userIds: string[]): Promise<Set<string>>;

  /**
   * Coincidencia de la lectura de usuarios de UISP (spec «usuarios» §2.2): HMAC del correo
   * (`PII_HASH_KEY`, normalización de Usuarios) → id del usuario vigente (no borrado) del tenant.
   */
  abstract findUserIdsByEmailHash(
    ctx: MigrationReadContext,
    emailHashes: string[],
  ): Promise<Map<string, string>>;
}
