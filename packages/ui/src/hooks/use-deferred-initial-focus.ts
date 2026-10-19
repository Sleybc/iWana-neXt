'use client';

import { useCallback, useEffect, useRef } from 'react';

export type DeferredFocusCleanup = () => void;
export type DeferredFocusEligibility = () => boolean;
export type DeferredFocusScheduler = (
  target: HTMLElement | null,
  isEligible?: DeferredFocusEligibility,
) => DeferredFocusCleanup;

/** Agenda el foco inicial si ninguna otra interacción lo reclamó en el frame. */
export function useDeferredInitialFocus(): DeferredFocusScheduler {
  const pendingFrameRef = useRef<number | null>(null);

  const scheduleFocus = useCallback<DeferredFocusScheduler>((target, isEligible) => {
    if (pendingFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }

    if (!target) {
      return () => {};
    }

    const focusedAtRequest = document.activeElement;
    let frameId: number | null = null;
    let frameHasRun = false;
    frameId = window.requestAnimationFrame(() => {
      frameHasRun = true;
      if (frameId !== null && pendingFrameRef.current === frameId) {
        pendingFrameRef.current = null;
      }

      const active = document.activeElement;
      const focusIsUntouched =
        active == null ||
        active === document.body ||
        active === document.documentElement ||
        active === focusedAtRequest;

      if (!focusIsUntouched || isEligible?.() === false) {
        return;
      }

      target.focus();
    });
    if (!frameHasRun) {
      pendingFrameRef.current = frameId;
    }

    return () => {
      if (frameId === null || pendingFrameRef.current !== frameId) {
        return;
      }

      window.cancelAnimationFrame(frameId);
      pendingFrameRef.current = null;
    };
  }, []);

  useEffect(
    () => () => {
      if (pendingFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
    },
    [],
  );

  return scheduleFocus;
}
