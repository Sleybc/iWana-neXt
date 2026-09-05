import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { PersonalInfoForm } from './PersonalInfoForm';
import type { UserProfile } from '@/lib/api-client';

const updateMeMock = jest.fn();
const changeLoginEmailMock = jest.fn();

jest.mock('@/lib/api-client', () => ({
  userApi: {
    updateMe: (...args: unknown[]) => updateMeMock(...args),
    changeLoginEmail: (...args: unknown[]) => changeLoginEmailMock(...args),
  },
}));

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

interface PersonalInfoFormHarness {
  profile?: UserProfile;
  tenantCountry?: string;
  onUpdated?: jest.Mock;
}

function renderForm({
  profile = buildProfile(),
  tenantCountry = 'CO',
  onUpdated = jest.fn(),
}: PersonalInfoFormHarness = {}) {
  return {
    onUpdated,
    ...render(
      <PersonalInfoForm
        profile={profile}
        userId="user-uuid-001"
        tenantCountry={tenantCountry}
        onUpdated={onUpdated}
      />,
    ),
  };
}

function fillPersonalName(value: string) {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value } });
}

function submitPersonal() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
}

// Las regiones vivas se desambiguan por id estable: `status`/`alert` se
// nombran por autor (accName), nunca por contenido, así que el filtro `name`
// de getByRole jamás empareja el anuncio aunque esté renderizado.
function getLiveRegion(id: string): HTMLElement {
  const region = document.getElementById(id);
  if (region === null) {
    throw new Error(`Falta la región viva ${id}`);
  }
  return region;
}

