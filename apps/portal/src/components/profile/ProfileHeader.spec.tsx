import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ProfileHeader } from './ProfileHeader';
import type { UserProfile } from '@/lib/api-client';

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-uuid-001',
    email: 'ada@prueba.local',
    role: 'ADMIN',
    status: 'ACTIVE',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '+573001234567',
    jobTitle: 'Administración',
    avatarUrl: null,
    mfaEnabled: true,
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProfileHeader', () => {
  it('muestra el nombre completo y sus iniciales como avatar', () => {
    render(<ProfileHeader profile={buildProfile()} roleLabel="Administrador" />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('usa el repliegue sin nombre cuando no hay nombre ni apellido', () => {
    const { container } = render(
      <ProfileHeader
        profile={buildProfile({ firstName: null, lastName: null })}
        roleLabel="Administrador"
      />,
    );

    expect(screen.getByText('Sin nombre configurado')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByText('?')).not.toBeInTheDocument();
  });

  it('muestra el cargo solo cuando existe', () => {
    const { rerender } = render(
      <ProfileHeader profile={buildProfile()} roleLabel="Administrador" />,
    );
    expect(screen.getByText('Administración')).toBeInTheDocument();

    rerender(
      <ProfileHeader profile={buildProfile({ jobTitle: null })} roleLabel="Administrador" />,
    );
    expect(screen.queryByText('Administración')).not.toBeInTheDocument();
  });

  it('muestra el rol y el estado del usuario', () => {
    render(<ProfileHeader profile={buildProfile()} roleLabel="Administrador" />);

    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('encabezado sin violaciones de accesibilidad', async () => {
    const { container } = render(
      <ProfileHeader profile={buildProfile()} roleLabel="Administrador" />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
