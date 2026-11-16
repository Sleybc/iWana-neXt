/**
 * E2E — Adjuntos en comentarios de tickets (spec MOD09 adjuntos 2026-11-16 §5 y §6).
 *
 * Portal real contra el contrato HTTP congelado de los bloques A y B, con mocks estables:
 * - CA-1/CA-2: comentario con foto, PDF y MP4 generados en la prueba; validación previa del
 *   navegador; estados «En revisión», disponible (miniatura, PDF en pestaña nueva, video y
 *   descarga) y «Archivo bloqueado» (también al responder 409 al pedir el enlace).
 * - CA-1: archivo con firma falsa → el drawer muestra el mensaje de la API y conserva el borrador.
 * - CA-3: un técnico no ve adjuntos de comentarios internos ni pide su enlace.
 * - a11y: axe WCAG 2.2 AA del drawer con adjuntos, claro y oscuro.
 *
 * La regla de seguridad (filtrado de internos, firma real, cuarentena) la prueban contra
 * PostgreSQL `ticket-attachments.http.postgres.integration.spec.ts` y
 * `ticket-attachments.postgres.integration.spec.ts`; aquí se prueba lo que ve la persona.
 * Archivos 100 % sintéticos; nunca adjuntos reales de clientes.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { mockEffectivePermissions } from './helpers/effective-permissions';
import { seedPortalSession } from './helpers/portal-session';

const TENANT_SLUG = 'tenant-adjuntos-sintetico';
const TENANT_ID = 'tenant-adjuntos-001';
const SUPPORT_ID = '11111111-1111-4111-8111-111111111171';
const TECHNICIAN_ID = '22222222-2222-4222-8222-222222222272';
const SUBSCRIBER_ID = '44444444-4444-4444-8444-444444444474';
const TICKET_ID = '55555555-5555-4555-8555-555555555575';
/**
 * Origen de los enlaces firmados: el mismo `S3_ENDPOINT` con el que la API firma y del que el
 * portal deriva `img-src`/`media-src` (`content-security-policy.ts`). Las respuestas se simulan
 * con `route`, así que nunca se toca el almacenamiento real. Sin la variable se usa un origen
 * inválido y la prueba de la CSP queda roja: sin origen configurado la miniatura no carga.
 */
function signedHostFromEnv(): string {
  try {
    return new URL(process.env.S3_ENDPOINT?.trim() ?? '').origin;
  } catch {
    return 'https://archivos-firmados.e2e.invalid';
  }
}
const SIGNED_HOST = signedHostFromEnv();

type AttachmentStatus = 'IN_REVIEW' | 'AVAILABLE' | 'BLOCKED';
type MockAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: AttachmentStatus;
};
type MockComment = {
  id: string;
  ticketId: string;
  tenantId: string;
  body: string;
  isInternal: boolean;
  authorUserId: string;
  createdAt: string;
  attachments: MockAttachment[];
};

// ── Archivos sintéticos mínimos (mismas firmas que apps/api/src/modules/media/testing) ──
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
);
function mp4(): Buffer {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4, 'latin1');
  ftyp.write('isom', 8, 'latin1');
  ftyp.writeUInt32BE(0x200, 12);
  ftyp.write('iso2', 16, 'latin1');
  ftyp.write('mp41', 20, 'latin1');
  const mdat = Buffer.alloc(16);
  mdat.writeUInt32BE(16, 0);
  mdat.write('mdat', 4, 'latin1');
  return Buffer.concat([ftyp, mdat]);
}
const MP4 = mp4();
/** Cabecera MZ (ejecutable) con nombre y tipo de foto: la firma no coincide. */
const FAKE_PNG = Buffer.concat([
  Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
  Buffer.from('programa sintetico de prueba'),
]);

