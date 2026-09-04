// packages/ui/src/components/FormStatus.spec.tsx
import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormStatus } from './FormStatus';

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

describe('FormStatus', () => {
  it('idle renderiza la region viva vacia, nunca null', () => {
    const html = renderToStaticMarkup(<FormStatus status="idle" message="Nunca visible" />);

    // Invariante del contrato (§1.1): la region preexiste para que el lector
    // vigile sus cambios; montarla junto al contenido pierde el anuncio.
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).not.toContain('Nunca visible');
    expect(textOf(html)).toBe('');
  });

  it('success anuncia en polite con icono oculto a tecnologia de apoyo', () => {
    const html = renderToStaticMarkup(
      <FormStatus status="success" message="Perfil actualizado correctamente." />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Perfil actualizado correctamente.');
    expect(html).toContain('aria-hidden="true"');
  });

  it('error anuncia en assertive con rol alert', () => {
    const html = renderToStaticMarkup(
      <FormStatus status="error" message="No fue posible guardar los cambios." />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('No fue posible guardar los cambios.');
  });

  it('tone anula el derivado sin tocar el rol', () => {
    const html = renderToStaticMarkup(
      <FormStatus status="success" message="Listo." tone="assertive" />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="assertive"');
  });

  it('propaga id y className sin sobreescribir la paleta', () => {
    const html = renderToStaticMarkup(
      <FormStatus status="error" message="Fallo." id="form-estado" className="mt-2" />,
    );

    expect(html).toContain('id="form-estado"');
    expect(html).toContain('mt-2');
    expect(html).toContain('border-red-200');
  });

  it('autoDismissMs con error no rompe el render (el error no se auto-oculta)', () => {
    const html = renderToStaticMarkup(
      <FormStatus
        status="error"
        message="Fallo."
        autoDismissMs={3000}
        onDismiss={() => undefined}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Fallo.');
  });
});
