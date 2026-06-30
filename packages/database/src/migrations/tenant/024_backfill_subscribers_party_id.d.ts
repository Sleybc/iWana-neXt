import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 024: vincula Subscribers con Parties (MOD08) — backfill idempotente.
 *
 * UP:
 *   1. Extiende party.document_number a VARCHAR(500) para acomodar valores cifrados PII
 *      (AES-256-GCM: iv:authTag:ciphertext en hex, ~78+ chars para documentos cortos).
 *   2. Añade subscribers.party_id UUID NULL.
 *   3. Crea índice idx_subscribers_party_id en (tenant_id, party_id) WHERE NOT NULL.
 *   4. Script PL/pgSQL idempotente: por cada subscriber sin party_id crea
 *      Party + PartyRole(CUSTOMER) y actualiza el vínculo en subscribers.
 *      Si un subscriber individual falla, continúa con los demás (no aborta).
 *
 * DOWN:
 *   - Elimina índice idx_subscribers_party_id.
 *   - Elimina columna party_id de subscribers.
 *   - No revierte datos creados en las tablas party/party_role (migración aditiva).
 *
 * Ref: HLD-MOD05-PARTIES-DEPENDENCY-v2.1-addendum §4, ADR-030, FASE 5
 */
export declare class BackfillSubscribersPartyId1700000000024 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=024_backfill_subscribers_party_id.d.ts.map