function nowIso(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

function buildToken(sub: string, role: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      email: `hash-${role.toLowerCase()}`,
      role,
      tenantId: TENANT_ID,
      schemaName: 'tenant_adjuntos_001',
      jti: `jti-${role.toLowerCase()}`,
      type: 'tenant',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString('base64url');
  return `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.fakesig`;
}

function buildUser(id: string, role: string, firstName: string) {
  return {
    id,
    email: `${role.toLowerCase()}@adjuntos.example.invalid`,
    role,
    status: 'ACTIVE',
    tenantId: TENANT_ID,
    mfaEnabled: true,
    mfaRequired: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: nowIso(-1000),
    updatedAt: nowIso(-1000),
    deletedAt: null,
    firstName,
    lastName: 'Sintético',
    phone: null,
    jobTitle: role,
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
  };
}

function buildTicket(assignedUserId: string | null) {
  return {
    id: TICKET_ID,
    tenantId: TENANT_ID,
    ticketNumber: 'TK-20261116-071',
    type: 'CUSTOMER_INCIDENT',
    status: 'IN_PROGRESS',
    priority: 'NORMAL',
    source: 'PORTAL',
    subject: 'Visita con evidencia sintética',
    description: 'Caso sintético para adjuntos.',
    requesterType: 'SUBSCRIBER',
    requesterRefId: SUBSCRIBER_ID,
    subjectType: null,
    subjectRefId: null,
    assignedUserId,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: nowIso(60),
    slaResolveByAt: nowIso(240),
    firstRespondedAt: nowIso(-30),
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: 'OK',
    fieldDecision: 'NOT_REQUIRED',
    workOrderId: null,
    createdByUserId: SUPPORT_ID,
    createdAt: nowIso(-120),
    updatedAt: nowIso(-30),
    attachmentCount: 0,
  };
}

/** Nombres de archivo de las partes `files` de un cuerpo multipart. */
function multipartFilenames(body: Buffer): string[] {
  return [...body.toString('latin1').matchAll(/name="files"; filename="([^"]+)"/gu)].map(
    (match) => match[1]!,
  );
}

interface MockOptions {
  role: 'SUPPORT' | 'TECHNICIAN';
  userId: string;
  /** Respuesta forzada al subir (p. ej. el 400 de firma falsa). */
  uploadFailure?: { status: number; body: Record<string, unknown> };
}

