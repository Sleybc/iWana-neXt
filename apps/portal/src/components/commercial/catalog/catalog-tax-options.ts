import { NetworkType, VatConcept } from '@iwana/shared';

export const VAT_CONCEPT_OPTIONS = [
  { value: VatConcept.INTERNET_ACCESS, label: 'Acceso a internet' },
  {
    value: VatConcept.ACTIVATION_INHERENT,
    label: 'Instalación, conexión o activación del servicio',
  },
  { value: VatConcept.EQUIPMENT_SALE, label: 'Venta de equipo' },
  { value: VatConcept.EQUIPMENT_LEASE, label: 'Alquiler de equipo' },
  {
    value: VatConcept.INDEPENDENT_SERVICE,
    label: 'Servicio independiente (mantenimiento, soporte o IP fija)',
  },
  { value: VatConcept.TELEVISION, label: 'Televisión' },
  { value: VatConcept.TELEPHONY, label: 'Telefonía' },
] as const;

export const NETWORK_TYPE_OPTIONS = [
  { value: NetworkType.FIXED, label: 'Fija' },
  { value: NetworkType.MOBILE, label: 'Móvil' },
] as const;

export function vatConceptNotice(value: VatConcept | ''): string | null {
  if (
    value === VatConcept.EQUIPMENT_LEASE ||
    value === VatConcept.INDEPENDENT_SERVICE ||
    value === VatConcept.TELEVISION
  ) {
    return 'Este concepto requiere revisión del contador.';
  }
  if (value === VatConcept.TELEPHONY) {
    return 'El IVA de telefonía se determina con sus reglas propias.';
  }
  return null;
}
