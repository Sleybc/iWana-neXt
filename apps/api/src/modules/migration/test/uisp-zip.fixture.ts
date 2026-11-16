import JSZip from 'jszip';

/**
 * ZIP SINTÉTICO con la forma del export por cliente de UISP (spec 2026-11-10 v1.1 §1).
 * Ningún valor proviene de la muestra real: nombres, documentos, montos y fechas son
 * inventados. La estructura (archivos, carpetas y nombres de campo) sigue la API CRM de UISP.
 *
 * Contenido por defecto: 1 cliente, 2 servicios, 3 facturas (2 con PDF), 2 pagos, 2 tickets
 * (uno con 3 tareas que no viajan y 1 adjunto) y 2 documentos; `quotes`, `refunds`,
 * `payment_plans` y `jobs` vacíos.
 */
export interface UispFixtureOptions {
  clientId?: number;
  clientType?: 1 | 2;
  /** Valor del atributo «Cédula»; `null` lo omite. */
  document?: string | null;
  stratum?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  lat?: number | null;
  lon?: number | null;
  tagIds?: number[];
  planIds?: [number, number];
  cycleDay?: number;
  methodId?: string;
  /** Carpeta raíz dentro del ZIP (algunos exports la traen). */
  rootFolder?: string;
  /** Contactos adicionales de UISP, después del principal (`isContact: true`). */
  extraContacts?: Array<Record<string, unknown>>;
  /** `assignedUserId` del primer ticket (número de usuario de UISP). */
  ticketAssignedUserId?: number | null;
  /** `activity` del primer ticket; por defecto, un comentario privado sin usuario. */
  ticketActivity?: Array<Record<string, unknown>>;
  /** `userId` de cada pago, en orden (número de usuario de UISP que lo registró). */
  paymentUserIds?: Array<number | null>;
  /**
   * Archivos extra en `tickets/<id del primer ticket>/` (adjuntos sintéticos; spec MOD09
   * adjuntos §2.3). Se referencian desde `ticketActivity[].comment.attachments[]`.
   */
  ticketFiles?: Record<string, Buffer>;
}

/** Id de UISP del primer ticket del fixture (su carpeta de adjuntos es `tickets/<id>/`). */
export function syntheticFirstTicketId(clientId = 9001): number {
  return clientId * 10_000 + 1;
}

/**
 * Bytes sintéticos mínimos con firma real (generados aquí; nunca adjuntos de clientes). El
 * fixture es autocontenido porque la E2E lo transpila suelto.
 */
export const syntheticAttachmentBytes = {
  /** PNG 1×1 transparente. */
  png: (): Buffer =>
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64',
    ),
  /** PDF mínimo sin páginas. */
  pdf: (): Buffer =>
    Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
      'latin1',
    ),
  /** MP4 mínimo: caja `ftyp` (isom; compatibles iso2/mp41) y `mdat` vacía. */
  mp4: (): Buffer => {
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
  },
  /** Cabecera MZ seguida de texto: ninguna firma admitida. */
  executable: (): Buffer =>
    Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from('programa sintetico')]),
};

/**
 * Actividad del primer ticket con adjuntos sintéticos: un comentario con PNG, PDF y MP4 válidos
 * y otro con un archivo ausente del ZIP y uno de tipo no permitido. Ids de adjunto a partir de
 * `firstAttachmentId` (únicos por corrida en un tenant compartido).
 */
