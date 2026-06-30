import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests de verificación de la Migración 024 — BackfillSubscribersPartyId.
 *
 * Valida el contenido del archivo de migración de forma conceptual,
 * sin ejecutar SQL real ni requerir base de datos.
 *
 * Verifica:
 * - Nombre de clase correcto y estructura MigrationInterface.
 * - UP: ALTER TABLE, ADD COLUMN, CREATE INDEX, backfill PL/pgSQL.
 * - Idempotencia: filtra por party_id IS NULL.
 * - Manejo de errores individuales sin abortar el backfill completo.
 * - DOWN: DROP INDEX + DROP COLUMN (no revierte datos de Party).
 *
 * Ref: HLD-MOD05-PARTIES-DEPENDENCY-v2.1-addendum §4, ADR-030 F5
 */
describe('Migración 024 — BackfillSubscribersPartyId', () => {
  let migrationContent: string;

  beforeAll(() => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../../../../../packages/database/src/migrations/tenant/024_backfill_subscribers_party_id.ts',
    );
    migrationContent = fs.readFileSync(migrationPath, 'utf-8');
  });

  describe('metadata de la migración', () => {
    it('tiene el nombre de clase correcto', () => {
      expect(migrationContent).toContain('BackfillSubscribersPartyId1700000000024');
    });

    it('implementa MigrationInterface', () => {
      expect(migrationContent).toContain('implements MigrationInterface');
    });

    it('tiene métodos up() y down()', () => {
      expect(migrationContent).toContain('public async up(');
      expect(migrationContent).toContain('public async down(');
    });
  });

  describe('UP — sentencias SQL', () => {
    it('extiende party.document_number a VARCHAR(500) para valores cifrados PII', () => {
      expect(migrationContent).toMatch(/ALTER TABLE party/i);
      expect(migrationContent).toMatch(/VARCHAR\(500\)/i);
    });

    it('añade la columna party_id UUID NULL a subscribers (idempotente IF NOT EXISTS)', () => {
      expect(migrationContent).toMatch(/ADD COLUMN IF NOT EXISTS party_id UUID NULL/i);
    });

    it('crea el índice idx_subscribers_party_id con WHERE party_id IS NOT NULL', () => {
      expect(migrationContent).toMatch(/CREATE INDEX IF NOT EXISTS idx_subscribers_party_id/i);
      expect(migrationContent).toMatch(/WHERE party_id IS NOT NULL/i);
    });

    it('el backfill es idempotente: filtra subscribers WHERE party_id IS NULL', () => {
      expect(migrationContent).toMatch(/party_id IS NULL/i);
    });

    it('el backfill crea Party (INSERT INTO party)', () => {
      expect(migrationContent).toMatch(/INSERT INTO party/i);
    });

    it('el backfill crea PartyRole(CUSTOMER) (INSERT INTO party_role)', () => {
      expect(migrationContent).toMatch(/INSERT INTO party_role/i);
      expect(migrationContent).toMatch(/CUSTOMER/i);
    });

    it('el backfill actualiza subscribers con el party_id creado', () => {
      expect(migrationContent).toMatch(/UPDATE subscribers SET party_id/i);
    });

    it('usa COALESCE para documentNumber (cifrado o placeholder BACKFILL-ANON)', () => {
      expect(migrationContent).toMatch(/COALESCE/i);
      expect(migrationContent).toMatch(/document_number_encrypted/i);
      expect(migrationContent).toMatch(/BACKFILL-ANON/i);
    });

    it('usa RAISE NOTICE para loguear el progreso del backfill', () => {
      expect(migrationContent).toMatch(/RAISE NOTICE/i);
      expect(migrationContent).toMatch(/procesados/i);
    });

    it('maneja errores individuales sin abortar: usa EXCEPTION WHEN OTHERS THEN', () => {
      expect(migrationContent).toMatch(/EXCEPTION WHEN OTHERS THEN/i);
    });
  });

  describe('DOWN — reversión', () => {
    it('elimina el índice idx_subscribers_party_id', () => {
      expect(migrationContent).toMatch(/DROP INDEX IF EXISTS idx_subscribers_party_id/i);
    });

    it('elimina la columna party_id de subscribers', () => {
      expect(migrationContent).toMatch(/DROP COLUMN IF EXISTS party_id/i);
    });

    it('NO elimina datos de party/party_role (migración aditiva)', () => {
      const downSection = migrationContent.substring(
        migrationContent.lastIndexOf('public async down'),
      );
      expect(downSection).not.toMatch(/DELETE FROM party/i);
      expect(downSection).not.toMatch(/DELETE FROM party_role/i);
    });
  });
});
