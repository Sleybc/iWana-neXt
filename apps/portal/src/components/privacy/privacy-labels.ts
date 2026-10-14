import {
  addColombiaBusinessDays,
  isColombiaBusinessDay,
  type DataPurpose,
  type LegalTextType,
  type PrivacyMark,
  type RequestKind,
  type RequestLegalBasis,
  type RequestRight,
  type RequestStatus,
  type RequesterKind,
  type ResponseChannel,
  type RequestSummary,
  DocumentTypeParty,
} from '@iwana/shared';

export const PRIVACY_REQUEST_KINDS: ReadonlyArray<{ value: RequestKind; label: string }> = [
  { value: 'CONSULTA', label: 'Consulta' },
  { value: 'RECLAMO', label: 'Reclamo' },
  { value: 'SUPLANTACION', label: 'Reporte de suplantación' },
];

export const PRIVACY_REQUEST_RIGHTS: ReadonlyArray<{ value: RequestRight; label: string }> = [
  { value: 'CONOCER', label: 'Conocer los datos' },
  { value: 'ACTUALIZAR', label: 'Actualizar los datos' },
  { value: 'RECTIFICAR', label: 'Corregir los datos' },
  { value: 'SUPRIMIR', label: 'Eliminar los datos' },
  { value: 'REVOCAR', label: 'Retirar una autorización' },
  { value: 'PRUEBA_AUTORIZACION', label: 'Solicitar copia de una autorización' },
  { value: 'INCUMPLIMIENTO', label: 'Reportar un incumplimiento' },
];

export const PRIVACY_REQUEST_STATUSES: ReadonlyArray<{ value: RequestStatus; label: string }> = [
  { value: 'RADICADA', label: 'Recibida' },
  { value: 'INCOMPLETA', label: 'Necesita información' },
  { value: 'DESISTIDA', label: 'Cerrada por falta de respuesta' },
  { value: 'EN_TRAMITE', label: 'En trámite' },
  { value: 'PRORROGADA', label: 'Con plazo ampliado' },
  { value: 'RESUELTA', label: 'Respondida' },
  { value: 'NO_PROCEDENTE', label: 'No procede' },
  { value: 'TRASLADADA', label: 'Trasladada' },
];

export const REQUESTER_KIND_OPTIONS: ReadonlyArray<{ value: RequesterKind; label: string }> = [
  { value: 'TITULAR', label: 'Titular de los datos' },
  { value: 'CAUSAHABIENTE', label: 'Causahabiente' },
  { value: 'REPRESENTANTE', label: 'Representante' },
  { value: 'APODERADO', label: 'Apoderado' },
];

export const RESPONSE_CHANNEL_OPTIONS: ReadonlyArray<{ value: ResponseChannel; label: string }> = [
  { value: 'EMAIL', label: 'Correo electrónico' },
  { value: 'CORREO_FISICO', label: 'Correo físico' },
  { value: 'PRESENCIAL', label: 'Entrega presencial' },
  { value: 'PORTAL_ISP', label: 'Portal de la empresa' },
];

export const IDENTITY_METHOD_OPTIONS = [
  { value: 'DOCUMENTO_PRESENCIAL', label: 'Validación presencial del documento' },
  { value: 'COPIA_DOCUMENTO', label: 'Copia del documento' },
  { value: 'PODER_O_REPRESENTACION', label: 'Poder o documento de representación' },
  { value: 'DECLARACION_CAUSAHABIENTE', label: 'Declaración de causahabiente' },
] as const;

export const LEGAL_BASIS_OPTIONS: ReadonlyArray<{ value: RequestLegalBasis; label: string }> = [
  { value: 'DEBER_LEGAL_CONSERVACION', label: 'Deber legal de conservar la información' },
  { value: 'DEBER_CONTRACTUAL', label: 'Obligación contractual vigente' },
  {
    value: 'SOLICITANTE_NO_LEGITIMADO',
    label: 'La persona solicitante no está autorizada para este trámite',
  },
  { value: 'OTRO', label: 'Otro motivo (requiere explicación)' },
];

