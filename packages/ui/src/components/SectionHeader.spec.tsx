// packages/ui/src/components/SectionHeader.spec.tsx
import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { UserRound } from 'lucide-react';
import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
  it('exige headingLevel: h2 y h3 segun se declare', () => {
    const h2 = renderToStaticMarkup(
      <SectionHeader icon={UserRound} title="Datos personales" headingLevel={2} />,
    );
    const h3 = renderToStaticMarkup(
      <SectionHeader icon={UserRound} title="Email de acceso" headingLevel={3} />,
    );

    expect(h2).toContain('<h2');
    expect(h2).not.toContain('<h3');
    expect(h3).toContain('<h3');
    expect(h3).not.toContain('<h2');
  });

  it('md usa caja 48px, titulo text-lg e icono 20px con tono primario', () => {
    const html = renderToStaticMarkup(
      <SectionHeader
        icon={UserRound}
        eyebrow="Identidad del usuario"
        title="Datos personales"
        headingLevel={2}
        description="Descripcion."
      />,
    );

    expect(html).toContain('h-12 w-12');
    expect(html).toContain('text-lg');
    expect(html).toContain('h-5 w-5');
    expect(html).toContain('bg-iwana-primary/10');
    expect(html).toContain('Identidad del usuario');
  });

  it('sm usa caja 44px, titulo text-sm e icono 16px con tono secundario', () => {
    const html = renderToStaticMarkup(
      <SectionHeader
        icon={UserRound}
        title="Email de acceso"
        headingLevel={3}
        size="sm"
        tone="secondary"
      />,
    );

    expect(html).toContain('h-11 w-11');
    expect(html).toContain('text-sm');
    expect(html).toContain('h-4 w-4');
    expect(html).toContain('bg-iwana-secondary-100');
    expect(html).toContain('text-iwana-secondary-700');
  });

  it('sin eyebrow ni descripcion no reserva sus nodos', () => {
    const html = renderToStaticMarkup(
      <SectionHeader icon={UserRound} title="Solo titulo" headingLevel={2} />,
    );

    expect(html).not.toContain('<p ');
    expect(html).not.toContain('<p>');
  });

  it('descripcion unificada y titulo que envuelve sin truncar', () => {
    const html = renderToStaticMarkup(
      <SectionHeader
        icon={UserRound}
        title="Un titulo suficientemente largo para comprobar que envuelve"
        headingLevel={2}
        description="Descripcion."
      />,
    );

    expect(html).toContain('text-gray-500 dark:text-gray-400');
    expect(html).not.toContain('truncate');
  });

  it('caja con radio de escala e icono oculto a tecnologia de apoyo', () => {
    const html = renderToStaticMarkup(
      <SectionHeader icon={UserRound} title="Titulo" headingLevel={2} />,
    );

    expect(html).toContain('rounded-xl');
    expect(html).not.toContain('rounded-[20px]');
    expect(html).not.toContain('rounded-[18px]');
    expect(html).not.toContain('h-4.5');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renderiza acciones cuando se pasan', () => {
    const html = renderToStaticMarkup(
      <SectionHeader
        icon={UserRound}
        title="Titulo"
        headingLevel={2}
        actions={<button type="button">Accion</button>}
      />,
    );

    expect(html).toContain('Accion');
  });
});
