export function formatExpedienteShortLabel(expedienteId: string | null | undefined): string {
  const normalizedId = expedienteId?.trim();

  if (!normalizedId) {
    return 'NO-DISP';
  }

  return normalizedId.split('-')[0]?.toUpperCase() || normalizedId.slice(0, 8).toUpperCase();
}

export function formatExpedienteDisplayRef(expedienteId: string | null | undefined): string {
  return `Oportunidad ${formatExpedienteShortLabel(expedienteId)}`;
}
