import { maskEmailAddress } from './billing-email-mask';

describe('maskEmailAddress', () => {
  it('deja la primera letra del usuario y del dominio y el último nivel', () => {
    expect(maskEmailAddress('juan.perez@dominio.co')).toBe('j***@d***.co');
    expect(maskEmailAddress('  Ana@Correo.Com.Co ')).toBe('a***@c***.co');
  });

  it('no devuelve nada que no tenga forma de correo', () => {
    for (const value of [
      null,
      undefined,
      '',
      'sin-arroba',
      '@dominio.co',
      'a@',
      'a@dominio',
      'a@dominio.',
      'a@dominio.c0m',
    ])
      expect(maskEmailAddress(value)).toBeNull();
  });

  it('nunca contiene el usuario ni el dominio completos', () => {
    const masked = maskEmailAddress('titular.prueba@proveedor.example.co')!;
    expect(masked).not.toContain('titular');
    expect(masked).not.toContain('proveedor');
    expect(masked.length).toBeLessThanOrEqual(120);
  });
});
