import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolvePortalUrl } from './portal-url';

const config = (values: Record<string, string>) => ({
  get: <T>(key: string): T | undefined => values[key] as T | undefined,
});

describe('resolvePortalUrl', () => {
  it.each([
    [{ PORTAL_URL: 'https://portal.example', FRONTEND_URL: 'https://consola.example' }, 'portal'],
    [{ PORTAL_URL: 'https://portal.example//' }, 'portal'],
    [{ PORTAL_URL: '', FRONTEND_URL: 'https://consola.example/' }, 'consola'],
  ])('%j', (values, host) => {
    expect(resolvePortalUrl(config(values))).toBe(`https://${host}.example`);
  });

  it('en desarrollo usa el puerto del portal', () => {
    expect(resolvePortalUrl(config({}))).toBe('http://localhost:3002');
  });

  it('ningún módulo arma enlaces de empresa con FRONTEND_URL', () => {
    const root = join(__dirname, '..');
    const offenders = readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .filter((file) =>
        /get(?:OrThrow)?(?:<string>)?\(\s*'(?:FRONTEND|PORTAL)_URL'/u.test(
          readFileSync(join(root, file), 'utf8'),
        ),
      );
    expect(offenders.map((file) => relative('.', file))).toEqual(['common/portal-url.ts']);
  });
});
