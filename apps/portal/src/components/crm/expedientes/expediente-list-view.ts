import { Archive, FolderOpen, Wrench, type LucideIcon } from 'lucide-react';

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

export const EXPEDIENTE_TAB_VIEWS = ['open', 'converted', 'archive'] as const;

const EXPEDIENTE_TAB_ICONS: Record<(typeof EXPEDIENTE_TAB_VIEWS)[number], LucideIcon> = {
  open: FolderOpen,
  converted: Wrench,
  archive: Archive,
};

export function getExpedienteViewLabel(view: ExpedienteListView): string {
  const labels: Record<ExpedienteListView, string> = {
    open: 'Abiertas',
    converted: 'En instalación',
    archive: 'Cerradas',
    all: 'Todas las vistas',
  };
  return labels[view];
}

export function getExpedienteViewIcon(view: (typeof EXPEDIENTE_TAB_VIEWS)[number]): LucideIcon {
  return EXPEDIENTE_TAB_ICONS[view];
}

export type ExpedienteEmptyActionKind = 'create' | 'clear-filters' | 'none';

export function getExpedienteEmptyCopy(
  view: ExpedienteListView,
  hasFilters: boolean,
): { title: string; description: string } {
  if (hasFilters || view === 'all') {
    return {
      title: 'No se encontraron resultados',
      description: 'Ajusta la búsqueda o limpia los filtros para ver otras oportunidades.',
    };
  }

  if (view === 'converted') {
    return {
      title: 'Sin oportunidades en instalación',
      description: 'Las que pasen a visita de instalación aparecerán aquí.',
    };
  }

  if (view === 'archive') {
    return {
      title: 'Sin oportunidades cerradas',
      description: 'Las convertidas a cliente o descartadas aparecerán aquí.',
    };
  }

  return {
    title: 'Aún no hay oportunidades abiertas',
    description: 'Registra la primera para iniciar el seguimiento comercial.',
  };
}

/** En instalación y Cerradas no ofrecen alta: el formulario de creación ya está en la página. */
export function getExpedienteEmptyActionKind(
  view: ExpedienteListView,
  hasFilters: boolean,
): ExpedienteEmptyActionKind {
  if (hasFilters || view === 'all') {
    return 'clear-filters';
  }

  if (view === 'open') {
    return 'create';
  }

  return 'none';
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