export function syntheticTicketAttachments(firstAttachmentId: number): {
  ticketActivity: Array<Record<string, unknown>>;
  ticketFiles: Record<string, Buffer>;
} {
  const id = (offset: number) => firstAttachmentId + offset;
  const files = {
    png: syntheticAttachmentBytes.png(),
    pdf: syntheticAttachmentBytes.pdf(),
    mp4: syntheticAttachmentBytes.mp4(),
    exe: syntheticAttachmentBytes.executable(),
  };
  return {
    ticketActivity: [
      {
        id: 1,
        public: true,
        createdAt: '2023-03-01T10:00:00-0500',
        comment: {
          body: 'Comentario sintético con foto, acta y video',
          attachments: [
            {
              id: id(0),
              filename: 'foto sintética.png',
              mimeType: 'image/png',
              size: files.png.length,
            },
            {
              id: id(1),
              filename: 'acta.pdf',
              mimeType: 'application/pdf',
              size: files.pdf.length,
            },
            { id: id(2), filename: 'video.mp4', mimeType: 'video/mp4', size: files.mp4.length },
          ],
        },
      },
      {
        id: 2,
        public: false,
        createdAt: '2023-03-02T10:00:00-0500',
        comment: {
          body: 'Comentario sintético con adjunto ausente e inválido',
          attachments: [
            { id: id(3), filename: 'ausente.jpg', mimeType: 'image/jpg', size: 10 },
            {
              id: id(4),
              filename: 'programa.exe',
              mimeType: 'application/octet-stream',
              size: files.exe.length,
            },
          ],
        },
      },
    ],
    ticketFiles: {
      'foto sintética.png': files.png,
      'acta.pdf': files.pdf,
      'video.mp4': files.mp4,
      'programa.exe': files.exe,
    },
  };
}

export const SYNTHETIC_METHOD_ID = '00000000-aaaa-4bbb-8ccc-000000000001';

export function syntheticUispClient(options: UispFixtureOptions = {}): Record<string, unknown> {
  const clientId = options.clientId ?? 9001;
  const attributes: Array<Record<string, unknown>> = [];
  if (options.document !== null) {
    attributes.push({
      id: 1,
      clientId,
      customAttributeId: 1,
      name: 'Cédula',
      key: 'cedula',
      value: options.document ?? '1000000001',
      clientZoneVisible: false,
    });
  }
  if (options.stratum !== null) {
    attributes.push({
      id: 2,
      clientId,
      customAttributeId: 2,
      name: 'Estrato',
      key: 'estrato',
      value: options.stratum ?? '3',
      clientZoneVisible: false,
    });
  }
  return {
    id: clientId,
    userIdent: `SINT-${clientId}`,
    organizationId: 1,
    clientType: options.clientType ?? 1,
    isLead: false,
    firstName: options.firstName === undefined ? 'Titular' : options.firstName,
    lastName: options.lastName === undefined ? 'Sintético' : options.lastName,
    companyName: options.companyName ?? null,
    street1: 'Calle Ficticia 1',
    city: 'Ciudad Ficticia',
    countryId: 54,
    fullAddress: 'Calle Ficticia 1, Ciudad Ficticia',
    invoiceAddressSameAsContact: true,
    addressGpsLat: options.lat === undefined ? 4.6 : options.lat,
    addressGpsLon: options.lon === undefined ? -74.08 : options.lon,
    registrationDate: '2022-01-10T00:00:00-0500',
    contacts: [
      {
        id: 1,
        clientId,
        email: 'titular@example.invalid',
        phone: '3000000000',
        name: null,
        isBilling: true,
        isContact: true,
        types: [{ id: 1, name: 'Billing' }],
      },
      ...(options.extraContacts ?? []).map((contact, index) => ({
        id: index + 2,
        clientId,
        isBilling: false,
        isContact: false,
        ...contact,
      })),
    ],
    attributes,
    tags: (options.tagIds ?? [11]).map((id) => ({
      id,
      name: `Etiqueta ${id}`,
      colorBackground: '#123456',
      colorText: '#ffffff',
    })),
    accountBalance: -80,
    accountCredit: 0,
    accountOutstanding: 80,
    currencyCode: 'COP',
    hasOverdueInvoice: true,
    hasSuspendedService: false,
    hasOutage: false,
  };
}

