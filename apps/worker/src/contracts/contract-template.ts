import type { ContractDocumentSnapshot } from '@iwana/shared';

/**
 * Relleno de la plantilla HTML del contrato (ADR-109 D5). Contrato con el bloque A:
 * - `{{ clave }}`: texto escapado (HTML). Claves en {@link buildContractTemplateValues}.
 * - `{{{ bloque }}}`: fragmento HTML construido aquí con valores ya escapados
 *   (`equipmentRows`, `customerServiceChannels`, `permanenceRows`).
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
  return { equipmentRows, customerServiceChannels, permanenceRows };
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
