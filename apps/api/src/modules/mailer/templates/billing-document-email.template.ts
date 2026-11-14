/**
 * Correo de Facturación al titular: documento de cobro, recibo de pago o estado de cuenta
 * (spec MOD05↔MOD14 2026-11-13 D5, D9, R4).
 *
 * Lleva la razón social del tenant (emisor) y el PDF adjunto. El cuerpo no repite datos del
 * titular (nombre, documento, dirección, saldo): solo la referencia del documento o el periodo. El
 * `to` lo pone el llamador en memoria.
 *
 * Función pura.
 */
export type BillingDocumentEmailKind = 'FACTURA' | 'RECIBO' | 'ESTADO_CUENTA';

export interface BillingDocumentEmailParams {
  kind: BillingDocumentEmailKind;
  /** Razón social del tenant; si falta, se usa un genérico. */
  legalName: string | null;
  /** Número del documento de cobro o consecutivo del recibo. */
  reference?: string | number | null;
  /** Periodo del estado de cuenta (AAAA-MM-DD); `from` nulo = desde el inicio. */
  periodFrom?: string | null;
  periodTo?: string | null;
}

export interface BillingDocumentEmail {
  subject: string;
  html: string;
  text: string;
  filename: string;
}

const FALLBACK_SENDER = 'Tu proveedor de servicio';
const SUBJECT_MAX = 200;
const LEGAL_NAME_MAX = 120;

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

/** Sin saltos de línea ni caracteres de control (evita inyección de cabeceras en el asunto). */
function singleLine(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function formatCivilDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function safeReference(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const text = singleLine(String(value)).slice(0, 40);
  return text || null;
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'documento';
}

export function billingDocumentEmailTemplate(
  params: BillingDocumentEmailParams,
): BillingDocumentEmail {
  const sender = singleLine(params.legalName ?? '').slice(0, LEGAL_NAME_MAX) || FALLBACK_SENDER;
  const reference = safeReference(params.reference);
  let title: string;
  let sentence: string;
  let filename: string;

  switch (params.kind) {
    case 'FACTURA':
      title = reference ? `Documento de cobro ${reference}` : 'Documento de cobro';
      sentence = reference
        ? `Adjuntamos tu documento de cobro ${reference}.`
        : 'Adjuntamos tu documento de cobro.';
      filename = `documento-de-cobro-${safeFilePart(reference ?? '')}.pdf`;
      break;
    case 'RECIBO':
      title = reference ? `Recibo de pago N.º ${reference}` : 'Recibo de pago';
      sentence = reference
        ? `Adjuntamos el recibo de pago N.º ${reference}.`
        : 'Adjuntamos tu recibo de pago.';
      filename = `recibo-de-pago-${safeFilePart(reference ?? '')}.pdf`;
      break;
    case 'ESTADO_CUENTA': {
      const to = params.periodTo ? formatCivilDate(params.periodTo) : null;
      const from = params.periodFrom ? formatCivilDate(params.periodFrom) : null;
      title = 'Estado de cuenta';
      sentence =
        from && to
          ? `Adjuntamos tu estado de cuenta del ${from} al ${to}.`
          : to
            ? `Adjuntamos tu estado de cuenta con los movimientos hasta el ${to}.`
            : 'Adjuntamos tu estado de cuenta.';
      filename = `estado-de-cuenta-${safeFilePart(params.periodTo ?? '')}.pdf`;
      break;
    }
  }

  const closing =
    'Si tienes preguntas sobre tu servicio o tus pagos, comunícate con tu proveedor. Este es un mensaje automático.';
  const subject = `${title} · ${sender}`.slice(0, SUBJECT_MAX);
  return {
    subject,
    html: `<p>${escapeHtml(sentence)}</p>
<p>${escapeHtml(closing)}</p>
<p>${escapeHtml(sender)}</p>`,
    text: `${sentence}\n\n${closing}\n\n${sender}`,
    filename,
  };
}
