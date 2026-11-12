/**
 * Regla única de datos obligatorios del titular importado (`chk_subscriber_person_fields` de
 * CRM): persona natural con documento, nombres, apellidos y estrato; jurídica con NIT y razón
 * social. La usan la simulación (para anticipar el rechazo en el informe) y la promoción
 * (para no intentar el INSERT); nunca se duplica.
 */
export interface TitularRequiredInput {
  documentType: 'CC' | 'NIT';
  documentNumber: string | null;
  stratum: number | null;
}

export interface TitularPersonFields {
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  /** `true` si CRM puede crear el titular con estos datos. */
  complete: boolean;
}

/** Texto recortado o `null` si no es texto o queda vacío. */
export function importedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function titularPersonFields(
  raw: Record<string, unknown> | null | undefined,
  facts: TitularRequiredInput,
): TitularPersonFields {
  const source = raw ?? {};
  const firstName = importedText(source['firstName'], 300);
  const lastName = importedText(source['lastName'], 300);
  const businessName = importedText(source['companyName'], 300);
  const complete =
    facts.documentType === 'NIT'
      ? !!facts.documentNumber && !!businessName
      : !!facts.documentNumber && !!firstName && !!lastName && facts.stratum !== null;
  return { firstName, lastName, businessName, complete };
}
