/**
 * Puerto del portal en la suite E2E. Por defecto 3002; `E2E_PORTAL_PORT` lo cambia
 * cuando `pnpm dev` ya ocupa el 3002. Se lee al llamar, no al importar, para que
 * `loadWorkspaceEnv()` corra antes.
 */
export function portalPort(): number {
  const raw = process.env.E2E_PORTAL_PORT?.trim() || '3002';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`E2E_PORTAL_PORT inválido: ${raw}`);
  }
  return port;
}

export function portalOrigin(): string {
  return `http://127.0.0.1:${portalPort()}`;
}
