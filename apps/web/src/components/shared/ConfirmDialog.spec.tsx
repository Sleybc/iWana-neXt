import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

jest.mock('@iwana/ui', () => {
  const ReactLib = require('react') as typeof import('react');

  return {
    Button: ({
      children,
      loading,
      disabled,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      children?: React.ReactNode;
      loading?: boolean;
    }) => (
      <button {...props} disabled={Boolean(disabled) || Boolean(loading)}>
        {children}
      </button>
    ),
    Input: ReactLib.forwardRef<HTMLInputElement, Record<string, unknown>>(function MockInput(
      { id, label, ...props },
      ref,
    ) {
      return (
        <div>
          {label ? (
            <label htmlFor={id as string | undefined}>{label as React.ReactNode}</label>
          ) : null}
          <input id={id as string | undefined} ref={ref} {...props} />
        </div>
      );
    }),
    Dialog: ({
      open,
      children,
      onOpenChange,
    }: {
      open?: boolean;
      children: React.ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) =>
      open ? (
        <div data-testid="confirm-dialog-root" data-on-open-change={Boolean(onOpenChange)}>
          {children}
        </div>
      ) : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => (
      <div role="dialog" aria-modal="true">
        {children}
      </div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 {...props}>{children}</h2>
    ),
    DialogDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...props}>{children}</p>
    ),
  };
});

describe('ConfirmDialog', () => {
  it('al confirmar ejecuta onConfirm', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ConfirmDialog
        open
        title="Eliminar recurso"
        description="Esta acción no se puede deshacer."
        confirmLabel="Sí, confirmar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sí, confirmar' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('al cancelar ejecuta onCancel y no onConfirm', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <ConfirmDialog
        open
        title="Eliminar recurso"
        description="Esta acción no se puede deshacer."
        confirmLabel="Sí, confirmar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('con confirmación tipada deshabilita confirmar hasta que el texto coincida', () => {
    const onConfirm = jest.fn();

    render(
      <ConfirmDialog
        open
        title="Eliminar empresa"
        description="Acción irreversible."
        confirmationText="Empresa Demo"
        confirmLabel="Sí, eliminar"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Sí, eliminar' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Empresa Demo' } });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
