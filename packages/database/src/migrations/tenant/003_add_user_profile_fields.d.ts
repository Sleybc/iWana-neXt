import { DataSource } from 'typeorm';
/**
 * Migración retroactiva de schemas de tenant — Campos de perfil de usuario.
 *
 * Agrega columnas de perfil personal a la tabla `users` en TODOS los schemas
 * de tenant activos. Usa IF NOT EXISTS para ser idempotente.
 *
 * Campos cifrados con AES-256-GCM (mismo mecanismo que email):
 * - first_name, last_name: VARCHAR(512) — IV:authTag:ciphertext en hex
 * - document_number: VARCHAR(512) — nunca se retorna en DTOs públicos (Ley 1581)
 *
 * Campos sin cifrado:
 * - phone, job_title, document_type, avatar_url
 *
 * NOTA: document_number solo se almacena pero no se expone en respuestas.
 *
 * Uso:
 *   pnpm --filter @iwana/db migration:tenant:run
 *
 * Referencias:
 * - Ley 1581 (Habeas Data): document_number es PII sensible → no exponer en API
 * - ADR-017: Multi-tenant schema-per-tenant isolation
 */
export declare function runMigration(dataSource: DataSource): Promise<void>;
//# sourceMappingURL=003_add_user_profile_fields.d.ts.map