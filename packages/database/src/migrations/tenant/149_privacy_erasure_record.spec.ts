import { PrivacyErasureRecord1490000000000 } from './149_privacy_erasure_record';

describe('PrivacyErasureRecord149', () => {
  afterEach(() => jest.restoreAllMocks());

  it('agrega las columnas, los tres checks y el trigger inmutable de supresión', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new PrivacyErasureRecord1490000000000().up({ query } as never);
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS erased_at timestamptz');
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS erasure_categories text[] NOT NULL DEFAULT '{}'",
    );
    expect(sql).toContain('ck_data_subject_requests_erasure_scope');
    expect(sql).toContain(
      `CHECK (erased_at IS NULL OR ("right" = 'SUPRIMIR' AND status = 'RESUELTA'))`,
    );
    expect(sql).toContain('ck_data_subject_requests_erasure_categories_pair');
    expect(sql).toContain('CHECK (erased_at IS NOT NULL OR cardinality(erasure_categories) = 0)');
    expect(sql).toContain('ck_data_subject_requests_erasure_categories_known');
    for (const category of [
      'IDENTIFICACION',
      'CONTACTO',
      'UBICACION',
      'FISCAL',
      'COMERCIAL',
      'EVIDENCIA_CONSENTIMIENTO',
      'CUENTA_USUARIO',
      'EVIDENCIA_DOCUMENTAL',
      'OPERACION_CAMPO',
    ]) {
      expect(sql).toContain(`'${category}'`);
    }
    expect(sql).toContain('privacy_prevent_erasure_rewrite()');
    expect(sql).toContain("USING ERRCODE = '55000'");
    expect(sql).toContain('La supresión ejecutada no se puede reescribir');
    expect(sql).toContain('trg_data_subject_requests_erasure_immutable');
    expect(sql).toContain('BEFORE UPDATE OF erased_at, erasure_categories');
  });

  it('revierte en orden simétrico: trigger, función, checks y columnas', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new PrivacyErasureRecord1490000000000().down({ query } as never);
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');

    const triggerDrop = sql.indexOf(
      'DROP TRIGGER IF EXISTS trg_data_subject_requests_erasure_immutable',
    );
    const functionDrop = sql.indexOf('DROP FUNCTION IF EXISTS privacy_prevent_erasure_rewrite()');
    const constraintDrop = sql.indexOf('ck_data_subject_requests_erasure_scope');
    const columnDrop = sql.indexOf('DROP COLUMN IF EXISTS erasure_categories');
    expect(triggerDrop).toBeGreaterThanOrEqual(0);
    expect(functionDrop).toBeGreaterThan(triggerDrop);
    expect(constraintDrop).toBeGreaterThan(functionDrop);
    expect(columnDrop).toBeGreaterThan(constraintDrop);
    expect(sql).toContain('DROP COLUMN IF EXISTS erased_at');
  });
});
