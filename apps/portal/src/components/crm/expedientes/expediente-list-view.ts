export type ExpedienteListView = 'open' | 'converted' | 'archive' | 'all';

export function getDefaultExpedienteView(): ExpedienteListView {
  return 'open';
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
