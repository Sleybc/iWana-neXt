import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { UsersTable } from './UsersTable';

describe('UsersTable', () => {
  it('renderiza el estado vacío contextual cuando se provee desde la página', () => {
    render(
      <UsersTable
        users={[]}
        isLoading={false}
        total={0}
        hasNextPage={false}
        hasPrevPage={false}
        emptyStateTitle="No encontramos usuarios en Empresa Demo."
        emptyStateDescription="Revisa el criterio de búsqueda o crea un usuario interno para continuar."
        onNext={jest.fn()}
        onPrev={jest.fn()}
        onManage={jest.fn()}
      />,
    );

    expect(screen.getByText('No encontramos usuarios en Empresa Demo.')).toBeInTheDocument();
    expect(
      screen.getByText('Revisa el criterio de búsqueda o crea un usuario interno para continuar.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Mostrando 0 de 0 usuarios internos')).toBeInTheDocument();
  });
});
