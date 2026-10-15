import { parsePlaceholderBackfillArgs } from './backfill-placeholder-contacts';

describe('parsePlaceholderBackfillArgs', () => {
  it('usa dry-run por defecto y requiere tenant', () => {
    expect(parsePlaceholderBackfillArgs(['--tenant=tenant-demo'])).toEqual({
      tenant: 'tenant-demo',
      mode: 'dry-run',
      help: false,
    });
  });

  it('acepta apply de forma explícita', () => {
    const parsed = parsePlaceholderBackfillArgs(['--tenant=tenant-demo', '--apply']);
    expect(parsed.mode).toBe('apply');
  });

  it('rechaza modos duplicados y opciones desconocidas', () => {
    expect(() => parsePlaceholderBackfillArgs(['--apply', '--dry-run'])).toThrow(
      'Usa solo uno de --dry-run o --apply.',
    );
    expect(() => parsePlaceholderBackfillArgs(['--force'])).toThrow(
      'Argumento desconocido: --force',
    );
  });
});