async function setupMocks(page: Page, options: MockOptions) {
  const ticket = buildTicket(options.role === 'TECHNICIAN' ? TECHNICIAN_ID : null);
  const comments: MockComment[] = [
    {
      id: 'comment-previo-1',
      ticketId: TICKET_ID,
      tenantId: TENANT_ID,
      body: 'Informe previo del caso.',
      isInternal: false,
      authorUserId: SUPPORT_ID,
      createdAt: nowIso(-60),
      attachments: [
        {
          id: 'att-bloqueado',
          filename: 'malicioso.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          status: 'BLOCKED',
        },
        {
          // Listado como disponible, pero la cuarentena lo bloqueó después: el enlace da 409.
          id: 'att-bloqueado-tarde',
          filename: 'informe-previo.pdf',
          contentType: 'application/pdf',
          sizeBytes: 4096,
          status: 'AVAILABLE',
        },
      ],
    },
    {
      id: 'comment-interno-1',
      ticketId: TICKET_ID,
      tenantId: TENANT_ID,
      body: 'Nota interna con el acta firmada.',
      isInternal: true,
      authorUserId: SUPPORT_ID,
      createdAt: nowIso(-50),
      attachments: [
        {
          id: 'att-interno',
          filename: 'acta-interna.pdf',
          contentType: 'application/pdf',
          sizeBytes: 3072,
          status: 'AVAILABLE',
        },
      ],
    },
  ];
  const calls = {
    uploads: [] as Array<{ contentType: string; filenames: string[]; body: string }>,
    links: [] as Array<{ attachmentId: string; disposition: string }>,
  };
  /** Como la API real: TECHNICIAN y CONTRACTOR no reciben comentarios internos. */
  const visibleComments = () =>
    options.role === 'TECHNICIAN' ? comments.filter((comment) => !comment.isInternal) : comments;
  const findAttachment = (attachmentId: string) =>
    visibleComments()
      .flatMap((comment) => comment.attachments)
      .find((attachment) => attachment.id === attachmentId);

  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'GET' && pathname.endsWith('/tenants/public-branding')) {
      return json({
        data: {
          displayName: 'Empresa sintética de adjuntos',
          showTenantName: true,
          logoLightUrl: null,
          logoDarkUrl: null,
          sealLightUrl: null,
          sealDarkUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
          loginBackgroundLightUrl: null,
          loginBackgroundDarkUrl: null,
        },
      });
    }
    if (method === 'GET' && pathname.endsWith('/auth/me')) {
      return json({
        data: {
          sub: options.userId,
          email: `hash-${options.role.toLowerCase()}`,
          role: options.role,
          tenantId: TENANT_ID,
          schemaName: 'tenant_adjuntos_001',
          jti: `jti-${options.role.toLowerCase()}`,
          type: 'tenant',
        },
      });
    }
    if (method === 'GET' && pathname.endsWith('/tenants/me')) {
      return json({
        data: {
          id: TENANT_ID,
          name: 'Empresa sintética de adjuntos',
          slug: TENANT_SLUG,
          status: 'ACTIVE',
          contactEmail: 'empresa@adjuntos.example.invalid',
          showTenantName: true,
        },
      });
    }
    if (method === 'GET' && pathname.endsWith('/users')) {
      return json({
        data: [
          buildUser(SUPPORT_ID, 'SUPPORT', 'Paula'),
          buildUser(TECHNICIAN_ID, 'TECHNICIAN', 'Tomás'),
        ],
        meta: { nextCursor: null },
      });
    }
    if (method === 'GET' && pathname.endsWith(`/users/${options.userId}`)) {
      return json({
        data: buildUser(
          options.userId,
          options.role,
          options.role === 'SUPPORT' ? 'Paula' : 'Tomás',
        ),
      });
    }
    if (method === 'GET' && pathname.endsWith('/assurance/sla-policies')) return json([]);
    if (method === 'GET' && pathname.endsWith('/assurance/dashboard/summary')) {
      return json({
        openCount: 0,
        assignedCount: 0,
        inProgressCount: 1,
        atRiskCount: 0,
        breachedCount: 0,
        resolvedTodayCount: 0,
        fieldServicePendingCount: 0,
        byPriority: { NORMAL: 1 },
        byType: { CUSTOMER_INCIDENT: 1 },
      });
    }
    if (method === 'GET' && pathname.endsWith('/assurance/tickets')) {
      const attachmentCount = visibleComments().reduce(
        (total, comment) => total + comment.attachments.length,
        0,
      );
      return json({ data: [{ ...ticket, attachmentCount }], total: 1, page: 1, limit: 20 });
    }
    if (method === 'GET' && pathname.endsWith(`/assurance/tickets/${TICKET_ID}`)) {
      return json(ticket);
    }
    if (method === 'GET' && pathname.endsWith(`/assurance/tickets/${TICKET_ID}/comments`)) {
      return json(visibleComments());
    }
    if (method === 'GET' && pathname.endsWith(`/assurance/tickets/${TICKET_ID}/timeline`)) {
      return json([]);
    }
    if (method === 'GET' && pathname.endsWith(`/assurance/tickets/${TICKET_ID}/attachments`)) {
      return json(visibleComments().flatMap((comment) => comment.attachments));
    }
    const linkMatch = pathname.match(
      new RegExp(`/assurance/tickets/${TICKET_ID}/attachments/([^/]+)/link$`, 'u'),
    );
    if (method === 'GET' && linkMatch) {
      const attachmentId = decodeURIComponent(linkMatch[1]!);
      const disposition = url.searchParams.get('disposition') ?? 'inline';
      calls.links.push({ attachmentId, disposition });
      const attachment = findAttachment(attachmentId);
      if (!attachment) {
        return json({ code: 'TICKET_ATTACHMENT_NOT_FOUND', message: 'No encontrado' }, 404);
      }
      if (attachmentId === 'att-bloqueado-tarde') {
        return json(
          {
            code: 'TICKET_ATTACHMENT_BLOCKED',
            message: 'Archivo bloqueado: no se puede abrir ni descargar.',
          },
          409,
        );
      }
      if (attachment.status === 'IN_REVIEW') {
        return json(
          {
            code: 'TICKET_ATTACHMENT_IN_REVIEW',
            message: 'El archivo está en revisión. Podrás abrirlo cuando termine.',
          },
          409,
        );
      }
      if (attachment.status === 'BLOCKED') {
        return json(
          {
            code: 'TICKET_ATTACHMENT_BLOCKED',
            message: 'Archivo bloqueado: no se puede abrir ni descargar.',
          },
          409,
        );
      }
      return json({
        url: `${SIGNED_HOST}/${attachment.id}/${encodeURIComponent(attachment.filename)}?disposition=${disposition}&firma=sintetica`,
        expiresAt: nowIso(5),
        filename: attachment.filename,
        contentType: attachment.contentType,
      });
    }
    if (
      method === 'POST' &&
      pathname.endsWith(`/assurance/tickets/${TICKET_ID}/comments/with-attachments`)
    ) {
      const contentType = (await request.allHeaders())['content-type'] ?? '';
      const raw = request.postDataBuffer() ?? Buffer.alloc(0);
      const filenames = multipartFilenames(raw);
      const text = raw.toString('latin1');
      calls.uploads.push({ contentType, filenames, body: raw.toString('utf8') });
      if (options.uploadFailure) {
        return json(options.uploadFailure.body, options.uploadFailure.status);
      }
      const bodyMatch = text.match(/name="body"\r\n\r\n([\s\S]*?)\r\n--/u);
      const internalMatch = text.match(/name="isInternal"\r\n\r\n(true|false)\r\n--/u);
      const contentTypes: Record<string, string> = {
        png: 'image/png',
        pdf: 'application/pdf',
        mp4: 'video/mp4',
      };
      const created: MockComment = {
        id: `comment-nuevo-${comments.length + 1}`,
        ticketId: TICKET_ID,
        tenantId: TENANT_ID,
        body: Buffer.from(bodyMatch?.[1] ?? '', 'latin1').toString('utf8'),
        isInternal: internalMatch?.[1] === 'true',
        authorUserId: options.userId,
        createdAt: nowIso(1),
        attachments: filenames.map((filename, index) => ({
          id: `att-nuevo-${index + 1}`,
          filename,
          contentType: contentTypes[filename.split('.').pop() ?? ''] ?? 'application/pdf',
          sizeBytes: 64,
          status: 'IN_REVIEW' as const,
        })),
      };
      comments.push(created);
      return json(created, 201);
    }

    return json({ code: 'E2E_UNMOCKED', message: request.url() }, 404);
  });

  // Enlaces firmados de corta vida (almacenamiento privado simulado). Va en el contexto para
  // que también responda a la pestaña nueva del PDF.
  await page.context().route(`${SIGNED_HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    const filename = decodeURIComponent(url.pathname.split('/').pop() ?? 'archivo');
    const extension = filename.split('.').pop();
    const body = extension === 'png' ? PNG : extension === 'mp4' ? MP4 : PDF;
    const contentType =
      extension === 'png' ? 'image/png' : extension === 'mp4' ? 'video/mp4' : 'application/pdf';
    const headers: Record<string, string> = { 'content-type': contentType };
    if (url.searchParams.get('disposition') === 'attachment') {
      headers['content-disposition'] = `attachment; filename="${filename}"`;
    }
    await route.fulfill({ status: 200, headers, body });
  });

  await seedPortalSession(page, {
    token: buildToken(options.userId, options.role),
    tenantSlug: TENANT_SLUG,
  });
  await mockEffectivePermissions(page, {
    userId: options.userId,
    role: options.role,
    effectivePermissions: ['assurance.tickets.read', 'assurance.tickets.manage'],
  });

  /** Simula el fin del análisis de cuarentena de los adjuntos nuevos. */
  const finishQuarantine = () => {
    for (const attachment of comments.flatMap((comment) => comment.attachments)) {
      if (attachment.id.startsWith('att-nuevo-')) attachment.status = 'AVAILABLE';
    }
  };

  return { calls, finishQuarantine };
}

async function openTicketComments(page: Page) {
  await page.goto('/dashboard/assurance', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Mesa de ayuda' })).toBeVisible();
  await page.getByRole('button', { name: 'TK-20261116-071' }).click();
  await expect(page.getByRole('heading', { name: 'TK-20261116-071' })).toBeVisible();
  await page.getByRole('tab', { name: 'Comentarios' }).click();
}

async function expectNoSeriousAxeViolations(page: Page, label: string): Promise<void> {
  // Se espera a que las transiciones terminen: axe mide el contraste con la opacidad del momento.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))),
  );
  const result = await new AxeBuilder({ page })
    .include('aside')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const detail = blocking
    .flatMap((violation) =>
      violation.nodes.slice(0, 5).map((node) => {
        const data = (node.any[0]?.data ?? {}) as {
          fgColor?: string;
          bgColor?: string;
          contrastRatio?: number;
        };
        const colors = data.fgColor
          ? ` ${data.fgColor} sobre ${data.bgColor} (${data.contrastRatio}:1)`
          : '';
        return `${violation.id} → ${node.target.join(' ')}${colors}`;
      }),
    )
    .join(' | ');
  expect(blocking, `axe ${label}: ${detail}`).toEqual([]);
}

test.describe('MOD09 · adjuntos en comentarios de tickets', () => {
  test.setTimeout(120_000);

  test('CA-1/CA-2: sube foto, PDF y MP4 sintéticos, pasan por revisión y se abren; bloqueados no se descargan', async ({
    page,
  }) => {
    const { calls, finishQuarantine } = await setupMocks(page, {
      role: 'SUPPORT',
      userId: SUPPORT_ID,
    });
    await openTicketComments(page);

    // Estado inicial: un bloqueado (sin acciones) y la sección del caso con lo visible.
    const section = page.getByTestId('ticket-attachments-section');
    await expect(section.getByRole('heading', { name: 'Adjuntos (3)' })).toBeVisible();
    const blocked = page
      .getByRole('tabpanel', { name: 'Comentarios' })
      .getByTestId('ticket-attachment')
      .filter({ hasText: 'malicioso.pdf' });
    await expect(blocked).toHaveAttribute('data-attachment-status', 'BLOCKED');
    await expect(blocked.getByText('Archivo bloqueado', { exact: true })).toBeVisible();
    await expect(blocked.getByRole('button')).toHaveCount(0);

    // Validación previa del navegador: un tipo no admitido no se agrega.
    const input = page.getByLabel('Adjuntar archivos');
    await expect(input).toHaveAttribute('data-testid', 'ticket-comment-attachments-input');
    await input.setInputFiles([
      { name: 'foto-visita.png', mimeType: 'image/png', buffer: PNG },
      { name: 'acta-visita.pdf', mimeType: 'application/pdf', buffer: PDF },
      { name: 'recorrido.mp4', mimeType: 'video/mp4', buffer: MP4 },
      { name: 'macro.docm', mimeType: 'application/octet-stream', buffer: PDF },
    ]);
    const issues = page.getByRole('alert', { name: 'Archivos no agregados' });
    await expect(issues).toContainText('«macro.docm»');
    await expect(issues).toContainText('Tipo de archivo no permitido');
    const selected = page.getByTestId('ticket-comment-attachment-selected');
    await expect(selected).toHaveCount(3);

    // Quitar y volver a agregar deja la misma selección.
    await page.getByRole('button', { name: 'Quitar recorrido.mp4' }).click();
    await expect(selected).toHaveCount(2);
    await input.setInputFiles([{ name: 'recorrido.mp4', mimeType: 'video/mp4', buffer: MP4 }]);
    await expect(selected).toHaveCount(3);

    await page.getByLabel('Nuevo comentario').fill('Evidencia de la visita sintética.');
    await page.getByRole('button', { name: 'Agregar comentario' }).click();
    await expect(page.getByText('Comentario registrado.')).toBeVisible();

    // Una sola petición multipart con texto y los tres archivos.
    expect(calls.uploads).toHaveLength(1);
    expect(calls.uploads[0]!.contentType).toMatch(/^multipart\/form-data; boundary=/u);
    expect(calls.uploads[0]!.filenames).toEqual([
      'foto-visita.png',
      'acta-visita.pdf',
      'recorrido.mp4',
    ]);
    expect(calls.uploads[0]!.body).toContain('Evidencia de la visita sintética.');
    await expect(selected).toHaveCount(0);

    // En revisión: sin miniatura, sin abrir ni descargar, y sin pedir enlaces.
    const newComment = page
      .getByRole('article')
      .filter({ hasText: 'Evidencia de la visita sintética.' });
    const fresh = newComment.getByTestId('ticket-attachment');
    await expect(fresh).toHaveCount(3);
    for (const name of ['foto-visita.png', 'acta-visita.pdf', 'recorrido.mp4']) {
      const item = fresh.filter({ hasText: name });
      await expect(item).toHaveAttribute('data-attachment-status', 'IN_REVIEW');
      await expect(item.getByText('En revisión', { exact: true })).toBeVisible();
      await expect(item.getByRole('button', { name: `Descargar ${name}` })).toHaveCount(0);
    }
    await expect(section.getByRole('heading', { name: 'Adjuntos (6)' })).toBeVisible();
    expect(calls.links.filter((link) => link.attachmentId.startsWith('att-nuevo-'))).toEqual([]);

    // Termina la cuarentena: al volver a abrir el caso quedan disponibles.
    finishQuarantine();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await openTicketComments(page);
    const available = page
      .getByRole('article')
      .filter({ hasText: 'Evidencia de la visita sintética.' })
      .getByTestId('ticket-attachment');
    for (const name of ['foto-visita.png', 'acta-visita.pdf', 'recorrido.mp4']) {
      await expect(available.filter({ hasText: name })).toHaveAttribute(
        'data-attachment-status',
        'AVAILABLE',
      );
    }

    // Foto: la miniatura pide su enlace inline al quedar disponible (que la imagen cargue lo
    // prueba aparte «CA-2: miniatura y video cargan…»).
    await expect
      .poll(() =>
        calls.links.some(
          (link) => link.attachmentId === 'att-nuevo-1' && link.disposition === 'inline',
        ),
      )
      .toBe(true);

    // PDF: pestaña nueva con el enlace firmado inline.
    // Se comprueba la petición de la pestaña nueva y no `popup.url()`: con `noopener`,
    // el Chromium de Playwright (el del CI) deja la URL de la pestaña vacía.
    const pdfPattern = new RegExp(
      `^${SIGNED_HOST}/att-nuevo-2/acta-visita\\.pdf\\?disposition=inline`,
      'u',
    );
    const popupPromise = page.context().waitForEvent('page');
    const pdfRequestPromise = page
      .context()
      .waitForEvent('request', (request) => pdfPattern.test(request.url()));
    await page.getByRole('button', { name: 'Abrir PDF: acta-visita.pdf' }).first().click();
    const [popup, pdfRequest] = await Promise.all([popupPromise, pdfRequestPromise]);
    expect(pdfRequest.frame().page()).toBe(popup);
    await popup.close();

    // Video: se reproduce en el navegador con el enlace firmado.
    await available
      .filter({ hasText: 'recorrido.mp4' })
      .getByRole('button', { name: 'Reproducir video: recorrido.mp4' })
      .click();
    const video = page.getByLabel('Video recorrido.mp4');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('src', new RegExp(`^${SIGNED_HOST}/att-nuevo-3/`, 'u'));

    // Descarga: enlace con disposición attachment y el nombre saneado.
    const downloadPromise = page.waitForEvent('download');
    await available
      .filter({ hasText: 'acta-visita.pdf' })
      .getByRole('button', { name: 'Descargar acta-visita.pdf' })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('acta-visita.pdf');
    expect(calls.links).toContainEqual({ attachmentId: 'att-nuevo-2', disposition: 'attachment' });

    // Listado como disponible pero bloqueado después: el 409 actualiza el estado visible.
    const late = page
      .getByRole('article')
      .filter({ hasText: 'Informe previo del caso.' })
      .getByTestId('ticket-attachment')
      .filter({ hasText: 'informe-previo.pdf' });
    await late.getByRole('button', { name: 'Descargar informe-previo.pdf' }).click();
    await expect(late).toHaveAttribute('data-attachment-status', 'BLOCKED');
    await expect(late.getByText('Archivo bloqueado', { exact: true })).toBeVisible();
    // El bloqueado nunca pidió enlace.
    expect(calls.links.some((link) => link.attachmentId === 'att-bloqueado')).toBe(false);

    // a11y del drawer con adjuntos en todos sus estados (claro y oscuro).
    await expectNoSeriousAxeViolations(page, 'drawer con adjuntos (claro)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectNoSeriousAxeViolations(page, 'drawer con adjuntos (oscuro)');
    await page.emulateMedia({ colorScheme: 'light' });
  });

  test('CA-2: miniatura y video cargan desde el enlace firmado del almacenamiento (otro origen)', async ({
    page,
  }) => {
    // El enlace firmado apunta al almacenamiento privado (MinIO/S3), que no es el origen del
    // portal: la CSP del portal debe permitir cargarlo en <img> y <video>.
    const { finishQuarantine } = await setupMocks(page, { role: 'SUPPORT', userId: SUPPORT_ID });
    const violations: string[] = [];
    await page.exposeFunction('__reportCspViolation', (entry: string) => violations.push(entry));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (
          window as unknown as { __reportCspViolation: (entry: string) => void }
        ).__reportCspViolation(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    await openTicketComments(page);
    await page.getByLabel('Adjuntar archivos').setInputFiles([
      { name: 'foto-visita.png', mimeType: 'image/png', buffer: PNG },
      { name: 'recorrido.mp4', mimeType: 'video/mp4', buffer: MP4 },
    ]);
    await page.getByLabel('Nuevo comentario').fill('Foto y video sintéticos.');
    await page.getByRole('button', { name: 'Agregar comentario' }).click();
    await expect(page.getByText('Comentario registrado.')).toBeVisible();
    finishQuarantine();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await openTicketComments(page);

    await page.getByRole('button', { name: 'Reproducir video: recorrido.mp4' }).click();
    await expect(page.getByLabel('Video recorrido.mp4')).toHaveAttribute(
      'src',
      new RegExp(`^${SIGNED_HOST}/att-nuevo-2/`, 'u'),
    );
    const thumbnail = page.getByAltText('Vista previa de foto-visita.png');
    // Blando: si la miniatura no aparece, la causa la nombra la aserción de la CSP de abajo.
    await expect.soft(thumbnail).toBeVisible();
    expect(
      violations.filter((entry) => entry.includes(SIGNED_HOST)),
      'La CSP del portal bloquea el enlace firmado del almacenamiento',
    ).toEqual([]);
    await expect
      .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test('CA-1: un archivo con firma falsa muestra el mensaje de la API y no se pierde el borrador', async ({
    page,
  }) => {
    const message =
      '«foto-visita.png»: El contenido del archivo no coincide con su tipo. No se guardó el comentario ni sus archivos.';
    const { calls } = await setupMocks(page, {
      role: 'SUPPORT',
      userId: SUPPORT_ID,
      uploadFailure: {
        status: 400,
        body: {
          code: 'TICKET_ATTACHMENT_REJECTED',
          message,
          rejected: [{ index: 0, filename: 'foto-visita.png', code: 'FIRMA_NO_COINCIDE', message }],
        },
      },
    });
    await openTicketComments(page);

    // El navegador solo ve nombre y tipo: la firma la valida la API.
    await page
      .getByLabel('Adjuntar archivos')
      .setInputFiles([{ name: 'foto-visita.png', mimeType: 'image/png', buffer: FAKE_PNG }]);
    await expect(page.getByTestId('ticket-comment-attachment-selected')).toHaveCount(1);
    await page.getByLabel('Nuevo comentario').fill('Comentario con archivo disfrazado.');
    await page.getByRole('button', { name: 'Agregar comentario' }).click();

    await expect(page.getByText(message, { exact: true })).toBeVisible();
    expect(calls.uploads).toHaveLength(1);
    expect(calls.uploads[0]!.filenames).toEqual(['foto-visita.png']);
    // No se guardó nada: el borrador y el archivo quedan para corregir y reintentar.
    await expect(page.getByLabel('Nuevo comentario')).toHaveValue(
      'Comentario con archivo disfrazado.',
    );
    await expect(page.getByTestId('ticket-comment-attachment-selected')).toHaveCount(1);
    await expect(
      page.getByRole('article').filter({ hasText: 'Comentario con archivo disfrazado.' }),
    ).toHaveCount(0);
    await expect(page.getByText('Comentario registrado.')).toHaveCount(0);
  });

  test('CA-3: un técnico no ve los adjuntos de comentarios internos ni pide su enlace', async ({
    page,
  }) => {
    const { calls } = await setupMocks(page, { role: 'TECHNICIAN', userId: TECHNICIAN_ID });
    await openTicketComments(page);

    const section = page.getByTestId('ticket-attachments-section');
    await expect(section.getByRole('heading', { name: 'Adjuntos (2)' })).toBeVisible();
    await expect(page.getByText('Informe previo del caso.')).toBeVisible();
    await expect(page.getByText('Nota interna con el acta firmada.')).toHaveCount(0);
    await expect(page.getByText('acta-interna.pdf')).toHaveCount(0);
    await expect(page.getByText('Interno', { exact: true })).toHaveCount(0);
    expect(calls.links.some((link) => link.attachmentId === 'att-interno')).toBe(false);
  });
});
