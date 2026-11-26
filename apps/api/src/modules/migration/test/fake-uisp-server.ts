import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { createSelfSignedCertificate } from './self-signed-certificate';

/**
 * UISP falso para pruebas (spec 2026-11-15 «usuarios» §6): servidor https local en loopback
 * con certificado autofirmado generado en memoria. Nunca se llama a una instancia real.
 */
export interface FakeUispRoute {
  status: number;
  body?: unknown;
  /** Retraso antes de responder (para probar el tiempo de espera). */
  delayMs?: number;
}

export interface FakeUispRequest {
  method: string;
  path: string;
  /** Consulta sin `?` (p. ej. `limit=100&offset=0`); ausente si la petición no lleva. */
  query?: string;
  appKey: string | undefined;
}

export interface FakeUispServer {
  baseUrl: string;
  sha256: string;
  requests: FakeUispRequest[];
  /** Respuestas por ruta; una lista se consume en orden y repite la última. */
  routes: Map<string, FakeUispRoute | FakeUispRoute[]>;
  close(): Promise<void>;
}

export const FAKE_UISP_APP_KEY = 'clave-sintetica-de-prueba-0001';

export async function startFakeUisp(): Promise<FakeUispServer> {
  const certificate = createSelfSignedCertificate();
  const routes = new Map<string, FakeUispRoute | FakeUispRoute[]>();
  const requests: FakeUispRequest[] = [];
  const server: Server = createServer(
    { key: certificate.keyPem, cert: certificate.certPem },
    (req, res) => {
      const [path = '', search] = (req.url ?? '').split('?');
      const header = req.headers['x-auth-app-key'];
      requests.push({
        method: req.method ?? '',
        path,
        ...(search ? { query: search } : {}),
        appKey: Array.isArray(header) ? header[0] : header,
      });
      const configured = routes.get(path);
      let route: FakeUispRoute | undefined;
      if (Array.isArray(configured)) {
        route = configured.length > 1 ? configured.shift() : configured[0];
      } else {
        route = configured;
      }
      if (!route) {
        res.writeHead(404, { 'content-type': 'application/json' }).end('{"code":404}');
        return;
      }
      const respond = () => {
        if (res.destroyed) return;
        res
          .writeHead(route.status, { 'content-type': 'application/json' })
          .end(route.body === undefined ? '' : JSON.stringify(route.body));
      };
      if (route.delayMs) setTimeout(respond, route.delayMs);
      else respond();
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `https://127.0.0.1:${port}`,
    sha256: certificate.sha256,
    requests,
    routes,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
