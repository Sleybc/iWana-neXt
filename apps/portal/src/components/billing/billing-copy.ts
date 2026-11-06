import { BILLING_BLOCKED_BUYER_DISPLAY_NAME } from '@iwana/shared';
import type { BillingPeriodPaymentState } from '@iwana/shared';
import type { BadgeProps } from '@iwana/ui';

export const PAYMENT_STATES = {
  PAGADO: { label: 'Pagado', variant: 'success' },
  PARCIAL: { label: 'Pago parcial', variant: 'info' },
  PENDIENTE: { label: 'Pendiente', variant: 'neutral' },
  VENCIDO: { label: 'Vencido', variant: 'warning' },
  SIN_DOCUMENTO: { label: 'Sin documento', variant: 'neutral' },
} satisfies Record<BillingPeriodPaymentState, { label: string; variant: BadgeProps['variant'] }>;

export const DOCUMENT_STATES = {
  BORRADOR: { label: 'Borrador', variant: 'neutral' },
  EMITIDO: { label: 'Emitido', variant: 'info' },
  ANULADO: { label: 'Anulado', variant: 'error' },
} as const;

export const PAYMENT_METHODS = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia bancaria',
  CONSIGNACION: 'Consignación bancaria',
  DATAFONO: 'Datáfono / Tarjeta',
  OTRO: 'Otro medio',
} as const;

export const DOCUMENT_VOID_REASONS = {
  ERROR_DE_VALOR: 'Error en el valor facturado',
  ERROR_DE_ADQUIRENTE: 'Error en los datos del adquirente',
  DUPLICADO: 'Documento duplicado',
  SERVICIO_NO_PRESTADO: 'Servicio no prestado',
  SUPLANTACION: 'Suplantación de identidad (falsedad personal - Ley 2573)',
} as const;

export const PAYMENT_VOID_REASONS = {
  ERROR_DE_REGISTRO: 'Error de captura en el registro',
  PAGO_RECHAZADO: 'Pago rechazado por entidad bancaria',
  DUPLICADO: 'Registro de pago duplicado',
} as const;

export const BLOCKING_REASONS = {
  SIN_PRECIO: 'Falta tarifa vigente en el catálogo comercial',
  SIN_TRATAMIENTO_IVA: 'El punto de servicio no tiene régimen de IVA resoluble',
  SIN_DATOS_FISCALES: 'Datos del suscriptor incompletos para facturar',
} as const;

export const PROTECTED_LABEL = BILLING_BLOCKED_BUYER_DISPLAY_NAME;
export const PROTECTED_NOTICE =
  'Los datos personales del titular se encuentran bajo custodia restringida por solicitud de privacidad. Los movimientos contables y saldos permanecen auditables.';

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' });
export const formatBillingMoney = (value: string | number) => cop.format(Number(value));

export function moneyCents(value: string): number {
  const match = /^(\d{1,12})(?:[.,](\d{1,2}))?$/u.exec(value);
  return match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : NaN;
}

export function fromMoneyCents(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

export function additionalNotice(count: number): string {
  return `Este contrato tiene ${count} adicionales que todavía no se cobran en este documento`;
}
