// packages/ui/src/components/Avatar.spec.tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar } from './Avatar';

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

describe('Avatar (contrato docs/specs/2026-09-04-contrato-avatar.md v1.0)', () => {
  it('declara use client porque usa estado y el barrel se importa desde layouts RSC', () => {
    const source = readFileSync(join(__dirname, 'Avatar.tsx'), 'utf8');
    expect(source).toMatch(/^(\/\/[^\n]*\r?\n)?'use client';/);
  });

  it('iniciales primera+última palabra ("María del Carmen Ruiz" → "MR", no "MD")', () => {
    const html = renderToStaticMarkup(
      <Avatar name="María del Carmen Ruiz" labelledById="nombre" />,
    );

    expect(textOf(html)).toBe('MR');
  });

  it('una palabra toma sus 2 primeros grafemas ("Madonna" → "MA")', () => {
    const html = renderToStaticMarkup(<Avatar name="Madonna" labelledById="nombre" />);

    expect(textOf(html)).toBe('MA');
  });

  it('nombre vacío pinta el icono fallback, nunca "?", "iW" ni "U"', () => {
    const html = renderToStaticMarkup(<Avatar name="   " labelledById="nombre" />);

    expect(textOf(html)).toBe('');
    expect(html).toContain('<svg');
    expect(html).not.toContain('>?</');
    expect(html).not.toContain('>iW</');
  });

  it('el fallback nunca deriva del email: no existe prop ni variable de email', () => {
    const source = readFileSync(join(__dirname, 'Avatar.tsx'), 'utf8');

    expect(source).not.toMatch(/^\s*email\??:/m);
    expect(source).not.toMatch(/\bemail[A-Z]\w*/);
  });

  it('fuera del BMP: no rompe pares sustitutos ("😀 Pérez" → grafema + "P")', () => {
    const html = renderToStaticMarkup(<Avatar name="😀 Pérez" labelledById="nombre" />);

    expect(textOf(html)).toBe('😀P');
    expect(html).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('mayúsculas con configuración española ("ana gÓmez" → "AG")', () => {
    const html = renderToStaticMarkup(<Avatar name="ana gÓmez" labelledById="nombre" />);

    expect(textOf(html)).toBe('AG');
  });

  it('decorativo con nombre adyacente: aria-hidden sin rol ni etiqueta', () => {
    const html = renderToStaticMarkup(<Avatar name="Ada Lovelace" labelledById="nombre" />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('aria-label');
  });

  it('avatar solo: role="img" + aria-label en español sentence case', () => {
    const html = renderToStaticMarkup(<Avatar name="Ada Lovelace" />);

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Avatar de Ada Lovelace"');
  });

  it('avatar solo sin nombre: etiqueta genérica sin PII', () => {
    const html = renderToStaticMarkup(<Avatar name="" />);

    expect(html).toContain('aria-label="Avatar de usuario sin nombre"');
  });

  it('tamaños cerrados sm/md/lg/xl, siempre circular', () => {
    expect(renderToStaticMarkup(<Avatar name="A" size="sm" />)).toContain('h-8 w-8');
    expect(renderToStaticMarkup(<Avatar name="A" size="md" />)).toContain('h-10 w-10');
    expect(renderToStaticMarkup(<Avatar name="A" size="lg" />)).toContain('h-16 w-16');
    expect(renderToStaticMarkup(<Avatar name="A" size="xl" />)).toContain('h-20 w-20');

    const source = readFileSync(join(__dirname, 'Avatar.tsx'), 'utf8');
    expect(source).toContain('rounded-full');
    expect(source).not.toMatch(/rounded-(lg|xl|2xl|md)/);
  });

  it('variantes por token de marca, sin hex', () => {
    const full = renderToStaticMarkup(<Avatar name="A" variant="default" />);
    expect(full).toContain('bg-iwana-primary');
    expect(full).toContain('text-white');

    const soft = renderToStaticMarkup(<Avatar name="A" variant="soft" />);
    expect(soft).toContain('bg-iwana-primary-100');
    expect(soft).toContain('text-iwana-primary-700');
  });

  it('imagen válida con alt vacío en modo decorativo y con nombre en modo solo', () => {
    const decorative = renderToStaticMarkup(
      <Avatar name="Ada Lovelace" avatarUrl="https://cdn.test/a.png" labelledById="nombre" />,
    );
    expect(decorative).toContain('<img');
    expect(decorative).toContain('alt=""');

    const solo = renderToStaticMarkup(
      <Avatar name="Ada Lovelace" avatarUrl="https://cdn.test/a.png" />,
    );
    expect(solo).toContain('alt="Ada Lovelace"');
  });

  it('URL vacía o solo blancos → sin imagen', () => {
    expect(renderToStaticMarkup(<Avatar name="Ada Lovelace" avatarUrl="" />)).not.toContain('<img');
    expect(renderToStaticMarkup(<Avatar name="Ada Lovelace" avatarUrl="   " />)).not.toContain(
      '<img',
    );
  });

  it('error de carga cae a iniciales/icono sin reintento (onError conmutado)', () => {
    const source = readFileSync(join(__dirname, 'Avatar.tsx'), 'utf8');
    expect(source).toContain('onError');
    expect(source).toContain('setImgFailed(true)');
  });
});
