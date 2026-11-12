import type { ContractDocumentSnapshot } from '@iwana/shared';

/**
 * Relleno de la plantilla HTML del contrato (ADR-109 D5). Contrato con el bloque A:
 * - `{{ clave }}`: texto escapado (HTML). Claves en {@link buildContractTemplateValues}.
 * - `{{{ bloque }}}`: fragmento HTML construido aquí con valores ya escapados
 *   (`equipmentRows`, `customerServiceChannels`, `permanenceRows`, `installationChargeRows`,
 *   `additionalServiceRows`).
 * - `<!--IF:permanence-->…<!--ENDIF:permanence-->`: se conserva solo si el cliente aceptó
 *   la permanencia. Igual con `otherConditions`.
 * Una clave desconocida o una sección sin cerrar hace fallar el render (cerrado por defecto).
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/gu, (char) => HTML_ESCAPES[char] ?? char);
}

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  return COP.format(value).replace(/ /gu, ' ');
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;
}

function formatCivilDate(value: string | null): string {
  if (!value) return 'Desde la activación del servicio';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function text(value: string | number | null | undefined, fallback = 'No aplica'): string {
  if (value === null || value === undefined) return fallback;
  const rendered = String(value).trim();
  return rendered.length > 0 ? rendered : fallback;
}

const CHANNEL_LABELS: Record<string, string> = {
  PHONE: 'Teléfono',
  EMAIL: 'Correo electrónico',
  WEB: 'Sitio web',
  OFFICE: 'Oficina',
  OTHER: 'Otro',
};

type ItemVat = { vatTreatment: string; vatRatePercent: number; vatLegalBasis: string };

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** «ET_476_7» → «ET 476 7»: el código de base legal congelado, legible. */
function legalBasisLabel(code: string): string {
  return code.replace(/_/gu, ' ');
}

/** Etiqueta del IVA de un concepto según el tratamiento congelado (spec MOD14 2026-11-12). */
function itemVatLabel(vat: ItemVat): string {
  const basis = legalBasisLabel(vat.vatLegalBasis);
  if (vat.vatTreatment === 'EXEMPT') return `Exento (0 %) · ${basis}`;
  if (vat.vatTreatment === 'EXCLUDED') return `Excluido · ${basis}`;
  return formatPercent(vat.vatRatePercent);
}

function vatAmountOf(base: number, vat: ItemVat): number {
  return vat.vatTreatment === 'STANDARD' ? round2((base * vat.vatRatePercent) / 100) : 0;
}

const VALUE_CELL = '<td class="val">';
const LABEL_CELL = '<td style="text-align:right">';

/**
 * Filas del cargo de instalación en «Valor de los servicios contratados»: base, IVA y total
 * según el tratamiento congelado. Sin cargo, una fila «Sin cargo»; sin IVA congelado (contrato
 * previo a MOD14), solo el valor congelado, como antes.
 */
function installationChargeRows(snapshot: ContractDocumentSnapshot): string {
  const { installationFee, installationVat } = snapshot.service;
  const title = 'CARGO DE INSTALACIÓN<br>(ÚNICO, PRIMER COBRO)';
  if (installationFee == null || installationFee === 0) {
    return `<tr>${LABEL_CELL}${title}</td>${VALUE_CELL}Sin cargo</td></tr>`;
  }
  if (!installationVat) {
    return `<tr>${LABEL_CELL}${title}</td>${VALUE_CELL}${escapeHtml(formatMoney(installationFee))}</td></tr>`;
  }
  const vatAmount = vatAmountOf(installationFee, installationVat);
  const vatCell =
    installationVat.vatTreatment === 'STANDARD'
      ? formatMoney(vatAmount)
      : itemVatLabel(installationVat);
  const vatTitle =
    installationVat.vatTreatment === 'STANDARD'
      ? `IVA INSTALACIÓN (${itemVatLabel(installationVat)})`
      : 'IVA INSTALACIÓN';
  return (
    `<tr>${LABEL_CELL}${title}</td>${VALUE_CELL}${escapeHtml(formatMoney(installationFee))}</td></tr>` +
    `<tr>${LABEL_CELL}${escapeHtml(vatTitle)}</td>${VALUE_CELL}${escapeHtml(vatCell)}</td></tr>` +
    `<tr>${LABEL_CELL}TOTAL INSTALACIÓN</td>${VALUE_CELL}` +
    `${escapeHtml(formatMoney(round2(installationFee + vatAmount)))}</td></tr>`
  );
}

