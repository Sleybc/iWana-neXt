export type ExecutionOrderSyncState = 'synced' | 'pending' | 'error' | 'stale' | 'conflict';
export function toSummarySyncState(
  state: string | null | undefined,
): ExecutionOrderSyncState | undefined {
  switch (state) {
    case 'IN_SYNC':
      return 'synced';
    case 'PENDING':
      return 'pending';
    case 'FAILED':
      return 'error';
    case 'DIVERGED':
      return 'conflict';
    default:
      return undefined;
  }
}
export function syncCopy(state: ExecutionOrderSyncState | undefined): string {
  switch (state) {
    case 'synced':
      return 'Sincronizada';
    case 'pending':
      return 'Sincronización pendiente';
    case 'error':
      return 'No pudimos sincronizar la orden';
    case 'stale':
      return 'Actualización pendiente';
    case 'conflict':
      return 'La orden cambió; revisa la versión vigente';
    default:
      return 'Estado de sincronización no disponible';
  }
}
