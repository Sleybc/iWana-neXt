/**
 * Destinatario enmascarado para el registro de correos (spec 2026-11-13 R4): primera letra del
 * usuario y del dominio, y solo el último nivel del dominio. `juan.perez@dominio.com.co` →
 * `j***@d***.co`. Una dirección sin forma de correo devuelve null: nunca se guarda en claro.
 */
export function maskEmailAddress(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  if (!value) return null;
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const labels = value.slice(at + 1).split('.');
  if (labels.length < 2 || labels.some((label) => !label)) return null;
  const tld = labels[labels.length - 1]!;
  if (!/^[a-z]{2,24}$/u.test(tld)) return null;
  const first = (text: string) => Array.from(text)[0] ?? '';
  return `${first(local)}***@${first(labels[0]!)}***.${tld}`;
}
