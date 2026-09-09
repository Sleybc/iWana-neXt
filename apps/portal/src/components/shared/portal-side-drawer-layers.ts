const openDrawerLayers: number[] = [];

export function registerPortalSideDrawerLayer(layerId: number): void {
  if (!openDrawerLayers.includes(layerId)) {
    openDrawerLayers.push(layerId);
  }
}

export function unregisterPortalSideDrawerLayer(layerId: number): void {
  const index = openDrawerLayers.lastIndexOf(layerId);
  if (index >= 0) {
    openDrawerLayers.splice(index, 1);
  }
}

export function isTopMostPortalSideDrawerLayer(layerId: number): boolean {
  return openDrawerLayers[openDrawerLayers.length - 1] === layerId;
}

/**
 * Difusión del estado de los drawers modales hacia el chrome del portal
 * (Sidebar y TopHeader en `dashboard/layout.tsx`, subnav del módulo). El chrome
 * se vuelve inerte mientras haya al menos un drawer abierto y el sidebar mobile
 * se cierra. Sin stores globales ni contextos transversales: un CustomEvent basta.
 *
 * El estado es un REGISTRO POR DUEÑO, no un booleano: con drawers anidados, el
 * cierre del interior no puede devolverle la interactividad al chrome mientras
 * el exterior sigue abierto — el foco escaparía a un chrome atenuado bajo el
 * velo. Misma razón por la que `openDrawerLayers` (arriba) es una pila.
 */
export const PORTAL_MODAL_DRAWER_STATE_EVENT = 'portal:modal-drawer-state';

export interface PortalModalDrawerStateDetail {
  open: boolean;
}

const openModalDrawerOwners = new Set<string>();

export function isPortalModalDrawerOpen(): boolean {
  return openModalDrawerOwners.size > 0;
}

/**
 * Registra (o da de baja) un drawer modal por su identidad estable y difunde el
 * estado agregado. Solo se emite el evento en las transiciones reales
 * ninguno↔alguno: un segundo drawer abriéndose no vuelve a notificar.
 */
export function setPortalModalDrawerState(ownerId: string, open: boolean): void {
  const wasOpen = isPortalModalDrawerOpen();

  if (open) {
    openModalDrawerOwners.add(ownerId);
  } else {
    openModalDrawerOwners.delete(ownerId);
  }

  const isOpen = isPortalModalDrawerOpen();
  if (wasOpen === isOpen || typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<PortalModalDrawerStateDetail>(PORTAL_MODAL_DRAWER_STATE_EVENT, {
      detail: { open: isOpen },
    }),
  );
}