export const DATA_PURPOSE_LABELS: Record<DataPurpose, string> = {
  TRATAMIENTO_CONTRACTUAL: 'Prestación del servicio, facturación y soporte',
  CONTACTO_COMERCIAL: 'Ofertas y novedades',
  REPORTE_CENTRALES_RIESGO: 'Reporte a centrales de riesgo',
  DATOS_BIOMETRICOS: 'Datos biométricos',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentTypeParty, string> = {
  [DocumentTypeParty.CC]: 'Cédula de ciudadanía',
  [DocumentTypeParty.CE]: 'Cédula de extranjería',
  [DocumentTypeParty.NIT]: 'NIT',
  [DocumentTypeParty.PASAPORTE]: 'Pasaporte',
  [DocumentTypeParty.TI]: 'Tarjeta de identidad',
  [DocumentTypeParty.RUT]: 'RUT',
  [DocumentTypeParty.OTHER]: 'Otro documento',
};

export const RESPONSE_CHANNEL_LABELS: Record<ResponseChannel, string> = {
  EMAIL: 'Correo electrónico',
  CORREO_FISICO: 'Correo físico',
  PRESENCIAL: 'Entrega presencial',
  PORTAL_ISP: 'Portal de la empresa',
};

export function getPurposeLabel(purpose: DataPurpose | null | undefined): string {
  return purpose ? DATA_PURPOSE_LABELS[purpose] : '—';
}

export const MARK_LABELS: Record<PrivacyMark, string> = {
  RECLAMO_EN_TRAMITE: 'Reclamo en trámite',
  VICTIMA_FALSEDAD_PERSONAL: 'Reporte de suplantación activo',
  DATOS_BLOQUEADOS: 'Datos restringidos por conservación',
};

export const LEGAL_TEXT_TYPE_LABELS: Record<LegalTextType, string> = {
  POLITICA_TRATAMIENTO: 'Política de tratamiento de datos',
  AVISO_PRIVACIDAD: 'Aviso de privacidad',
  AUTORIZACION: 'Autorización para el uso de datos',
};

export function getLabel<T extends string>(
  items: ReadonlyArray<{ value: T; label: string }>,
  value: T | null | undefined,
): string {
  return items.find((item) => item.value === value)?.label ?? 'Otro';
}

export function getTodayInBogota(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatCivilDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(parsed);
}

export function formatLocalDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(parsed);
}

function addCivilDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function businessDaysBetween(start: string, end: string): number {
  if (end <= start) return 0;
  let current = start;
  let count = 0;
  while (current < end && count < 3660) {
    current = addCivilDays(current, 1);
    if (isColombiaBusinessDay(current)) count += 1;
  }
  return count;
}

export function getDueLabel(
  request: Pick<RequestSummary, 'dueAt' | 'extendedUntil' | 'isOverdue' | 'status'>,
  today = getTodayInBogota(),
): { label: string; tone: 'error' | 'warning' | 'neutral' } {
  const isClosed = ['DESISTIDA', 'RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA'].includes(
    request.status,
  );
  if (isClosed)
    return { label: getLabel(PRIVACY_REQUEST_STATUSES, request.status), tone: 'neutral' };
  if (request.isOverdue) return { label: 'Vencida', tone: 'error' };

  const dueDate = request.extendedUntil ?? request.dueAt;
  if (dueDate <= today) return { label: 'Vence hoy', tone: 'warning' };
  const days = businessDaysBetween(today, dueDate);
  if (days <= 2) {
    return {
      label: days === 0 ? 'Vence hoy' : `Vence en ${days} ${days === 1 ? 'día' : 'días'} hábiles`,
      tone: 'warning',
    };
  }
  return { label: 'En plazo', tone: 'neutral' };
}

export function calculateBusinessDeadline(start: string, days: number): string {
  return addColombiaBusinessDays(start, days);
}

export function maskDocument(value: string): string {
  if (value.length < 5) return '••••';
  return `${'•'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}
