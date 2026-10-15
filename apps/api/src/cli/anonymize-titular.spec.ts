import { parseAnonymizeTitularArgs } from './anonymize-titular';

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
    });
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
