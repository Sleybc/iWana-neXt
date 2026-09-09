'use client';

import { useEffect, useId, useState } from 'react';
import {
  PORTAL_MODAL_DRAWER_STATE_EVENT,
  isPortalModalDrawerOpen,
  setPortalModalDrawerState,
  type PortalModalDrawerStateDetail,
} from './portal-side-drawer-layers';

/**
 * Difunde la apertura de un drawer modal hacia el chrome del portal. Cada
 * drawer se registra con su propia identidad (`useId`), de modo que el chrome
 * solo recupera la interactividad cuando se cierra el ÚLTIMO drawer abierto.
 *
 * Lo emite el propio drawer, no su invocador: cablearlo desde fuera obliga a
 * cada pantalla a acordarse de hacerlo y produce un estado con dos fuentes de
 * verdad que discrepan.
 */
export function usePortalModalDrawerBroadcast(open: boolean): void {
  const ownerId = useId();

  useEffect(() => {
    setPortalModalDrawerState(ownerId, open);
    // El desmonte con el drawer abierto también libera el estado: sin esto el
    // chrome quedaría inerte para siempre al navegar fuera de la pantalla.
    return () => setPortalModalDrawerState(ownerId, false);
  }, [ownerId, open]);
}

/**
 * Estado agregado de los drawers modales del portal, para el chrome que debe
 * atenuarse y volverse inerte bajo el velo (subnav del módulo, layout).
 */
export function usePortalModalDrawerOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Sincroniza al montar: un consumidor que aparezca con un drawer ya abierto
    // no vería la transición. Se lee en efecto, no en el estado inicial, para
    // no divergir del render del servidor.
    setOpen(isPortalModalDrawerOpen());

    const handleModalDrawerState = (event: Event) => {
      const detail = (event as CustomEvent<PortalModalDrawerStateDetail>).detail;
      if (!detail) {
        return;
      }
      setOpen(detail.open);
    };

    window.addEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, handleModalDrawerState);
    return () => {
      window.removeEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, handleModalDrawerState);
    };
  }, []);

  return open;
}
