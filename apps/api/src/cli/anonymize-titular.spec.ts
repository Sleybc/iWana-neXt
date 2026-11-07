import type { DataSource } from 'typeorm';
import {
  parseAnonymizeTitularArgs,
  resolveTenantSchema,
  toVerificationOutput,
  type AnonymizedTenantVerificationReport,
} from './anonymize-titular';

const REQUEST_ID = '5d1ce8e0-6447-44a1-a27e-84f856622a47';
const EXPEDIENTE_ID = '6a6286b9-8ea8-42ca-823d-5fc2515be820';

describe('parseAnonymizeTitularArgs', () => {
  it('usa dry-run por defecto, acepta IDs explícitos repetibles y una solicitud UUID', () => {
    expect(
      parseAnonymizeTitularArgs([
        '--tenant',
        'isp-demo',
        '--request',
        REQUEST_ID,
        '--expediente',
        EXPEDIENTE_ID,
        '--expediente=7ee3fd4a-2a29-4da7-b6e6-9b85b4f011d0',
      ]),
    ).toEqual({
      tenant: 'isp-demo',
      requestId: REQUEST_ID,
      expedienteIds: [EXPEDIENTE_ID, '7ee3fd4a-2a29-4da7-b6e6-9b85b4f011d0'],
      confirmUnmatched: false,
      mode: 'dry-run',
      help: false,
      verifyOnly: false,
    });
  });

  it('acepta la verificación de residuales como modo solo lectura y exclusivo', () => {
    expect(parseAnonymizeTitularArgs(['--tenant', 'isp-demo', '--verify-only'])).toMatchObject({
      tenant: 'isp-demo',
      requestId: null,
      expedienteIds: [],
      confirmUnmatched: false,
      mode: 'dry-run',
      verifyOnly: true,
    });
    expect(() =>
      parseAnonymizeTitularArgs(['--tenant', 'isp-demo', '--request', REQUEST_ID, '--verify-only']),
    ).toThrow('--verify-only requiere solo --tenant; no acepta solicitud ni expedientes.');
    expect(() =>
      parseAnonymizeTitularArgs(['--tenant', 'isp-demo', '--verify-only', '--apply']),
    ).toThrow('Usa --verify-only sin --dry-run ni --apply.');
  });

  it('acepta apply explícito y confirmación de expedientes sin HMAC concordante', () => {
    const parsed = parseAnonymizeTitularArgs([
      `--tenant=${REQUEST_ID}`,
      `--request=${REQUEST_ID}`,
      '--confirm-unmatched',
      '--apply',
    ]);
    expect(parsed.mode).toBe('apply');
    expect(parsed.confirmUnmatched).toBe(true);
  });

  it('normaliza UUIDs, deduplica expedientes y rechaza modos o flags ambiguos', () => {
    expect(
      parseAnonymizeTitularArgs([
        '--tenant',
        'ISP-DEMO',
        '--request',
        REQUEST_ID.toUpperCase(),
        '--expediente',
        EXPEDIENTE_ID.toUpperCase(),
        '--expediente',
        EXPEDIENTE_ID,
      ]),
    ).toMatchObject({
      tenant: 'isp-demo',
      requestId: REQUEST_ID,
      expedienteIds: [EXPEDIENTE_ID],
    });
    expect(() => parseAnonymizeTitularArgs(['--apply', '--dry-run'])).toThrow(
      'Usa solo uno de --dry-run o --apply.',
    );
    expect(() => parseAnonymizeTitularArgs(['--unknown'])).toThrow(
      'Argumento desconocido; revisa --help.',
    );
    expect(() => parseAnonymizeTitularArgs(['--request', 'not-a-uuid'])).toThrow(
      '--request requiere un UUID válido.',
    );
  });
});

describe('resolveTenantSchema', () => {
  const dataSourceWith = (status: string | null) =>
    ({
      query: jest.fn().mockResolvedValue(status ? [{ schema_name: 'tenant_demo', status }] : []),
    }) as unknown as DataSource;

  it.each(['INACTIVE', 'SUSPENDED', 'MARKED_FOR_DELETION'])(
    'verify-only admite un tenant %s, igual que K2',
    async (status) => {
      await expect(
        resolveTenantSchema(dataSourceWith(status), 'isp-demo', { anyStatus: true }),
      ).resolves.toEqual({ schemaName: 'tenant_demo' });
    },
  );

  it('la anonimización sigue exigiendo un tenant ACTIVE', async () => {
    await expect(resolveTenantSchema(dataSourceWith('ACTIVE'), 'isp-demo')).resolves.toEqual({
      schemaName: 'tenant_demo',
    });
    await expect(resolveTenantSchema(dataSourceWith('SUSPENDED'), 'isp-demo')).rejects.toThrow(
      'Tenant inexistente, inactivo o con schema inválido.',
    );
  });

  it('verify-only sigue rechazando un tenant no registrado', async () => {
    await expect(
      resolveTenantSchema(dataSourceWith(null), 'isp-demo', { anyStatus: true }),
    ).rejects.toThrow('Tenant inexistente, inactivo o con schema inválido.');
  });
});

describe('banderas de remediación y de solicitudes (P2 de seguridad)', () => {
  it('--with-request-ids solo acompaña a --verify-only', () => {
    expect(
      parseAnonymizeTitularArgs(['--tenant', 'isp-demo', '--verify-only', '--with-request-ids'])
        .withRequestIds,
    ).toBe(true);
    expect(() =>
      parseAnonymizeTitularArgs([
        '--tenant',
        'isp-demo',
        '--request',
        REQUEST_ID,
        '--with-request-ids',
      ]),
    ).toThrow('--with-request-ids solo se usa con --verify-only.');
  });
});

describe('toVerificationOutput', () => {
  const report: AnonymizedTenantVerificationReport = {
    tenantSchema: 'tenant_demo',
    titularesChecked: 2,
    markedSubscribers: 1,
    markedExpedientes: 1,
    residualFields: 3,
    findings: [
      {
        titularIds: ['8f1d2c6e-1111-4c3b-9d5e-000000000001'],
        residualFields: 3,
        tables: [{ table: 'subscribers', residualFields: 3 }],
      },
    ],
  };

  it('por defecto no imprime ids de titulares ni solicitudes', () => {
    const output = toVerificationOutput(report);
    expect(output.findings).toEqual([
      { residualFields: 3, tables: [{ table: 'subscribers', residualFields: 3 }] },
    ]);
    expect(output).not.toHaveProperty('requestIds');
    expect(JSON.stringify(output)).not.toContain('8f1d2c6e');
  });

  it('añade las solicitudes solo cuando se piden', () => {
    expect(toVerificationOutput(report, [REQUEST_ID]).requestIds).toEqual([REQUEST_ID]);
  });
});
