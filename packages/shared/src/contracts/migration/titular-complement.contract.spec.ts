import {
  MIGRATION_ERROR_CODES,
  MIGRATION_MAPPING_KINDS,
  MIGRATION_OBSERVATIONS,
  MIGRATION_REJECTION_REASONS,
  MIGRATION_REVERT_BLOCK_REASONS,
  MigrationBatchCountsSchema,
  MigrationPendingValueSchema,
  MigrationRevertBlockerSchema,
  migrationMappingTargetError,
} from './migration-import.contract';

const uuid = '69000000-0000-4000-8000-000000000002';

const counts = {
  procesamiento: 'COMPLETADO',
  archivos: { recibidos: 1, leidos: 1, rechazados: {} },
  entidades: {},
  observaciones: { CRUCE_CON_FACTURACION_IWANA: 1, DATO_DISTINTO_EN_UISP: 2 },
  tareasSinFuente: 0,
  pendientesEquivalencia: [],
  procesadoEn: null,
};

describe('Contrato de complementar titular (spec 2026-11-15, ADR-110 D11)', () => {
  it('añade los códigos del bloque A', () => {
    expect(MIGRATION_MAPPING_KINDS).toContain('TITULAR');
    expect(MIGRATION_REJECTION_REASONS).toContain('TITULAR_VINCULADO_A_OTRO_CLIENTE');
    expect(MIGRATION_REVERT_BLOCK_REASONS).toContain('DATO_COMPLETADO_MODIFICADO');
    expect(MIGRATION_OBSERVATIONS).toEqual(
      expect.arrayContaining(['CRUCE_CON_FACTURACION_IWANA', 'DATO_DISTINTO_EN_UISP']),
    );
    expect(MIGRATION_ERROR_CODES).toContain('MIGRATION_TITULAR_TARGET_INVALID');
    expect(
      MigrationRevertBlockerSchema.safeParse({ motivo: 'DATO_COMPLETADO_MODIFICADO', cantidad: 1 })
        .success,
    ).toBe(true);
  });

  it('candidateRef es opcional y solo un uuid', () => {
    const base = { kind: 'TITULAR', externalValue: 'c-9', externalLabel: null, occurrences: 1 };
    expect(MigrationPendingValueSchema.safeParse(base).success).toBe(true);
    expect(MigrationPendingValueSchema.safeParse({ ...base, candidateRef: uuid }).success).toBe(
      true,
    );
    expect(
      MigrationPendingValueSchema.safeParse({ ...base, candidateRef: 'Ana Pérez' }).success,
    ).toBe(false);
  });

  it('titulares.complementados vale 0 en counts viejos y rechaza negativos o extras', () => {
    const parsed = MigrationBatchCountsSchema.parse(counts);
    expect(parsed.titulares).toEqual({ complementados: 0 });
    expect(
      MigrationBatchCountsSchema.parse({ ...counts, titulares: { complementados: 3 } }).titulares,
    ).toEqual({ complementados: 3 });
    for (const titulares of [{ complementados: -1 }, { complementados: 1, nombre: 'x' }]) {
      expect(MigrationBatchCountsSchema.safeParse({ ...counts, titulares }).success).toBe(false);
    }
  });

  it('TITULAR solo admite EQUIVALE con un uuid', () => {
    expect(migrationMappingTargetError('TITULAR', 'EQUIVALE', uuid)).toBeNull();
    expect(migrationMappingTargetError('TITULAR', 'EQUIVALE', '7')).toBe(
      'MIGRATION_MAPPING_TARGET_INVALID',
    );
    expect(migrationMappingTargetError('TITULAR', 'DESCARTAR', null)).toBe(
      'MIGRATION_MAPPING_TARGET_INVALID',
    );
  });
});
