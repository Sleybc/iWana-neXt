import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { RadioCardGroup } from './RadioCardGroup';

describe('RadioCardGroup', () => {
  it('usa fieldset, radios nativos con el mismo name y no agrega roles redundantes', () => {
    const html = renderToStaticMarkup(
      <RadioCardGroup
        legend="Plan"
        name="plan"
        value="basic"
        onChange={() => undefined}
        options={[
          { value: 'basic', title: 'Básico', description: 'Descripción', meta: 'SKU-001' },
          { value: 'pro', title: 'Profesional' },
        ]}
      />,
    );

    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend');
    expect(html).toMatch(/<input[^>]*type="radio"[^>]*name="plan"[^>]*checked=""/);
    expect(html.match(/<input[^>]*type="radio"/g)).toHaveLength(2);
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain('role="radio"');
    expect(html).toContain('font-mono');
    expect(html).toContain('SKU-001');
  });

  it('presenta de forma visible y asocia el motivo de la opción deshabilitada', () => {
    const html = renderToStaticMarkup(
      <RadioCardGroup
        legend="Plan"
        name="plan"
        value={null}
        onChange={() => undefined}
        options={[
          {
            value: 'legacy',
            title: 'Legado',
            disabled: true,
            disabledReason: 'Ya no está disponible.',
          },
        ]}
      />,
    );

    expect(html).toMatch(/type="radio"[^>]*disabled=""[^>]*aria-describedby="[^"]+"/);
    expect(html).toContain('Ya no está disponible.');
  });

  it.each(['comfortable', 'compact'] as const)(
    'conserva min-h-11 y foco de tarjeta en densidad %s',
    (density) => {
      const html = renderToStaticMarkup(
        <RadioCardGroup
          legend="Plan"
          name="plan"
          value="basic"
          onChange={() => undefined}
          density={density}
          options={[{ value: 'basic', title: 'Básico' }]}
        />,
      );

      expect(html).toContain('min-h-11');
      expect(html).toContain('has-[:focus-visible]:ring-2');
    },
  );
});
