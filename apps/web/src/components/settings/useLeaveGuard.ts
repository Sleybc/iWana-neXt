'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setLeaveInterceptor } from '@/lib/leave-guard';

/**
 * Pide confirmación antes de salir con cambios sin guardar (spec UX de T3, 2026-11-25):
 * enlaces internos, Atrás y las salidas vía `guardLeave` (buscador global, cerrar sesión) abren el diálogo; cerrar o recargar usan el aviso nativo.
 * Atrás se detiene con una entrada centinela de la misma URL encima de la actual.
 */
export function useLeaveGuard(dirty: boolean) {
  const router = useRouter();
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const dirtyRef = useRef(dirty);
  const sentinelRef = useRef(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (dirty && !sentinelRef.current) {
      window.history.pushState(window.history.state, '', window.location.href);
      sentinelRef.current = true;
    } else if (!dirty && sentinelRef.current) {
      // Ya no hay nada que proteger: se retira la centinela para que Atrás no quede «muerto».
      sentinelRef.current = false;
      leavingRef.current = true;
      window.history.back();
    }
  }, [dirty]);

  useEffect(() => {
    const onPopState = () => {
      if (leavingRef.current) {
        leavingRef.current = false;
        return;
      }
      if (!sentinelRef.current) return;
      // Atrás consumió la centinela: se repone y se pregunta.
      window.history.pushState(window.history.state, '', window.location.href);
      setLeave(() => () => {
        sentinelRef.current = false;
        leavingRef.current = true;
        window.history.go(-2);
      });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || leavingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;
      const url = new URL(anchor.href);
      const here = window.location;
      // `//otro.host` en la ruta: el router lo leería como URL externa; que decida el navegador.
      if (url.origin !== here.origin || url.pathname.startsWith('//')) return;
      if (url.pathname === here.pathname && url.search === here.search) return;
      // Captura en window: Next.js y React no llegan a ver el clic.
      event.preventDefault();
      event.stopPropagation();
      const destination = `${url.pathname}${url.search}${url.hash}`;
      setLeave(() => () => {
        // Sustituye la centinela: Atrás desde el destino vuelve aquí sin pasos de más.
        if (sentinelRef.current) router.replace(destination);
        else router.push(destination);
        sentinelRef.current = false;
      });
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('click', onClick, true);
    };
  }, [router]);

  useEffect(
    () =>
      setLeaveInterceptor((proceed) => {
        if (!dirtyRef.current) return false;
        setLeave(() => () => {
          sentinelRef.current = false;
          proceed();
        });
        return true;
      }),
    [],
  );

  const stay = useCallback(() => setLeave(null), []);
  const confirm = useCallback(() => {
    leave?.();
    setLeave(null);
  }, [leave]);

  return { open: leave !== null, stay, confirm };
}
