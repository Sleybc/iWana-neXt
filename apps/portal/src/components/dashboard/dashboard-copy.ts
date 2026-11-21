/** Textos del pulso y de la cola del inicio, entregados como `labels` a `@iwana/ui` (contrato DS v1.3 §7bis.5). */
import type { AttentionQueueProps, PulseStripProps } from '@iwana/ui';

export const DASHBOARD_PULSE_ARIA_LABEL = 'Indicadores núcleo';

export const DASHBOARD_PULSE_LABELS: PulseStripProps['labels'] = {
  unavailable: 'No disponible',
  noData: 'Sin dato disponible',
  retry: 'Reintentar',
  updating: 'Actualizando',
};

export const DASHBOARD_ATTENTION_COPY = {
  title: 'Requiere tu atención',
  description: 'Lo más urgente primero, de todas las áreas',
} as const;

export const DASHBOARD_ATTENTION_LABELS: AttentionQueueProps['labels'] = {
  severity: { 'at-risk': 'En riesgo', attention: 'Atención' },
  partial: 'No pudimos revisar todas las áreas.',
  retry: 'Reintentar',
  allClear: 'Todo al día',
  allClearHint: 'No hay pendientes que requieran tu decisión ahora.',
  showMore: (hidden) => (hidden === 1 ? 'Ver el restante' : `Ver los ${hidden} restantes`),
  showLess: 'Ver menos',
};
