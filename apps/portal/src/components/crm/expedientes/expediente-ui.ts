import type { ExpedienteStatus } from '@/lib/api-client';
import { portalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';

export type StatusBadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'primary'
  | 'lime';

/**
 * Mapeo de estados legacy (eliminados en ADR-026) a sus equivalentes consolidados.
 * CONTACTADO → PRECALIFICADO
 * PENDIENTE_DATOS → PRECALIFICADO
 * VIABLE_COMERCIALMENTE → VALIDANDO_COBERTURA
 * PENDIENTE_DECISION → EN_COTIZACION
 */
const LEGACY_STATUS_MAP: Record<string, ExpedienteStatus> = {
  CONTACTADO: 'PRECALIFICADO',
  PENDIENTE_DATOS: 'PRECALIFICADO',
  VIABLE_COMERCIALMENTE: 'VALIDANDO_COBERTURA',
  PENDIENTE_DECISION: 'EN_COTIZACION',
};

export const EXPEDIENTE_STATUS_META: Record<
  ExpedienteStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  NUEVO_POTENCIAL: { label: 'Nuevo', variant: 'info' },
  PRECALIFICADO: { label: 'Precalificado', variant: 'primary' },
  VALIDANDO_COBERTURA: { label: 'Validando cobertura', variant: 'primary' },
  EN_COTIZACION: { label: 'En cotización', variant: 'info' },
  LISTO_PARA_INSTALACION: { label: 'Listo para instalación', variant: 'lime' },
  INSTALACION_AGENDADA: { label: 'Instalación agendada', variant: 'success' },
  CLIENTE_ACTIVO: { label: 'Activo', variant: portalActiveBadgeVariant },
  DESCARTADO: { label: 'Descartado', variant: 'neutral' },
};

/**
 * Normaliza un estado (incluyendo legacy) a su equivalente consolidado.
 * Si el estado no existe en el mapa actual ni en el mapa legacy,
 * lo retorna tal cual para que el fallback lo maneje.
 */
function normalizeStatus(status: string): string {
  return LEGACY_STATUS_MAP[status] ?? status;
}

export function getStatusBadgeVariant(status: string): StatusBadgeVariant {
  const normalized = normalizeStatus(status);
  return EXPEDIENTE_STATUS_META[normalized as ExpedienteStatus]?.variant ?? 'neutral';
}

export function formatExpedienteStatus(status: string): string {
  const normalized = normalizeStatus(status);
  return EXPEDIENTE_STATUS_META[normalized as ExpedienteStatus]?.label ?? status.replace(/_/g, ' ');
}

/**
 * Obtiene los metadatos de estado de forma segura, normalizando estados legacy.
 * Retorna siempre un objeto válido con label y variant.
 */
export function getStatusMeta(status: string): { label: string; variant: StatusBadgeVariant } {
  const normalized = normalizeStatus(status);
  return (
    EXPEDIENTE_STATUS_META[normalized as ExpedienteStatus] ?? {
      label: status.replace(/_/g, ' '),
      variant: 'neutral' as StatusBadgeVariant,
    }
  );
}

