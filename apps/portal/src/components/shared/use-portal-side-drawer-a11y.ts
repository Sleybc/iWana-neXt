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

    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    if (!container) {
      return () => unregisterPortalSideDrawerLayer(layerId);
    }

    const focusable = getFocusableElements(container);
    const focusTarget = focusable[0] ?? container;
    const focusFrame = window.requestAnimationFrame(() => {
      if (isTopMostPortalSideDrawerLayer(layerId)) {
        focusTarget.focus();
      }
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopMostPortalSideDrawerLayer(layerId)) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
  }, [containerRef, layerId, onClose, open]);
}
