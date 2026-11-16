/**
 * Configuración → Importaciones → «Usuarios de UISP» (spec 2026-11-15 «usuarios» §2.1–§2.4;
 * plan 2026-11-15 bloque F).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  UserRole,
  type MigrationSourceConnection,
  type MigrationUispUser,
  type MigrationUispUsersListMeta,
} from '@iwana/shared';
import { ApiError, migrationApi } from '@/lib/api-client';
import { MigrationUispUsersSection } from './MigrationUispUsersSection';

const APP_KEY = 'clave-de-prueba-123';
const FINGERPRINT = 'AB'.repeat(32);

function connection(overrides: Partial<MigrationSourceConnection> = {}): MigrationSourceConnection {
  return {
    baseUrl: 'https://uisp.ejemplo.test',
    hasAppKey: true,
    trustedCertificateSha256: null,
    lastCheckedAt: '2026-11-15T10:00:00.000Z',
    lastCheckResult: 'OK',
    updatedAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}

function uispUser(n: number, overrides: Partial<MigrationUispUser> = {}): MigrationUispUser {
  return {
    id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
    uispUserId: 1000 + n,
    displayName: `Persona ${n}`,
    email: `persona${n}@ejemplo.test`,
    isActiveInUisp: true,
    source: 'API',
    status: 'PENDIENTE',
    matchedUserId: null,
    targetUserId: null,
    proposedRole: null,
    referencedInBatches: 1,
    ...overrides,
  };
}

function list(
  data: MigrationUispUser[],
  lastFetchedAt: string | null = '2026-11-15T09:00:00.000Z',
) {
  const meta: MigrationUispUsersListMeta = { total: data.length, lastFetchedAt };
  return { data, meta };
}

let connectionSpy: jest.SpyInstance;
let listSpy: jest.SpyInstance;
beforeEach(() => {
  connectionSpy = jest.spyOn(migrationApi, 'getUispConnection').mockResolvedValue(connection());
  listSpy = jest.spyOn(migrationApi, 'listUispUsers').mockResolvedValue(list([]));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('Conexión con UISP', () => {
  it('sin conexión pide la dirección https y la clave antes de guardar', async () => {
    connectionSpy.mockResolvedValue(null);
    const saveSpy = jest.spyOn(migrationApi, 'saveUispConnection');
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    expect(await screen.findByText('Aún no hay conexión con UISP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Traer usuarios de UISP/ })).toBeDisabled();

    await user.type(screen.getByLabelText('Dirección de UISP'), 'http://uisp.ejemplo.test');
    await user.click(screen.getByRole('button', { name: 'Probar y guardar' }));
    expect(
      screen.getByText('Escribe la dirección completa de UISP, que empiece por https://.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Escribe la clave de aplicación de UISP.')).toBeInTheDocument();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('guarda con la huella normalizada y luego no vuelve a mostrar la clave', async () => {
    connectionSpy.mockResolvedValue(null);
    const saveSpy = jest
      .spyOn(migrationApi, 'saveUispConnection')
      .mockResolvedValue(connection({ trustedCertificateSha256: 'ab'.repeat(32) }));
    const user = userEvent.setup();
    const { container } = render(<MigrationUispUsersSection />);
    await user.type(await screen.findByLabelText('Dirección de UISP'), 'https://uisp.ejemplo.test');
    const keyInput = screen.getByLabelText('Clave de aplicación');
    expect(keyInput).toHaveAttribute('type', 'password');
    await user.type(keyInput, APP_KEY);

    await user.click(screen.getByLabelText('Confiar en este certificado'));
    const fingerprintInput = screen.getByLabelText('Huella SHA-256 del certificado');
    await user.type(fingerprintInput, '12:34');
    await user.click(screen.getByRole('button', { name: 'Probar y guardar' }));
    expect(screen.getByText(/La huella debe tener 64 caracteres/)).toBeInTheDocument();
    expect(saveSpy).not.toHaveBeenCalled();

    await user.clear(fingerprintInput);
    // Con dos puntos, como la muestran los navegadores.
    await user.type(fingerprintInput, FINGERPRINT.match(/.{2}/gu)!.join(':'));
    await user.click(screen.getByRole('button', { name: 'Probar y guardar' }));

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith({
        baseUrl: 'https://uisp.ejemplo.test',
        appKey: APP_KEY,
        trustedCertificateSha256: 'ab'.repeat(32),
      }),
    );
    expect(
      await screen.findByText('Conexión guardada. UISP respondió correctamente.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Guardada; no se muestra')).toBeInTheDocument();
    expect(screen.queryByLabelText('Clave de aplicación')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain(APP_KEY);

    // Reemplazar la clave abre el formulario con el campo vacío.
    await user.click(screen.getByRole('button', { name: 'Reemplazar clave' }));
    expect(screen.getByLabelText('Nueva clave de aplicación')).toHaveValue('');
    expect(screen.getByLabelText('Dirección de UISP')).toHaveValue('https://uisp.ejemplo.test');
  });

  it('traduce el motivo del fallo de UISP al guardar', async () => {
    connectionSpy.mockResolvedValue(null);
    jest.spyOn(migrationApi, 'saveUispConnection').mockRejectedValue(
      new ApiError(502, 'MIGRATION_SOURCE_UNREACHABLE', 'x', {
        reason: 'CERTIFICADO_NO_CONFIABLE',
      }),
    );
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.type(await screen.findByLabelText('Dirección de UISP'), 'https://uisp.ejemplo.test');
    await user.type(screen.getByLabelText('Clave de aplicación'), APP_KEY);
    await user.click(screen.getByRole('button', { name: 'Probar y guardar' }));
    expect(
      await screen.findByText(/UISP usa un certificado que no es de una entidad reconocida/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/CERTIFICADO_NO_CONFIABLE/)).not.toBeInTheDocument();
  });

  it('probar la conexión muestra el estado y la clave rechazada en español', async () => {
    const testSpy = jest
      .spyOn(migrationApi, 'testUispConnection')
      .mockRejectedValueOnce(
        new ApiError(422, 'MIGRATION_SOURCE_UNAUTHORIZED', 'x', { reason: 'CREDENCIAL_RECHAZADA' }),
      )
      .mockResolvedValueOnce(connection());
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    expect(await screen.findAllByText('Conexión correcta')).not.toHaveLength(0);
    expect(screen.getByText(/Conexión correcta · /)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Probar conexión' }));
    expect(await screen.findByText(/UISP rechazó la clave de aplicación/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Probar conexión' }));
    expect(await screen.findByText('UISP respondió correctamente.')).toBeInTheDocument();
    expect(testSpy).toHaveBeenCalledTimes(2);
  });

  it('retirar pide confirmación', async () => {
    const removeSpy = jest.spyOn(migrationApi, 'removeUispConnection').mockResolvedValue();
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByRole('button', { name: 'Retirar' }));
    let dialog = await screen.findByRole('dialog', { name: 'Retirar la conexión con UISP' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(removeSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Retirar' }));
    dialog = await screen.findByRole('dialog', { name: 'Retirar la conexión con UISP' });
    await user.click(within(dialog).getByRole('button', { name: 'Retirar' }));
    await waitFor(() => expect(removeSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Conexión retirada/)).toBeInTheDocument();
    expect(screen.getByLabelText('Dirección de UISP')).toBeInTheDocument();
  });
});

describe('Traer usuarios de UISP', () => {
  it('lanza la lectura y sondea hasta que cambia la última lectura', async () => {
    jest.useFakeTimers();
    listSpy
      .mockResolvedValueOnce(list([], null))
      .mockResolvedValueOnce(list([], null))
      .mockResolvedValue(list([uispUser(1)], '2026-11-15T11:00:00.000Z'));
    const fetchSpy = jest
      .spyOn(migrationApi, 'fetchUispUsers')
      .mockResolvedValue({ status: 'EN_CURSO', requestedAt: '2026-11-15T11:00:00.000Z' });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<MigrationUispUsersSection />);
    expect(await screen.findByText('Aún no has traído usuarios de UISP')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Traer usuarios de UISP/ }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const status = await screen.findByText('Trayendo usuarios… La lista se actualiza sola.');
    expect(status).toHaveAttribute('aria-live', 'polite');

    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    expect(screen.getByText('Trayendo usuarios… La lista se actualiza sola.')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    expect(await screen.findByText('Lista actualizada: 1 usuario de UISP.')).toBeInTheDocument();
    expect(screen.getByText('Persona 1')).toBeInTheDocument();
    const calls = listSpy.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(8_000);
    });
    expect(listSpy).toHaveBeenCalledTimes(calls);
  });

  it('para el sondeo y lo explica si la lectura falló por la clave', async () => {
    jest.useFakeTimers();
    connectionSpy
      .mockResolvedValueOnce(connection())
      .mockResolvedValue(
        connection({ lastCheckedAt: '2026-11-15T11:00:05.000Z', lastCheckResult: 'UNAUTHORIZED' }),
      );
    jest
      .spyOn(migrationApi, 'fetchUispUsers')
      .mockResolvedValue({ status: 'EN_CURSO', requestedAt: '2026-11-15T11:00:00.000Z' });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByRole('button', { name: /Traer usuarios de UISP/ }));
    expect(await screen.findByText(/Trayendo usuarios…/)).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    expect(
      await screen.findByText(/No pudimos traer los usuarios: UISP rechazó la clave/),
    ).toBeInTheDocument();
    expect(screen.getByText('Clave rechazada')).toBeInTheDocument();
  });

  it('sin conexión configurada en el servidor lo dice en español', async () => {
    jest
      .spyOn(migrationApi, 'fetchUispUsers')
      .mockRejectedValue(new ApiError(409, 'MIGRATION_SOURCE_NOT_CONFIGURED', 'x'));
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByRole('button', { name: /Traer usuarios de UISP/ }));
    expect(await screen.findByText('Configura primero la conexión con UISP.')).toBeInTheDocument();
  });
});

describe('Lista de revisión', () => {
  const MATCHED = '00000000-0000-4000-8000-0000000009aa';
  const rows = [
    uispUser(1, { matchedUserId: MATCHED }),
    uispUser(2, { isActiveInUisp: false }),
    uispUser(3, {
      source: 'SIN_DATOS',
      displayName: null,
      email: null,
      isActiveInUisp: null,
      referencedInBatches: 2,
    }),
    uispUser(4, {
      status: 'CREADO',
      displayName: null,
      email: null,
      targetUserId: MATCHED,
      proposedRole: UserRole.TECHNICIAN,
    }),
  ];

  beforeEach(() => {
    listSpy.mockResolvedValue(list(rows));
  });

  function table() {
    return screen.getByRole('table', { name: 'Usuarios de UISP para revisar' });
  }

  it('muestra los pendientes por defecto, sin códigos, y filtra por estado', async () => {
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    expect(await screen.findByText('Persona 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pendientes/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const body = within(table());
    expect(body.getByText('Usuario de UISP n.º 1003 (sin datos)')).toBeInTheDocument();
    expect(body.getByText('Mismo correo')).toBeInTheDocument();
    expect(body.getByText('Inactivo')).toBeInTheDocument();
    expect(body.getByText('Sin correo')).toBeInTheDocument();
    expect(body.queryByText('Usuario de UISP n.º 1004')).not.toBeInTheDocument();
    expect(body.queryByText(/PENDIENTE|SIN_DATOS|TECHNICIAN/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Creados/ }));
    const created = within(table());
    expect(created.getByText('Usuario de UISP n.º 1004')).toBeInTheDocument();
    expect(created.getByText('Técnico de campo')).toBeInTheDocument();
    expect(created.queryByText('Persona 1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Descartados/ }));
    expect(screen.getByText('No hay usuarios en «Descartados»')).toBeInTheDocument();
  });

  it('crear en lote envía el rol y pide el nombre de los «sin datos»', async () => {
    const resolveSpy = jest.spyOn(migrationApi, 'resolveUispUsers').mockResolvedValue([]);
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByLabelText('Seleccionar todos los usuarios visibles'));
    expect(screen.getByText('3 usuarios seleccionados.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear (3)' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Rol para crear'), UserRole.TECHNICIAN);
    const roleOptions = within(screen.getByLabelText('Rol para crear'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(roleOptions).not.toContain('Suscriptor');
    expect(roleOptions).not.toContain('Aliado');
    await user.click(screen.getByRole('button', { name: 'Crear (3)' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Crear 3 usuarios como Técnico de campo',
    });
    const operational = within(dialog).getByLabelText(/Mostrar en Programación/);
    expect(operational).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(within(dialog).getByText('Escribe un nombre para este usuario.')).toBeInTheDocument();
    expect(resolveSpy).not.toHaveBeenCalled();

    await user.type(
      within(dialog).getByLabelText('Nombre para el usuario de UISP n.º 1003'),
      '  Antiguo técnico ',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));

    await waitFor(() =>
      expect(resolveSpy).toHaveBeenCalledWith({
        items: [
          {
            id: rows[0]!.id,
            action: 'CREAR',
            role: UserRole.TECHNICIAN,
            isOperationalResource: true,
          },
          { id: rows[1]!.id, action: 'CREAR', role: UserRole.TECHNICIAN },
          {
            id: rows[2]!.id,
            action: 'CREAR',
            role: UserRole.TECHNICIAN,
            displayName: 'Antiguo técnico',
          },
        ],
      }),
    );
    expect(await screen.findByText(/3 usuarios creados sin acceso/)).toBeInTheDocument();
    expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('enlazar envía solo las filas con coincidencia', async () => {
    const resolveSpy = jest.spyOn(migrationApi, 'resolveUispUsers').mockResolvedValue([]);
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByLabelText('Seleccionar a Persona 1'));
    await user.click(screen.getByLabelText('Seleccionar a Persona 2'));
    await user.click(screen.getByRole('button', { name: 'Enlazar (1)' }));
    await waitFor(() =>
      expect(resolveSpy).toHaveBeenCalledWith({
        items: [{ id: rows[0]!.id, action: 'ENLAZAR' }],
      }),
    );
    expect(
      await screen.findByText(
        /1 usuario enlazado con su usuario de iWana\. 1 seleccionado no tenía/,
      ),
    ).toBeInTheDocument();
  });

  it('enlazar sin un usuario de iWana con el mismo correo lo explica', async () => {
    jest
      .spyOn(migrationApi, 'resolveUispUsers')
      .mockRejectedValue(
        new ApiError(422, 'MIGRATION_MAPPING_TARGET_INVALID', 'x', { reason: 'SIN_COINCIDENCIA' }),
      );
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByLabelText('Seleccionar a Persona 1'));
    await user.click(screen.getByRole('button', { name: 'Enlazar (1)' }));
    expect(
      await screen.findByText(
        'Ese usuario no tiene un usuario de iWana con el mismo correo para enlazar.',
      ),
    ).toBeInTheDocument();
  });

  it('un usuario ya revisado por otra persona se explica sin códigos', async () => {
    jest
      .spyOn(migrationApi, 'resolveUispUsers')
      .mockRejectedValue(new ApiError(409, 'MIGRATION_UISP_USER_ALREADY_RESOLVED', 'x'));
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByLabelText('Seleccionar a Persona 1'));
    await user.click(screen.getByRole('button', { name: 'Enlazar (1)' }));
    expect(await screen.findByText('Ese usuario de UISP ya se revisó.')).toBeInTheDocument();
  });

  it('descartar pide confirmación y envía las filas pendientes', async () => {
    const resolveSpy = jest.spyOn(migrationApi, 'resolveUispUsers').mockResolvedValue([]);
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByLabelText('Seleccionar a Persona 2'));
    await user.click(screen.getByRole('button', { name: 'Descartar (1)' }));
    let dialog = await screen.findByRole('dialog', { name: 'Descartar 1 usuario de UISP' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(resolveSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Descartar (1)' }));
    dialog = await screen.findByRole('dialog', { name: 'Descartar 1 usuario de UISP' });
    await user.click(within(dialog).getByRole('button', { name: 'Descartar' }));
    await waitFor(() =>
      expect(resolveSpy).toHaveBeenCalledWith({
        items: [{ id: rows[1]!.id, action: 'DESCARTAR' }],
      }),
    );
  });

  it('un rol no permitido se explica sin códigos', async () => {
    jest
      .spyOn(migrationApi, 'resolveUispUsers')
      .mockRejectedValue(new ApiError(422, 'MIGRATION_USER_ROLE_NOT_ALLOWED', 'x'));
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByLabelText('Seleccionar a Persona 2'));
    await user.selectOptions(screen.getByLabelText('Rol para crear'), UserRole.SUPPORT);
    await user.click(screen.getByRole('button', { name: 'Crear (1)' }));
    const dialog = await screen.findByRole('dialog', { name: /Crear 1 usuario como/ });
    // Un inactivo nunca va a Programación: no se ofrece la casilla.
    expect(within(dialog).queryByLabelText(/Mostrar en Programación/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(
      await screen.findByText('Ese rol no se puede asignar a un usuario importado.'),
    ).toBeInTheDocument();
  });

  it('invita a los creados y muestra invitados y omitidos', async () => {
    const inviteSpy = jest
      .spyOn(migrationApi, 'inviteUispUsers')
      .mockResolvedValue({ invitados: 1, omitidos: 1 });
    const extra = uispUser(5, {
      status: 'CREADO',
      displayName: null,
      email: null,
      targetUserId: MATCHED,
    });
    listSpy.mockResolvedValue(list([...rows, extra]));
    const user = userEvent.setup();
    render(<MigrationUispUsersSection />);
    await user.click(await screen.findByRole('button', { name: /Creados/ }));
    expect(screen.getByRole('button', { name: 'Enviar invitación' })).toBeDisabled();
    await user.click(screen.getByLabelText('Seleccionar todos los usuarios visibles'));
    expect(screen.getByRole('button', { name: 'Crear' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Enviar invitación (2)' }));
    await waitFor(() => expect(inviteSpy).toHaveBeenCalledWith([rows[3]!.id, extra.id]));
    expect(
      await screen.findByText(/Enviamos 1 invitación\. 1 usuario no la recibió/),
    ).toBeInTheDocument();
  });
});
