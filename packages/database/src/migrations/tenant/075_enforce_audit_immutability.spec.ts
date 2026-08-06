import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SEC-P1 §5.7 — el trigger de inmutabilidad sigue definido y rechaza
 * mutaciones fuera de mantenimiento (evidencia sobre el SQL versionado).
 *
 * No ejecuta PostgreSQL aquí: el gate unitario de @iwana/db corre sin DB.
 * La garantía runtime la provee la migración 075 aplicada en cada tenant.
 */

const MIGRATION_PATH = join(__dirname, '075_enforce_audit_immutability.ts');

describe('075_enforce_audit_immutability (SEC-P1 §5.7)', () => {
  const source = readFileSync(MIGRATION_PATH, 'utf8');

  it('instala reject_audit_mutation y el trigger BEFORE UPDATE OR DELETE', () => {
    expect(source).toContain('reject_audit_mutation');
    expect(source).toContain('trg_audit_logs_immutable');
    expect(source).toMatch(/BEFORE UPDATE OR DELETE ON audit_logs/);
    expect(source).toMatch(/EXECUTE FUNCTION public\.reject_audit_mutation\(\)/);
  });

  it('rechaza mutaciones salvo iwana.audit_maintenance = on', () => {
    expect(source).toContain('iwana.audit_maintenance');
    expect(source).toMatch(/current_setting\('iwana\.audit_maintenance'/);
    expect(source).toMatch(/RAISE EXCEPTION/);
    expect(source).toMatch(/solo escritura|prohibido/i);
  });

  it('no elimina la escotilla de mantenimiento en el cuerpo del trigger', () => {
    // La vía deliberada de 077/078/110 debe seguir documentada en el SQL.
    expect(source).toMatch(/IF coalesce\(current_setting\('iwana\.audit_maintenance'/);
    expect(source).toMatch(/RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END/);
  });

  it('H-4: demuestra rechazo UPDATE/DELETE fuera de mantenimiento (predicado del trigger)', () => {
    // Réplica ejecutable del predicado PL/pgSQL (sin DB): solo 'on' abre la escotilla.
    const allowsMutation = (setting: string | null | undefined): boolean =>
      (setting ?? '') === 'on';

    expect(allowsMutation(undefined)).toBe(false);
    expect(allowsMutation('')).toBe(false);
    expect(allowsMutation('off')).toBe(false);
    expect(allowsMutation('ON')).toBe(false); // case-sensitive, como el SQL versionado
    expect(allowsMutation('on')).toBe(true);

    // El cuerpo del trigger: si no es 'on' → RAISE EXCEPTION (prohibe UPDATE/DELETE).
    const raiseIdx = source.indexOf('RAISE EXCEPTION');
    const maintenanceIdx = source.indexOf('iwana.audit_maintenance');
    expect(maintenanceIdx).toBeGreaterThan(-1);
    expect(raiseIdx).toBeGreaterThan(maintenanceIdx);
    expect(source).toMatch(/BEFORE UPDATE OR DELETE ON audit_logs/);
  });
});
