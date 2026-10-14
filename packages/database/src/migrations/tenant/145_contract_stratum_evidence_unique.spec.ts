import { ContractStratumEvidenceUnique1450000000000 } from './145_contract_stratum_evidence_unique';

interface DuplicateRow {
  media_id: string;
  contract_ids: string[];
}

interface StubOptions {
  /** La columna `contracts.stratum_evidence_media_id` existe (la deja la 144). Por defecto, sí. */
  present?: boolean;
  /** Grupos de duplicados que devuelve el preflight. Por defecto, ninguno. */
  duplicates?: DuplicateRow[];
}

/** Simula el QueryRunner respondiendo según la sentencia; registra todo el SQL emitido. */
function queryRunnerStub(options: StubOptions = {}): {
  calls: string[];
  runner: { query: jest.Mock };
} {
  const calls: string[] = [];

  const query = jest.fn(async (statement: string) => {
    const sql = statement.replace(/\s+/gu, ' ').trim();
    calls.push(sql);

    if (sql.includes('information_schema.columns')) {
      return [{ present: options.present ?? true }];
    }
    if (sql.includes('HAVING COUNT(*) > 1')) {
      return options.duplicates ?? [];
    }
    return [];
  });

  return { calls, runner: { query } };
}

describe('145_contract_stratum_evidence_unique', () => {
  it('conserva un timestamp de 13 dígitos igual al nombre de la clase', () => {
    const migration = new ContractStratumEvidenceUnique1450000000000();

    expect(migration.name).toBe('ContractStratumEvidenceUnique1450000000000');
    expect(migration.name.slice(-13)).toMatch(/^[1-9]\d{12}$/u);
  });

  it('up crea el índice único parcial sobre stratum_evidence_media_id cuando no hay duplicados', async () => {
    const { calls, runner } = queryRunnerStub();

    await new ContractStratumEvidenceUnique1450000000000().up(runner as never);

    expect(calls).toContain(
      'CREATE UNIQUE INDEX uq_contracts_stratum_evidence ON contracts (stratum_evidence_media_id) ' +
        'WHERE stratum_evidence_media_id IS NOT NULL',
    );
  });

  it('up aborta sin crear el índice y nombra el asset y los contratos duplicados', async () => {
    const { calls, runner } = queryRunnerStub({
      duplicates: [
        {
          media_id: 'asset-duplicado',
          contract_ids: ['contrato-a', 'contrato-b'],
        },
      ],
    });

    const migration = new ContractStratumEvidenceUnique1450000000000();
    await expect(migration.up(runner as never)).rejects.toThrow(
      'Migración 145 abortada: 1 asset(s) de soporte de estrato respaldan más de un contrato ' +
        '(asset asset-duplicado: contratos contrato-a, contrato-b).',
    );
    expect(calls.join(' ')).not.toContain('CREATE UNIQUE INDEX');
  });

  it('up limita el detalle a 20 duplicados y declara el total', async () => {
    const duplicates = Array.from({ length: 25 }, (_, index) => ({
      media_id: `asset-${index}`,
      contract_ids: [`contrato-${index}-a`, `contrato-${index}-b`],
    }));
    const { runner } = queryRunnerStub({ duplicates });

    const error = await new ContractStratumEvidenceUnique1450000000000().up(runner as never).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('Migración 145 abortada: 25 asset(s)');
    expect(message).toContain('asset-19: contratos contrato-19-a, contrato-19-b');
    expect(message).not.toContain('asset-20:');
    expect(message).toContain('; y 5 más');
  });

  it('up aborta si la 144 no está aplicada y no emite DDL', async () => {
    const { calls, runner } = queryRunnerStub({ present: false });

    await expect(
      new ContractStratumEvidenceUnique1450000000000().up(runner as never),
    ).rejects.toThrow(/144_vat_service_point/u);
    expect(calls.join(' ')).not.toMatch(/CREATE UNIQUE INDEX|ALTER TABLE/u);
  });

  it('down elimina solo el índice, sin tocar datos', async () => {
    const { calls, runner } = queryRunnerStub();

    await new ContractStratumEvidenceUnique1450000000000().down(runner as never);

    expect(calls).toEqual(['DROP INDEX IF EXISTS uq_contracts_stratum_evidence']);
  });
});
