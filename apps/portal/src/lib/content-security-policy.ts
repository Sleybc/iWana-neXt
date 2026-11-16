/**
 * Política CSP del portal (sin nonces; ver next.config.ts).
 *
 * Los adjuntos de tickets se abren con un enlace firmado que apunta al almacenamiento
 * S3/MinIO, otro origen. La miniatura (`<img>`) y el `<video>` solo cargan si ese origen
 * exacto figura en `img-src` y `media-src`. Se deriva del mismo origen con el que la API firma
 * los enlaces: `S3_PUBLIC_ENDPOINT` (o `S3_ENDPOINT` en desarrollo, ver next.config.ts); si
 * falta o no es una URL http(s) válida no se añade nada
 * (falla cerrado) y la miniatura y el video quedan bloqueados.
 */

/** Origen exacto (`esquema://host[:puerto]`) del almacenamiento, o `null` si no es usable. */
export function resolveStorageMediaOrigin(endpoint: string | undefined): string | null {
  const raw = endpoint?.trim();
  if (!raw || raw.includes('*')) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.origin;
}

export interface ContentSecurityPolicyOptions {
  nodeEnv: string | undefined;
  storageEndpoint: string | undefined;
}

export function buildContentSecurityPolicy({
  nodeEnv,
  storageEndpoint,
}: ContentSecurityPolicyOptions): string {
  // En desarrollo, webpack necesita 'unsafe-eval' (runtime de módulos); sin él la
  // hidratación falla y AuthProvider nunca dispara /auth/me.
  const scriptSrc =
    nodeEnv === 'production'
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  const storageOrigin = resolveStorageMediaOrigin(storageEndpoint);
  const storageSource = storageOrigin ? ` ${storageOrigin}` : '';
  const mediaSrc = storageOrigin ? `media-src 'self' ${storageOrigin};` : '';

  return `default-src 'self';
  ${scriptSrc};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://*.tile.openstreetmap.org${storageSource};
  ${mediaSrc}
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;`
    .replace(/\s+/g, ' ')
    .trim();
}
