/**
 * Formatea el actor de un evento de auditoría.
 * Si no hay userId, retorna 'Sistema'. Si hay UUID, retorna primeros 8 chars
 * como fallback hasta que el backend resuelva nombres (Fase 5).
 */
export function formatActorShort(userId: string | null): string {
  if (!userId) return 'Sistema';
  return `Usuario ${userId.slice(0, 8)}`;
}

/** Retorna el ID completo del actor para tooltips */
export function formatActorFull(userId: string | null): string {
  return userId ?? 'Sistema';
}

/** Retorna true si el actor es el sistema (sin usuario humano) */
export function isSystemActor(userId: string | null): boolean {
  return userId === null;
}
