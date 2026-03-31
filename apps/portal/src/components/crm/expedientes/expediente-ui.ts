import type { ExpedienteStatus } from '@/lib/api-client';

export type StatusBadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'primary'
  | 'lime';

export const EXPEDIENTE_STATUS_META: Record<
  ExpedienteStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  NUEVO_POTENCIAL: { label: 'Nuevo', variant: 'info' },
  CONTACTADO: { label: 'Contactado', variant: 'primary' },
  PENDIENTE_DATOS: { label: 'Pendiente datos', variant: 'warning' },
  PRECALIFICADO: { label: 'Precalificado', variant: 'primary' },
  VALIDANDO_COBERTURA: { label: 'Validando cobertura', variant: 'primary' },
  VIABLE_COMERCIALMENTE: { label: 'Viable', variant: 'lime' },
  EN_COTIZACION: { label: 'En cotización', variant: 'info' },
  PENDIENTE_DECISION: { label: 'Pendiente decisión', variant: 'warning' },
  LISTO_PARA_INSTALACION: { label: 'Listo instalación', variant: 'lime' },
  INSTALACION_AGENDADA: { label: 'Instalación agendada', variant: 'success' },
  CLIENTE_ACTIVO: { label: 'Activo', variant: 'success' },
  DESCARTADO: { label: 'Descartado', variant: 'neutral' },
};

export function getStatusBadgeVariant(status: string): StatusBadgeVariant {
  return EXPEDIENTE_STATUS_META[status as ExpedienteStatus]?.variant ?? 'neutral';
}

export function formatExpedienteStatus(status: string): string {
  return EXPEDIENTE_STATUS_META[status as ExpedienteStatus]?.label ?? status.replace(/_/g, ' ');
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
