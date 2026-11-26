/**
 * Punto único para salidas que no son enlaces (buscador global, «Cerrar sesión»):
 * la pantalla con cambios sin guardar registra un interceptor y quien navega llama a
 * `guardLeave`. Sin interceptor, o si no hay nada que proteger, la salida ocurre al instante.
 */
type LeaveInterceptor = (proceed: () => void) => boolean;

let interceptor: LeaveInterceptor | null = null;

export function setLeaveInterceptor(next: LeaveInterceptor): () => void {
  interceptor = next;
  return () => {
    if (interceptor === next) interceptor = null;
  };
}

/** Devuelve `true` si la salida quedó en espera de confirmación. */
export function guardLeave(proceed: () => void): boolean {
  if (interceptor?.(proceed)) return true;
  proceed();
  return false;
}
