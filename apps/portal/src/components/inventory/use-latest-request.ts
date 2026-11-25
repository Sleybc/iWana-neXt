import { useState } from 'react';

export interface LatestRequest {
  /** Registra una petición nueva: las anteriores dejan de ser vigentes. */
  begin: () => { isCurrent: () => boolean; end: () => boolean };
  isPending: () => boolean;
}

/**
 * Orden de peticiones de un mismo dato: solo la última debe escribir datos, error y
 * fin de carga. `end` devuelve si la petición seguía vigente al terminar.
 */
export function useLatestRequest(): LatestRequest {
  const [latest] = useState<LatestRequest>(() => {
    let currentId = 0;
    let pending = false;

    return {
      begin: () => {
        currentId += 1;
        pending = true;
        const id = currentId;
        const isCurrent = () => id === currentId;

        return {
          isCurrent,
          end: () => {
            if (!isCurrent()) return false;
            pending = false;
            return true;
          },
        };
      },
      isPending: () => pending,
    };
  });

  return latest;
}
