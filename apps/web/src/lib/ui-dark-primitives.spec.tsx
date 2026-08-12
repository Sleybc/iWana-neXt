import { render } from '@testing-library/react';
import { Button, Input, interactiveFocusClassName } from '@iwana/ui';
import { FORM_INPUT_CLASS } from './form-styles';

describe('primitives dark (DS-DARK-FIELD / FOCUS / MUTED)', () => {
  it('interactiveFocusClassName añade anillo primary-300 en dark y conserva offset surface-2', () => {
    expect(interactiveFocusClassName).toContain('dark:focus-visible:ring-iwana-primary-300');
    expect(interactiveFocusClassName).toContain('dark:focus-visible:ring-offset-dark-surface-2');
    expect(interactiveFocusClassName).toContain('focus-visible:ring-iwana-primary');
  });

  it('Input usa borde neutral-600 y placeholder gray-400 en dark; no toca el anillo primary-300', () => {
    const { container } = render(<Input aria-label="Campo" placeholder="Escribe" />);
    const input = container.querySelector('input');
    expect(input?.className).toContain('dark:border-iwana-neutral-600');
    expect(input?.className).toContain('dark:placeholder:text-gray-400');
    expect(input?.className).toContain('dark:focus-visible:ring-iwana-primary-300');
    expect(input?.className).not.toContain('dark:border-dark-border-2');
  });

  it('Button base incluye anillo primary-300 en dark', () => {
    const { getByRole } = render(<Button type="button">Guardar</Button>);
    expect(getByRole('button').className).toContain('dark:focus-visible:ring-iwana-primary-300');
    expect(getByRole('button').className).toContain(
      'dark:focus-visible:ring-offset-dark-surface-2',
    );
  });

  it('FORM_INPUT_CLASS identifica el control con neutral-600 y placeholder muted AA', () => {
    expect(FORM_INPUT_CLASS).toContain('dark:border-iwana-neutral-600');
    expect(FORM_INPUT_CLASS).toContain('dark:placeholder:text-gray-400');
    expect(FORM_INPUT_CLASS).not.toMatch(/dark:border-dark-border(?!-)/);
  });

  it('Input disabled en dark usa muted gray-400, no gray-500', () => {
    const { container } = render(<Input aria-label="Campo" disabled />);
    const input = container.querySelector('input');
    expect(input?.className).toContain('dark:disabled:text-gray-400');
    expect(input?.className).not.toContain('dark:disabled:text-gray-500');
  });
});
