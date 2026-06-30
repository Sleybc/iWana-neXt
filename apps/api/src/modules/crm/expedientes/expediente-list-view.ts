import { ExpedienteStatus } from '@iwana/shared';

export type ExpedienteListView = 'open' | 'converted' | 'archive' | 'all';

const VALID_VIEWS = new Set<ExpedienteListView>(['open', 'converted', 'archive', 'all']);

/** Convierte el string del query param a un valor tipado de vista; ignora valores inválidos. */
export function parseExpedienteListView(raw?: string): ExpedienteListView | undefined {
  if (!raw) return undefined;
  return VALID_VIEWS.has(raw as ExpedienteListView) ? (raw as ExpedienteListView) : undefined;
}

/**
 * Resuelve los estados permitidos para cada vista semántica del listado.
 * Retorna null para 'all' (sin partición de estado).
 */
export function resolveExpedienteStatusesForView(
  view: ExpedienteListView,
): ExpedienteStatus[] | null {
  switch (view) {
    case 'open':
      return [
        ExpedienteStatus.NUEVO_POTENCIAL,
        ExpedienteStatus.PRECALIFICADO,
        ExpedienteStatus.VALIDANDO_COBERTURA,
        ExpedienteStatus.EN_COTIZACION,
        ExpedienteStatus.LISTO_PARA_INSTALACION,
      ];
    case 'converted':
      return [ExpedienteStatus.INSTALACION_AGENDADA];
    case 'archive':
      return [ExpedienteStatus.CLIENTE_ACTIVO, ExpedienteStatus.DESCARTADO];
    case 'all':
      return null;
  }
}
