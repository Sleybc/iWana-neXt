import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

export interface TenantDirectoryCounts {
  active: number;
  provisioning: number;
  failed: number;
  suspended: number;
  inactive: number;
  markedForDeletion: number;
}

function joinClauses(parts: string[]): string {
  if (parts.length === 0) {
    return '';
  }
  if (parts.length === 1) {
    return `${parts[0]}.`;
  }
  return `${parts[0]}. ${parts.slice(1).join(' y ')}.`;
}

/** Frase de lectura del directorio, al tono de Monitoreo. */
export function describeTenantDirectorySummary(
  counts: TenantDirectoryCounts,
  total: number,
): string {
  if (total === 0) {
    return PLATFORM_UI_COPY.dashboard.statusEmpty;
  }

  const attention = counts.failed + counts.suspended + counts.markedForDeletion;
  const parts: string[] = [];

  if (counts.active > 0) {
    parts.push(
      counts.active === 1
        ? '1 empresa opera con normalidad'
        : `${counts.active} empresas operan con normalidad`,
    );
  }

  if (counts.provisioning > 0) {
    parts.push(
      counts.provisioning === 1
        ? '1 sigue en configuración'
        : `${counts.provisioning} siguen en configuración`,
    );
  }

  if (attention > 0) {
    parts.push(attention === 1 ? '1 requiere revisión' : `${attention} requieren revisión`);
  }

  if (parts.length === 0) {
    return total === 1 ? '1 empresa en el directorio.' : `${total} empresas en el directorio.`;
  }

  return joinClauses(parts);
}
