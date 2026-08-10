export type ExpedienteListView = 'open' | 'converted' | 'archive' | 'all';

const EXPEDIENTE_LIST_VIEWS = new Set<ExpedienteListView>(['open', 'converted', 'archive', 'all']);

export function getDefaultExpedienteView(): ExpedienteListView {
  return 'open';
}

/** Hidrata pestaña de oportunidades desde la dirección (CA-V2-05 / I-7). */
export function parseExpedienteViewFromSearchParams(
  params: URLSearchParams,
  fallback: ExpedienteListView = getDefaultExpedienteView(),
): ExpedienteListView {
  const raw = params.get('view');
  if (raw && EXPEDIENTE_LIST_VIEWS.has(raw as ExpedienteListView)) {
    return raw as ExpedienteListView;
  }
  return fallback;
}

export function getExpedienteViewLabel(view: ExpedienteListView): string {
  const labels: Record<ExpedienteListView, string> = {
    open: 'Abiertas',
    converted: 'Convertidas',
    archive: 'Archivo',
    all: 'Todo CRM',
  };
  return labels[view];
}

export function getOriginViewFromStatus(status: string): ExpedienteListView {
  const openStatuses = [
    'NUEVO_POTENCIAL',
    'PRECALIFICADO',
    'VALIDANDO_COBERTURA',
    'EN_COTIZACION',
    'LISTO_PARA_INSTALACION',
  ];
  const convertedStatuses = ['INSTALACION_AGENDADA'];
  if (openStatuses.includes(status)) return 'open';
  if (convertedStatuses.includes(status)) return 'converted';
  return 'archive';
}