/** Filas de «Servicios adicionales»: nombre, precio, IVA y total congelados de cada uno. */
function additionalServiceRows(snapshot: ContractDocumentSnapshot): string {
  const additionals = snapshot.service.additionals ?? [];
  if (additionals.length === 0) return '<tr><td class="light">No contratado</td></tr>';
  return additionals
    .map((item) => {
      const name = escapeHtml(text(item.name, 'Adicional'));
      if (item.unitPrice === null) return `<tr><td>${name} · Sin cobro</td></tr>`;
      const vatAmount = vatAmountOf(item.unitPrice, item);
      const vat =
        item.vatTreatment === 'STANDARD'
          ? `IVA ${itemVatLabel(item)} ${formatMoney(vatAmount)}`
          : `IVA ${itemVatLabel(item)}`;
      return (
        `<tr><td>${name} · Precio ${escapeHtml(formatMoney(item.unitPrice))} · ` +
        `${escapeHtml(vat)} · Total ${escapeHtml(formatMoney(round2(item.unitPrice + vatAmount)))}</td></tr>`
      );
    })
    .join('');
}

/** Valores de texto (aún sin escapar) disponibles como `{{ clave }}`. */
export function buildContractTemplateValues(
  snapshot: ContractDocumentSnapshot,
): Record<string, string> {
  const { operator, holder, service, installation, permanence } = snapshot;
  return {
    'contract.id': snapshot.contractId,
    'contract.generatedAt': formatCivilDate(snapshot.capturedAt),
    'template.version': snapshot.template.version,
    'operator.legalName': operator.legalName,
    'operator.nit': operator.nit,
    'operator.qualityAndCoverageUrl': operator.qualityAndCoverageUrl,
    'operator.reconnectionFee': formatMoney(operator.reconnectionFee),
    'operator.annualIncreaseCapPercent': formatPercent(operator.annualIncreaseCapPercent),
    'operator.equipmentIncidentReportChannel': operator.equipmentIncidentReportChannel,
    'operator.otherConditions': text(operator.otherConditions, ''),
    'holder.fullName': text(holder.fullName),
    'holder.documentType': text(holder.documentType),
    'holder.documentNumber': text(holder.documentNumber),
    'holder.email': text(holder.email),
    'holder.phone': text(holder.phone),
    'service.planName': service.planName,
    'service.technology': text(service.technology),
    'service.downloadMbps': text(service.downloadMbps),
    'service.uploadMbps': text(service.uploadMbps),
    'service.monthlyPrice': formatMoney(service.monthlyPrice),
    'service.vatRatePercent':
      service.vatRatePercent === null ? 'No aplica' : formatPercent(service.vatRatePercent),
    'service.vatAmount': service.vatAmount === null ? 'No aplica' : formatMoney(service.vatAmount),
    'service.monthlyTotal': formatMoney(service.monthlyTotal),
    'service.stratum': text(service.stratum),
    'service.installationFee':
      // Null (instantánea previa a la fase 2) o 0: no hay cargo que cobrar.
      service.installationFee == null || service.installationFee === 0
        ? 'Sin cargo'
        : formatMoney(service.installationFee),
    'installation.address': text(installation.address),
    'installation.city': text(installation.city),
    'installation.department': text(installation.department),
    'permanence.months': permanence ? String(permanence.months) : '',
    'permanence.connectionFee': permanence ? formatMoney(permanence.connectionFee) : '',
    'permanence.discountedOrDeferredAmount': permanence
      ? formatMoney(permanence.discountedOrDeferredAmount)
      : '',
    'permanence.startDate': permanence ? formatCivilDate(permanence.startDate) : '',
    'permanence.endDate': permanence
      ? permanence.endDate
        ? formatCivilDate(permanence.endDate)
        : `${permanence.months} meses después de la activación`
      : '',
  };
}