export async function buildSyntheticUispZip(options: UispFixtureOptions = {}): Promise<Buffer> {
  const clientId = options.clientId ?? 9001;
  const [planA, planB] = options.planIds ?? [501, 502];
  const zip = new JSZip();
  const root = options.rootFolder ? `${options.rootFolder}/` : '';
  const put = (path: string, content: string | Buffer) => zip.file(`${root}${path}`, content);
  const json = (value: unknown) => JSON.stringify(value, null, 2);

  put('client.json', json(syntheticUispClient(options)));
  put(
    'services.json',
    json(
      [planA, planB].map((plan, index) => ({
        id: clientId * 10 + index,
        clientId,
        status: 1,
        name: `Plan sintético ${plan}`,
        servicePlanId: plan,
        servicePlanName: `Plan sintético ${plan}`,
        servicePlanPeriodId: 1,
        price: 80,
        individualPrice: null,
        contractId: `C-${clientId}-${index}`,
        invoicingStart: '2022-02-01',
        invoicingPeriodType: 2,
        invoicingPeriodStartDay: options.cycleDay ?? 5,
        downloadSpeed: 100,
        uploadSpeed: 50,
        suspensionPeriods: [{ id: 1, startDate: '2023-05-01', endDate: '2023-05-10' }],
      })),
    ),
  );
  const invoices = [1, 2, 3].map((n) => ({
    id: clientId * 100 + n,
    clientId,
    number: `SINT-2023-${n}`,
    createdDate: `2023-0${n}-01T00:00:00-0500`,
    dueDate: `2023-0${n}-15T00:00:00-0500`,
    total: 80,
    amountPaid: n === 3 ? 0 : 80,
    amountToPay: n === 3 ? 80 : 0,
    status: n === 3 ? 1 : 3,
    items: [
      { id: n, type: 'service', label: 'Servicio sintético', price: 80, quantity: 1, total: 80 },
    ],
    paymentCovers:
      n === 3
        ? []
        : [{ id: n, paymentId: clientId * 1000 + n, invoiceId: clientId * 100 + n, amount: 80 }],
  }));
  put('invoices.json', json(invoices));
  put(`invoices/${clientId * 100 + 1}.pdf`, Buffer.from('%PDF-1.4\n% sintético 1\n'));
  put(`invoices/${clientId * 100 + 2}.pdf`, Buffer.from('%PDF-1.4\n% sintético 2\n'));
  put(
    'payments.json',
    json(
      [1, 2].map((n) => ({
        id: clientId * 1000 + n,
        clientId,
        methodId: options.methodId ?? SYNTHETIC_METHOD_ID,
        createdDate: `2023-0${n}-10T00:00:00-0500`,
        amount: 80,
        currencyCode: 'COP',
        note: null,
        paymentCovers: [{ invoiceId: clientId * 100 + n, amount: 80 }],
        ...(options.paymentUserIds ? { userId: options.paymentUserIds[n - 1] ?? null } : {}),
      })),
    ),
  );
  put(
    'tickets.json',
    json([
      {
        id: clientId * 10_000 + 1,
        clientId,
        subject: 'Ticket sintético con tareas',
        status: 2,
        public: true,
        createdAt: '2023-03-01T00:00:00-0500',
        assignedJobIds: [71, 72, 73],
        ...(options.ticketAssignedUserId !== undefined
          ? { assignedUserId: options.ticketAssignedUserId }
          : {}),
        activity: options.ticketActivity ?? [
          { id: 1, public: false, comment: { body: 'Comentario sintético' } },
        ],
      },
      {
        id: clientId * 10_000 + 2,
        clientId,
        subject: 'Ticket sintético sin tareas',
        status: 3,
        public: false,
        createdAt: '2023-04-01T00:00:00-0500',
        assignedJobIds: [],
        activity: [],
      },
    ]),
  );
  put(`tickets/${clientId * 10_000 + 1}/adjunto.txt`, 'adjunto sintético');
  for (const [name, content] of Object.entries(options.ticketFiles ?? {})) {
    put(`tickets/${syntheticFirstTicketId(clientId)}/${name}`, content);
  }
  put('documents/contrato-firmado.pdf', Buffer.from('%PDF-1.4\n% documento sintético\n'));
  put('documents/foto-fachada.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
  put('quotes.json', '[]');
  put('refunds.json', '[]');
  put('payment_plans.json', '[]');
  put('jobs.json', '[]');
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
