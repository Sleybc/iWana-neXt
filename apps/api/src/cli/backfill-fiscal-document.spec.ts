import { parseFiscalDocumentBackfillArgs } from './backfill-fiscal-document';

describe('parseFiscalDocumentBackfillArgs', () => {
  it('simula por defecto y exige un tenant antes de ejecutar', () => {
    expect(parseFiscalDocumentBackfillArgs([])).toEqual({
      tenant: null,
      mode: 'dry-run',
      help: false,
    });
  });

  it('acepta --tenant junto con --apply', () => {
    expect(parseFiscalDocumentBackfillArgs(['--tenant=isp-demo', '--apply'])).toEqual({
      tenant: 'isp-demo',
      mode: 'apply',
      help: false,
    });
  });

  it('rechaza el uso simultáneo de --dry-run y --apply', () => {
    expect(() =>
      parseFiscalDocumentBackfillArgs(['--tenant=isp-demo', '--dry-run', '--apply']),
    ).toThrow('Usa solo uno de --dry-run o --apply.');
  });

  it('rechaza valores de tenant vacíos y opciones desconocidas', () => {
    expect(() => parseFiscalDocumentBackfillArgs(['--tenant='])).toThrow(
      '--tenant requiere un id o slug.',
    );
    expect(() => parseFiscalDocumentBackfillArgs(['--output=full'])).toThrow(
      'Argumento desconocido: --output',
    );
  });
});
