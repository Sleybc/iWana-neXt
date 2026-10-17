type ErrorRecord = Record<string, unknown>;

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/u;
const DOMAIN_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,62}(?:\.[A-Za-z_][A-Za-z0-9_$]{0,62})?$/u;
const CLASS_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;

function asRecord(value: unknown): ErrorRecord | undefined {
  return typeof value === 'object' && value !== null ? (value as ErrorRecord) : undefined;
}

function ownDataValue(record: ErrorRecord | undefined, key: string): unknown {
  if (!record) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function safeClassName(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'UnknownError';

  const prototype = Object.getPrototypeOf(error) as { constructor?: { name?: unknown } } | null;
  const name = prototype?.constructor?.name;
  return typeof name === 'string' && CLASS_NAME_PATTERN.test(name) ? name : 'Error';
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value) ? value : undefined;
}

export function extractSqlState(error: unknown): string | undefined {
  const root = asRecord(error);
  const driver = asRecord(ownDataValue(root, 'driverError'));
  const rawCode = ownDataValue(driver, 'code') ?? ownDataValue(root, 'code');
  return typeof rawCode === 'string' && SQLSTATE_PATTERN.test(rawCode) ? rawCode : undefined;
}

/**
 * Resume un error con etiquetas operativas permitidas; nunca consulta el
 * mensaje, SQL, parámetros, detail, where ni stack del error recibido.
 */
export function summarizeErrorForLog(error: unknown): string {
  const root = asRecord(error);
  const driver = asRecord(ownDataValue(root, 'driverError'));
  const rawCode = ownDataValue(driver, 'code') ?? ownDataValue(root, 'code');
  const sqlstate = extractSqlState(error);
  const domainCode =
    sqlstate === undefined && typeof rawCode === 'string' && DOMAIN_CODE_PATTERN.test(rawCode)
      ? rawCode
      : undefined;
  const constraint = safeIdentifier(ownDataValue(driver, 'constraint'));
  const table = safeIdentifier(ownDataValue(driver, 'table'));

  const fields = [`class=${safeClassName(error)}`, `sqlstate=${sqlstate ?? 'none'}`];
  if (domainCode) fields.push(`code=${domainCode}`);
  if (constraint) fields.push(`constraint=${constraint}`);
  if (table) fields.push(`table=${table}`);
  return fields.join(' ');
}
