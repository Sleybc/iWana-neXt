import { buildContentSecurityPolicy, resolveStorageMediaOrigin } from './content-security-policy';

function directive(policy: string, name: string): string | undefined {
  return policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

describe('content-security-policy', () => {
  describe('resolveStorageMediaOrigin', () => {
    it('devuelve solo el origen exacto del almacenamiento', () => {
      expect(resolveStorageMediaOrigin('http://localhost:9002')).toBe('http://localhost:9002');
      expect(resolveStorageMediaOrigin(' https://media.example.co/iwana-media/ ')).toBe(
        'https://media.example.co',
      );
    });

    it.each([undefined, '', '   ', 'no-es-url', 'ftp://media.example.co', 'https://*.example.co'])(
      'falla cerrado con %p',
      (value) => {
        expect(resolveStorageMediaOrigin(value)).toBeNull();
      },
    );
  });

  describe('buildContentSecurityPolicy', () => {
    it('añade el origen del almacenamiento a img-src y a un media-src explícito', () => {
      const policy = buildContentSecurityPolicy({
        nodeEnv: 'production',
        storageEndpoint: 'http://localhost:9002',
      });

      expect(directive(policy, 'img-src')).toBe(
        "img-src 'self' blob: data: https://*.tile.openstreetmap.org http://localhost:9002",
      );
      expect(directive(policy, 'media-src')).toBe("media-src 'self' http://localhost:9002");
    });

    it('sin S3_ENDPOINT no añade origen ni media-src (queda en default-src)', () => {
      const policy = buildContentSecurityPolicy({ nodeEnv: 'production', storageEndpoint: '' });

      expect(directive(policy, 'img-src')).toBe(
        "img-src 'self' blob: data: https://*.tile.openstreetmap.org",
      );
      expect(directive(policy, 'media-src')).toBeUndefined();
      expect(policy).not.toContain('9002');
    });

    it('conserva el resto de la política', () => {
      const policy = buildContentSecurityPolicy({
        nodeEnv: 'production',
        storageEndpoint: 'http://localhost:9002',
      });

      expect(policy).toBe(
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' blob: data: https://*.tile.openstreetmap.org http://localhost:9002; " +
          "media-src 'self' http://localhost:9002; font-src 'self'; connect-src 'self'; " +
          "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; " +
          'upgrade-insecure-requests;',
      );
    });

    it("en desarrollo mantiene 'unsafe-eval' en script-src", () => {
      const policy = buildContentSecurityPolicy({
        nodeEnv: 'development',
        storageEndpoint: undefined,
      });

      expect(directive(policy, 'script-src')).toBe(
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      );
    });
  });
});
