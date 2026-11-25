interface ConfigReader {
  get<T>(key: string): T | undefined;
}

/**
 * Base del portal empresarial (apps/portal), donde entra el personal del tenant y viven
 * /auth/reset-password y /auth/verify-email. `PORTAL_URL`; sin ella, `FRONTEND_URL`; en
 * desarrollo, el puerto del portal.
 */
export function resolvePortalUrl(config: ConfigReader): string {
  const configured =
    config.get<string>('PORTAL_URL') ||
    config.get<string>('FRONTEND_URL') ||
    'http://localhost:3002';
  return configured.replace(/\/+$/u, '');
}