export function formatCrmDate(value: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function formatCrmDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export const ACQUISITION_CHANNEL_OPTIONS = [
  { value: 'OFICINA', label: 'Visita a oficina' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'LLAMADA_ENTRANTE', label: 'Llamada entrante' },
  { value: 'LLAMADA_SALIENTE', label: 'Llamada saliente' },
  { value: 'REDES_SOCIALES', label: 'Redes sociales' },
  { value: 'REFERIDO_CLIENTE', label: 'Referido por cliente' },
  { value: 'REFERIDO_VENDEDOR', label: 'Referido por vendedor' },
  { value: 'REFERIDO_TECNICO', label: 'Referido por técnico' },
  { value: 'PUERTA_A_PUERTA', label: 'Puerta a puerta' },
  { value: 'EVENTO', label: 'Evento / feria' },
  { value: 'WEB', label: 'Formulario web' },
  { value: 'OTRO', label: 'Otro' },
] as const;

export function formatAcquisitionChannel(value: string | null | undefined): string {
  if (!value) {
    return 'Sin canal';
  }

  return ACQUISITION_CHANNEL_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function getContactResultBadgeVariant(result: string): StatusBadgeVariant {
  const successResults = ['EXITOSO', 'SUCCESSFUL'];
  const warningResults = [
    'NO_CONTESTA',
    'NO_ANSWER',
    'BUZON',
    'VOICEMAIL',
    'OCUPADO',
    'BUSY',
    'REPROGRAMADO',
    'RESCHEDULED',
  ];
  const errorResults = ['NUMERO_INVALIDO', 'INVALID_NUMBER', 'RECHAZADO', 'REJECTED'];

  const normalized = result.toUpperCase();
  if (successResults.includes(normalized)) return 'success';
  if (warningResults.includes(normalized)) return 'warning';
  if (errorResults.includes(normalized)) return 'error';
  return 'neutral';
}

export function getContactChannelBadgeVariant(channel: string): StatusBadgeVariant {
  const primaryChannels = ['TELEFONO', 'PHONE', 'WHATSAPP', 'EMAIL', 'PRESENCIAL', 'IN_PERSON'];
  const normalized = channel.toUpperCase();
  return primaryChannels.includes(normalized) ? 'primary' : 'neutral';
}

export type ExpedienteTimelineKind =
  | 'contact'
  | 'responsibility'
  | 'attribution'
  | 'pipeline'
  | 'system';

export function getExpedienteTimelineKindMeta(kind: ExpedienteTimelineKind): {
  label: string;
  accentClassName: string;
} {
  switch (kind) {
    case 'contact':
      return {
        label: 'Intento de contacto',
        accentClassName: 'border-l-iwana-primary',
      };
    case 'responsibility':
      return {
        label: 'Cambio de responsable',
        accentClassName: 'border-l-iwana-secondary-700',
      };
    case 'attribution':
      return {
        label: 'Atribución comercial',
        accentClassName: 'border-l-amber-500',
      };
    case 'pipeline':
      return {
        label: 'Cambio de estado',
        accentClassName: 'border-l-iwana-primary',
      };
    case 'system':
    default:
      return {
        label: 'Actividad del sistema',
        accentClassName: 'border-l-gray-300 dark:border-l-gray-600',
      };
  }
}

export const PERSON_TYPE_OPTIONS = [
  { value: 'PERSONA_NATURAL', label: 'Persona natural' },
  { value: 'PERSONA_JURIDICA', label: 'Persona jurídica' },
] as const;

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'NIT', label: 'NIT' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'PEP', label: 'PEP' },
  { value: 'PPT', label: 'PPT' },
  { value: 'OTRO', label: 'Otro' },
] as const;

export function formatPersonType(value: string): string {
  return PERSON_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function formatDocumentType(value: string): string {
  return DOCUMENT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const TECHNICAL_VIABILITY_RESULT_OPTIONS = [
  { value: 'VIABLE', label: 'Viable' },
  { value: 'VALIDATION_REQUIRED', label: 'Validación técnica requerida' },
  { value: 'NOT_VIABLE', label: 'No viable' },
] as const;

export const TECHNOLOGY_OPTION_OPTIONS = [
  { value: 'FIBER', label: 'Fibra óptica' },
  { value: 'RADIO', label: 'Radio enlace' },
  { value: 'SATELLITE', label: 'Satelital' },
  { value: 'NETWORK_EXPANSION', label: 'Requiere expansión de red' },
  { value: 'COVERAGE_REINFORCEMENT', label: 'Refuerzo de cobertura' },
] as const;

export const TECHNICAL_CONFIDENCE_OPTIONS = [
  { value: 'HIGH', label: 'Alta' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'LOW', label: 'Baja' },
] as const;

export const EVALUATION_SOURCE_OPTIONS = [
  { value: 'MAP', label: 'Mapa' },
  { value: 'COMMERCIAL_REFERENCE', label: 'Referencia comercial' },
  { value: 'CUSTOMER_CALL', label: 'Llamada con cliente' },
  { value: 'TECHNICAL_SITE_VISIT', label: 'Visita técnica' },
] as const;

export const DEPARTAMENTOS = [
  {
    value: 'CUNDINAMARCA',
    label: 'Cundinamarca',
    municipios: [
      { value: 'EL_COLEGIO', label: 'El Colegio' },
      { value: 'SAN_ANTONIO_DEL_TEQUENDAMA', label: 'San Antonio del Tequendama' },
      { value: 'LA_MESA', label: 'La Mesa' },
      { value: 'TENA', label: 'Tena' },
      { value: 'ANAPOIMA', label: 'Anapoima' },
      { value: 'VIOTA', label: 'Viotá' },
    ],
  },
] as const;

export type DepartamentoCode = (typeof DEPARTAMENTOS)[number]['value'];
export type MunicipioCode = (typeof DEPARTAMENTOS)[number]['municipios'][number]['value'];

export const DEPARTAMENTO_DEFAULT: DepartamentoCode = 'CUNDINAMARCA';

export function getMunicipiosByDepartamento(departamento: string) {
  const depto = DEPARTAMENTOS.find((d) => d.value === departamento);
  return depto?.municipios ?? [];
}

export function getLabelByValue<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function formatMunicipio(value: string): string {
  for (const depto of DEPARTAMENTOS) {
    const muni = depto.municipios.find((m) => m.value === value);
    if (muni) return muni.label;
  }
  return value;
}

export function formatDepartamento(value: string): string {
  return getLabelByValue(DEPARTAMENTOS, value);
}
