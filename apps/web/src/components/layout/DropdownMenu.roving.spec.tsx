/**
 * Roving focus genérico de DropdownMenu (@iwana/ui): salta items disabled
 * y items condicionales ausentes del DOM.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@iwana/ui';

describe('DropdownMenu roving focus (primitiva)', () => {
  it('ArrowDown/Up/Home/End saltan items disabled', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Uno</DropdownMenuItem>
          <DropdownMenuItem disabled>Dos (disabled)</DropdownMenuItem>
          <DropdownMenuItem>Tres</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());

    const uno = screen.getByRole('menuitem', { name: 'Uno' });
    const tres = screen.getByRole('menuitem', { name: 'Tres' });
    uno.focus();

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(tres).toHaveFocus();

    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(uno).toHaveFocus();

    fireEvent.keyDown(document, { key: 'End' });
    expect(tres).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Home' });
    expect(uno).toHaveFocus();
  });

  it('ArrowDown en el trigger abre y enfoca el primer item habilitado', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Abrir</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled>Bloqueado</DropdownMenuItem>
          <DropdownMenuItem>Primero útil</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const trigger = screen.getByRole('button', { name: 'Abrir' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Primero útil' })).toHaveFocus();
    });
  });
});