describe('PersonalInfoForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateMeMock.mockResolvedValue(buildProfile({ firstName: 'Ada Augusta' }));
    changeLoginEmailMock.mockResolvedValue(buildProfile({ email: 'nueva@prueba.local' }));
  });

  it('PIF-01 (P-03/CA-P02) — sin teléfono guardado el campo nace vacío y no viaja', async () => {
    const { onUpdated } = renderForm({ profile: buildProfile({ phone: null }) });

    // El prefijo desnudo '+57' no cumple E.164: pre-rellenarlo rompe el guardado.
    expect(screen.getByLabelText(/Teléfono/i)).toHaveValue('');

    fillPersonalName('Ada Augusta');
    submitPersonal();

    await waitFor(() => {
      expect(updateMeMock).toHaveBeenCalled();
    });
    expect(updateMeMock.mock.calls[0][0]).not.toHaveProperty('phone');
    expect(onUpdated).toHaveBeenCalled();

    // CA-P05: tras guardar, los valores se rebasan y el botón deja de estar sucio.
    await screen.findByText('Perfil actualizado correctamente.');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    });
  });

  it('PIF-02 (P-03/CA-P03) — el teléfono se valida en cliente con el patrón E.164', async () => {
    const invalidos = ['+57', '3001234567', 'teléfono'];
    for (const phone of invalidos) {
      const harness = renderForm();
      fireEvent.change(screen.getByLabelText(/Teléfono/i), { target: { value: phone } });
      fillPersonalName('Ada Augusta');
      submitPersonal();

      expect(screen.getByLabelText(/Teléfono/i)).toBeInvalid();
      expect(updateMeMock).not.toHaveBeenCalled();
      harness.unmount();
    }

    const { onUpdated } = renderForm();
    fireEvent.change(screen.getByLabelText(/Teléfono/i), {
      target: { value: '+573009998877' },
    });
    fillPersonalName('Ada Augusta');
    submitPersonal();

    await waitFor(() => {
      expect(updateMeMock).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+573009998877' }),
      );
    });
    expect(onUpdated).toHaveBeenCalled();
  });

  it("PIF-03 (P-06/CA-P04) — vaciar un campo opcional emite null y nunca ''", async () => {
    renderForm({ profile: buildProfile({ jobTitle: 'Soporte' }) });

    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: '' } });
    fillPersonalName('Ada Augusta');
    submitPersonal();

    await waitFor(() => {
      expect(updateMeMock).toHaveBeenCalled();
    });
    const dto = updateMeMock.mock.calls[0][0] as Record<string, unknown>;
    // undefined = no tocar, null = borrar, '' no es un valor válido y no se envía.
    expect(dto.jobTitle).toBeNull();
    expect(Object.values(dto)).not.toContain('');
    expect(Object.values(dto)).not.toContain(undefined);
  });

  it('PIF-03b (P-06/C-1/CA-P04) — vaciar un teléfono con valor previo emite {phone: null}', async () => {
    // Caso nominal C-1: misma ruta trackText('phone',…) que PIF-03 cubre con
    // jobTitle. El campo acepta '' (literal permitido) y el DTO emite null.
    renderForm({ profile: buildProfile({ phone: '+573001234567' }) });

    fireEvent.change(screen.getByLabelText(/Teléfono/i), { target: { value: '' } });
    fillPersonalName('Ada Augusta');
    submitPersonal();

    await waitFor(() => {
      expect(updateMeMock).toHaveBeenCalled();
    });
    const dto = updateMeMock.mock.calls[0][0] as Record<string, unknown>;
    expect(dto.phone).toBeNull();
    expect(Object.values(dto)).not.toContain('');
    expect(Object.values(dto)).not.toContain(undefined);
  });

  it('PIF-04 (P-02/C-2) — el cambio de email no impone sincronización con la empresa', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Nuevo email de acceso'), {
      target: { value: 'nueva@prueba.local' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'clave-actual-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar email de acceso' }));

    await waitFor(() => {
      expect(changeLoginEmailMock).toHaveBeenCalled();
    });
    const dto = changeLoginEmailMock.mock.calls[0][1] as Record<string, unknown>;
    expect(dto).toEqual(
      expect.objectContaining({
        email: 'nueva@prueba.local',
        currentPassword: 'clave-actual-1',
      }),
    );
    expect(dto.syncCompanyContactEmail).not.toBe(true);
  });

  it('PIF-05 (P-08/CA-P06) — el resultado del guardado se anuncia con región viva', async () => {
    const first = renderForm();

    // El contrato FormStatus exige contenedor persistente por formulario:
    // las dos regiones (datos personales + email) se montan vacías desde el
    // primer render. Montar región y contenido en el mismo tick hace que el
    // lector pierda el anuncio.
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(getLiveRegion('personal-info-status')).toHaveAttribute('role', 'status');
    expect(getLiveRegion('login-email-status')).toHaveAttribute('role', 'status');
    expect(getLiveRegion('personal-info-status')).toBeEmptyDOMElement();
    expect(getLiveRegion('login-email-status')).toBeEmptyDOMElement();

    fillPersonalName('Ada Augusta');
    submitPersonal();
    await waitFor(() => {
      expect(getLiveRegion('personal-info-status')).toHaveTextContent(
        'Perfil actualizado correctamente.',
      );
    });
    first.unmount();

    updateMeMock.mockRejectedValue(new Error('red caída'));
    renderForm();
    fillPersonalName('Ada Augusta');
    submitPersonal();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No fue posible guardar los cambios. Intenta de nuevo.',
      );
    });
  });

  it('renderiza los valores del perfil y la sección de email', () => {
    renderForm();

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ada');
    expect(screen.getByLabelText('Apellido')).toHaveValue('Lovelace');
    expect(screen.getByLabelText(/Teléfono/i)).toHaveValue('+573001234567');
    expect(screen.getByLabelText('Cargo')).toHaveValue('Administración');
    expect(screen.getByLabelText('Email actual')).toHaveValue('ada@prueba.local');
    expect(screen.getByRole('heading', { name: 'Datos personales' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Email de acceso' })).toBeInTheDocument();
  });

  it('usa el prefijo del país del tenant como ayuda de formato', () => {
    renderForm({ profile: buildProfile({ phone: null }), tenantCountry: 'US' });

    expect(screen.getByLabelText(/Teléfono/i)).toHaveAttribute(
      'placeholder',
      expect.stringContaining('+1'),
    );
  });

  it('muestra un error controlado cuando el guardado falla', async () => {
    updateMeMock.mockRejectedValue(new Error('red caída'));
    renderForm();

    fillPersonalName('Ada Augusta');
    submitPersonal();

    expect(
      await screen.findByText('No fue posible guardar los cambios. Intenta de nuevo.'),
    ).toBeInTheDocument();
  });

  it('el cambio de email exige confirmar con la contraseña actual', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Nuevo email de acceso'), {
      target: { value: 'nueva@prueba.local' },
    });
    // Vacío, no corto: la confirmación de email solo exige campo no vacío
    // (P-14, Ola 2: una credencial legada corta debe poder confirmar).
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar email de acceso' }));

    expect(await screen.findByText('Debes confirmar con tu contraseña actual')).toBeInTheDocument();
    expect(changeLoginEmailMock).not.toHaveBeenCalled();
  });

  it('el cambio de email fallido muestra un error controlado', async () => {
    changeLoginEmailMock.mockRejectedValueOnce(new Error('red caída'));
    renderForm();

    fireEvent.change(screen.getByLabelText('Nuevo email de acceso'), {
      target: { value: 'nueva@prueba.local' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'clave-actual-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar email de acceso' }));

    expect(
      await screen.findByText(
        'No fue posible actualizar el email de acceso. Verifica la contraseña actual.',
      ),
    ).toBeInTheDocument();
  });

  it('el cambio de tipo de documento viaja cuando se elige una opción', async () => {
    const { onUpdated } = renderForm();

    fireEvent.click(screen.getByRole('combobox', { name: 'Tipo de documento' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cédula de ciudadanía' }));
    fillPersonalName('Ada Augusta');
    submitPersonal();

    await waitFor(() => {
      expect(updateMeMock).toHaveBeenCalledWith(expect.objectContaining({ documentType: 'CC' }));
    });
    expect(onUpdated).toHaveBeenCalled();
  });

  it('el cambio de email exitoso notifica y re-basa el formulario', async () => {
    const { onUpdated } = renderForm();

    fireEvent.change(screen.getByLabelText('Nuevo email de acceso'), {
      target: { value: 'nueva@prueba.local' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'clave-actual-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar email de acceso' }));

    await waitFor(() => {
      expect(changeLoginEmailMock).toHaveBeenCalledWith(
        'user-uuid-001',
        expect.objectContaining({
          email: 'nueva@prueba.local',
          currentPassword: 'clave-actual-1',
        }),
      );
    });
    expect(onUpdated).toHaveBeenCalled();
    expect(
      await screen.findByText('Email de acceso actualizado correctamente.'),
    ).toBeInTheDocument();
  });

  it('el aviso de éxito se oculta solo tras unos segundos', async () => {
    renderForm();

    fillPersonalName('Ada Augusta');
    submitPersonal();
    await screen.findByText('Perfil actualizado correctamente.');

    await waitFor(
      () => {
        expect(screen.queryByText('Perfil actualizado correctamente.')).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('el aviso de email actualizado se oculta solo tras unos segundos', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Nuevo email de acceso'), {
      target: { value: 'nueva@prueba.local' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'clave-actual-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar email de acceso' }));
    await screen.findByText('Email de acceso actualizado correctamente.');

    await waitFor(
      () => {
        expect(
          screen.queryByText('Email de acceso actualizado correctamente.'),
        ).not.toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('formulario con errores visibles sin violaciones de accesibilidad', async () => {
    const { container } = renderForm();

    updateMeMock.mockRejectedValueOnce(new Error('red caída'));
    fillPersonalName('Ada Augusta');
    submitPersonal();
    await screen.findByText('No fue posible guardar los cambios. Intenta de nuevo.');

    expect(await axe(container)).toHaveNoViolations();
  });
});