/** Fragmentos HTML disponibles como `{{{ bloque }}}`; todo valor dinámico va escapado. */
export function buildContractTemplateBlocks(
  snapshot: ContractDocumentSnapshot,
): Record<string, string> {
  const equipmentRows =
    snapshot.equipment.length === 0
      ? '<tr><td colspan="3">Sin equipos entregados</td></tr>'
      : snapshot.equipment
          .map(
            (item) =>
              `<tr><td>${escapeHtml(text(item.model))}</td>` +
              `<td>${escapeHtml(item.serialNumber)}</td>` +
              `<td>${escapeHtml(text(item.macAddress))}</td></tr>`,
          )
          .join('');
  const customerServiceChannels = snapshot.operator.customerServiceChannels
    .map(
      (channel) =>
        `<li>${escapeHtml(channel.label ?? CHANNEL_LABELS[channel.kind] ?? channel.kind)}: ` +
        `${escapeHtml(channel.value)}</li>`,
    )
    .join('');
  const permanenceRows = (snapshot.permanence?.schedule ?? [])
    .map(
      (row) =>
        `<tr><td>${escapeHtml(String(row.month))}</td>` +
        `<td>${escapeHtml(formatMoney(row.amount))}</td></tr>`,
    )
    .join('');
  return {
    equipmentRows,
    customerServiceChannels,
    permanenceRows,
    installationChargeRows: installationChargeRows(snapshot),
    additionalServiceRows: additionalServiceRows(snapshot),
  };
}

const SECTION_PATTERN = /<!--IF:([A-Za-z]+)-->([\s\S]*?)<!--ENDIF:\1-->/gu;
const RAW_PATTERN = /\{\{\{\s*([A-Za-z.]+)\s*\}\}\}/gu;
const TEXT_PATTERN = /\{\{\s*([A-Za-z.]+)\s*\}\}/gu;

export function fillContractTemplate(template: string, snapshot: ContractDocumentSnapshot): string {
  const sections: Record<string, boolean> = {
    permanence: snapshot.permanence !== null,
    otherConditions: Boolean(snapshot.operator.otherConditions?.trim()),
  };
  const values = buildContractTemplateValues(snapshot);
  const blocks = buildContractTemplateBlocks(snapshot);

  let html = template.replace(SECTION_PATTERN, (_match, name: string, body: string) => {
    if (!(name in sections)) throw new Error(`Sección de plantilla desconocida: ${name}`);
    return sections[name] ? body : '';
  });
  if (/<!--(?:IF|ENDIF):/u.test(html)) throw new Error('Sección de plantilla sin cerrar.');

  html = html.replace(RAW_PATTERN, (_match, key: string) => {
    const block = blocks[key];
    if (block === undefined) throw new Error(`Bloque de plantilla desconocido: ${key}`);
    return block;
  });
  html = html.replace(TEXT_PATTERN, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Campo de plantilla desconocido: ${key}`);
    return escapeHtml(value);
  });
  return html;
}

const SIGNATURE_SLOT_PATTERN = /(<div\b[^>]*\bdata-signature-slot="[a-z]+"[^>]*>)\s*(<\/div>)/gu;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** true si el buffer empieza con la firma de un PNG. */
export function isPngBuffer(buffer: Buffer): boolean {
  return buffer.length > PNG_SIGNATURE.length && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

/**
 * Incrusta la imagen de la firma en cada hueco `data-signature-slot` del HTML ya rellenado
 * (bloque D; ADR-109 D1). La imagen va como `data:` (el renderer solo permite `data:`).
 * Exige al menos un hueco: una plantilla sin huecos no produce un contrato firmado.
 */
export function embedSignature(html: string, png: Buffer): string {
  if (!isPngBuffer(png)) throw new Error('La firma no es un PNG.');
  const source = `data:image/png;base64,${png.toString('base64')}`;
  let slots = 0;
  const signed = html.replace(SIGNATURE_SLOT_PATTERN, (_match, open: string, close: string) => {
    slots += 1;
    return (
      `${open}<img src="${source}" alt="Firma del suscriptor" ` +
      `style="max-height:70px;max-width:100%;object-fit:contain">${close}`
    );
  });
  if (slots === 0) throw new Error('La plantilla no tiene huecos de firma.');
  return signed;
}
