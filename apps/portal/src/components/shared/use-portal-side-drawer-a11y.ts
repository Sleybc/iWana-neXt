'use client';

import { useEffect, useRef, type RefObject } from 'react';
import {
  isTopMostPortalSideDrawerLayer,
  registerPortalSideDrawerLayer,
  unregisterPortalSideDrawerLayer,
} from './portal-side-drawer-layers';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let nextDrawerLayerId = 1;

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  );
}

export function usePortalSideDrawerA11y(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const layerIdRef = useRef<number | null>(null);

  if (layerIdRef.current === null) {
    layerIdRef.current = nextDrawerLayerId;
    nextDrawerLayerId += 1;
  }

  const layerId = layerIdRef.current;

  // `onClose` viaja por ref para que NO sea dependencia del efecto de foco y
  // trap. Los consumidores lo reciben de `useDiscardChangesGuard`, cuyo
  // `requestClose` se declara `useCallback(..., [isDirty, onClose])`: cambiaba
  // de identidad justo al ensuciarse el formulario, así que el efecto se
  // reejecutaba y reprogramaba el foco inicial a mitad de captura. Con la ref,
  // el foco inicial se programa una sola vez por apertura.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return;
    }

    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [open]);

  useEffect(() => {
    if (!open) {
      unregisterPortalSideDrawerLayer(layerId);
      const previous = previousActiveElementRef.current;
      previousActiveElementRef.current = null;
      if (previous?.isConnected) {
        previous.focus();
      }
      return;
    }

    registerPortalSideDrawerLayer(layerId);

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousActiveElementRef.current = opener;

    const container = containerRef.current;
    if (!container) {
      return () => unregisterPortalSideDrawerLayer(layerId);
    }

    const focusable = getFocusableElements(container);
    const focusTarget = focusable[0] ?? container;
    const focusFrame = window.requestAnimationFrame(() => {
      if (!isTopMostPortalSideDrawerLayer(layerId)) {
        return;
      }
      // El foco inicial se difiere un frame, y ese frame puede caer DESPUÉS de
      // la primera interacción del operador. Reubicarlo entonces cierra el
      // desplegable recién abierto o le arranca el foco al campo que está
      // tecleando. Solo se enfoca si nadie más reclamó el foco entretanto.
      const active = document.activeElement;
      const untouched =
        active == null ||
        active === document.body ||
        active === document.documentElement ||
        active === opener;
      if (!untouched) {
        return;
      }
      focusTarget.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopMostPortalSideDrawerLayer(layerId)) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const currentContainer = containerRef.current;
      if (!currentContainer) {
        return;
      }

      const elements = getFocusableElements(currentContainer);
      if (elements.length === 0) {
        event.preventDefault();
        currentContainer.focus();
        return;
      }

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (!firstElement || !lastElement) {
        return;
      }

      if (!activeElement || !currentContainer.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      unregisterPortalSideDrawerLayer(layerId);
    };
  }, [containerRef, layerId, open]);
}
