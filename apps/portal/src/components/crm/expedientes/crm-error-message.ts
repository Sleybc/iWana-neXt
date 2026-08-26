import { ApiError } from '@/lib/api-client';

export function getSafeCrmErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  switch (error.code) {
    case 'VALIDATION_ERROR':
      return 'Revisa la información indicada e inténtalo de nuevo.';
    case 'FORBIDDEN':
    case 'INSUFFICIENT_PERMISSIONS':
      return 'No tienes permisos para completar esta acción.';
    case 'NOT_FOUND':
      return 'La oportunidad ya no está disponible.';
    default:
      return fallback;
  }
}
