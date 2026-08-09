import {
  isCookieSecure,
  platformAccessCookieName,
  platformRefreshCookieName,
  SESSION_COOKIE_BASE_NAMES,
  tenantAccessCookieName,
  tenantRefreshCookieName,
} from './session-cookies.constants';

/**
 * Contrato congelado del Track 1 (ADR-081 C-5 + decisión de nombres fijada por
 * AI-EM-ARCH): access tenant = `portalAccessToken`, access plataforma =
 * `webAccessToken`, refresh tenant = `refreshToken` (inmutable), refresh
 * plataforma = `webRefreshToken`. Prefijo `__Host-` SOLO en producción y SOLO
 * en las cookies de access (las de refresh viven con `path: '/api/v1/auth'` y
 * no cumplen los requisitos del prefijo).
 */

const ORIGINAL_NODE_ENV = process.env['NODE_ENV'];
const ORIGINAL_COOKIE_SECURE = process.env['COOKIE_SECURE'];

function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  process.env['NODE_ENV'] = env['NODE_ENV'];
  if (env['COOKIE_SECURE'] === undefined) {
    delete process.env['COOKIE_SECURE'];
  } else {
    process.env['COOKIE_SECURE'] = env['COOKIE_SECURE'];
  }

  try {
    fn();
  } finally {
    process.env['NODE_ENV'] = ORIGINAL_NODE_ENV;
    if (ORIGINAL_COOKIE_SECURE === undefined) {
      delete process.env['COOKIE_SECURE'];
    } else {
      process.env['COOKIE_SECURE'] = ORIGINAL_COOKIE_SECURE;
    }
  }
}

describe('session-cookies.constants — contrato congelado de nombres (ADR-081 C-5)', () => {
  it('expone los nombres base exactos del contrato', () => {
    expect(SESSION_COOKIE_BASE_NAMES).toEqual({
      accessTenant: 'portalAccessToken',
      accessPlatform: 'webAccessToken',
      refreshTenant: 'refreshToken',
      refreshPlatform: 'webRefreshToken',
    });
  });

  it('sin __Host- fuera de producción', () => {
    withEnv({ NODE_ENV: 'development' }, () => {
      expect(tenantAccessCookieName()).toBe('portalAccessToken');
      expect(platformAccessCookieName()).toBe('webAccessToken');
      expect(tenantRefreshCookieName()).toBe('refreshToken');
      expect(platformRefreshCookieName()).toBe('webRefreshToken');
    });
  });

  it('prefija con __Host- las cookies de access en producción', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      expect(tenantAccessCookieName()).toBe('__Host-portalAccessToken');
      expect(platformAccessCookieName()).toBe('__Host-webAccessToken');
    });
  });

  it('nunca prefija las cookies de refresh (path restringido)', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      expect(tenantRefreshCookieName()).toBe('refreshToken');
      expect(platformRefreshCookieName()).toBe('webRefreshToken');
    });
  });
});

describe('isCookieSecure — acople a producción en runtime (ADR-081 C-5)', () => {
  it('fuerza true en producción aunque COOKIE_SECURE no esté definida', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      expect(isCookieSecure()).toBe(true);
    });
  });

  it('fuerza true en producción aunque COOKIE_SECURE=false', () => {
    withEnv({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }, () => {
      expect(isCookieSecure()).toBe(true);
    });
  });

  it('default false en desarrollo sin la variable', () => {
    withEnv({ NODE_ENV: 'development' }, () => {
      expect(isCookieSecure()).toBe(false);
    });
  });

  it('respeta COOKIE_SECURE=true fuera de producción', () => {
    withEnv({ NODE_ENV: 'development', COOKIE_SECURE: 'true' }, () => {
      expect(isCookieSecure()).toBe(true);
    });
  });
});
