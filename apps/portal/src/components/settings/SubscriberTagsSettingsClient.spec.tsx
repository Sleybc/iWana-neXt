/**
 * Ajustes → Etiquetas de suscriptor (ADR-110 D8, plan transversal importación UISP, bloque T).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessPermissionKey, UserRole, type SubscriberTag } from '@iwana/shared';
import { ApiError, subscriberTagsApi } from '@/lib/api-client';
import { SubscriberTagsSettingsClient } from './SubscriberTagsSettingsClient';

const mockRole = { current: UserRole.ADMIN as UserRole };
const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        get user() {
          return { role: mockRole.current };
        },
      });
  })(),
}));
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key),
      });
  })(),
}));

function tag(n: number, name: string, assignedCount: number, color = '#2563EB'): SubscriberTag {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    name,
    color,
    assignedCount,
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
  };
}

const VIP = tag(1, 'VIP', 12);
const MOROSO = tag(2, 'Moroso', 1, '#DC2626');

function grantAll() {
  mockGranted.current = new Set([
    AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
  ]);
}

describe('SubscriberTagsSettingsClient', () => {
  beforeEach(() => {
    mockRole.current = UserRole.ADMIN;
    grantAll();
    jest.spyOn(subscriberTagsApi, 'list').mockResolvedValue([MOROSO, VIP]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('lista el catálogo con cuántos suscriptores tiene cada etiqueta', async () => {
    render(<SubscriberTagsSettingsClient />);
    const list = await screen.findByRole('list', { name: 'Etiquetas de suscriptor' });
    expect(within(list).getByText('12 suscriptores')).toBeInTheDocument();
    expect(within(list).getByText('1 suscriptor')).toBeInTheDocument();
  });

  it('crea una etiqueta con nombre y color en hexadecimal', async () => {
    const created = tag(3, 'Empresarial', 0, '#16A34A');
    const create = jest.spyOn(subscriberTagsApi, 'create').mockResolvedValue(created);
    render(<SubscriberTagsSettingsClient />);
    await screen.findByRole('list', { name: 'Etiquetas de suscriptor' });

    const form = screen.getByRole('form', { name: 'Nueva etiqueta' });
    await userEvent.type(within(form).getByLabelText('Nombre'), '  Empresarial ');
    const hex = within(form).getByLabelText('Código de color');
    await userEvent.clear(hex);
    await userEvent.type(hex, '#16a34a');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear etiqueta' }));

    expect(create).toHaveBeenCalledWith({ name: 'Empresarial', color: '#16A34A' });
    expect(await screen.findByText('Etiqueta «Empresarial» creada.')).toBeInTheDocument();
    expect(screen.getByText('0 suscriptores')).toBeInTheDocument();
  });

  it('valida en el navegador y muestra el nombre repetido que devuelve la API', async () => {
    const create = jest
      .spyOn(subscriberTagsApi, 'create')
      .mockRejectedValue(new ApiError(409, 'SUBSCRIBER_TAG_NAME_TAKEN', 'dup'));
    render(<SubscriberTagsSettingsClient />);
    await screen.findByRole('list', { name: 'Etiquetas de suscriptor' });
    const form = screen.getByRole('form', { name: 'Nueva etiqueta' });

    await userEvent.click(within(form).getByRole('button', { name: 'Crear etiqueta' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Escribe el nombre de la etiqueta.');
    expect(create).not.toHaveBeenCalled();

    await userEvent.type(within(form).getByLabelText('Nombre'), 'vip');
    const hex = within(form).getByLabelText('Código de color');
    await userEvent.clear(hex);
    await userEvent.type(hex, '#12');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear etiqueta' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(/#RRGGBB/);

    await userEvent.clear(hex);
    await userEvent.type(hex, '#123456');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear etiqueta' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Ya existe una etiqueta con ese nombre.',
    );
  });

  it('renombra una etiqueta enviando solo lo que cambió', async () => {
    const update = jest
      .spyOn(subscriberTagsApi, 'update')
      .mockResolvedValue({ ...VIP, name: 'Cliente VIP', updatedAt: '2026-11-11T01:00:00.000Z' });
    render(<SubscriberTagsSettingsClient />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar etiqueta VIP' }));
    const form = screen.getByRole('form', { name: 'Editar etiqueta VIP' });
    const name = within(form).getByLabelText('Nombre');
    await userEvent.clear(name);
    await userEvent.type(name, 'Cliente VIP');
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar' }));

    expect(update).toHaveBeenCalledWith(VIP.id, { name: 'Cliente VIP' });
    expect(await screen.findByText('Cliente VIP')).toBeInTheDocument();
  });

  it('elimina tras confirmar e informa a cuántos suscriptores se les quitará', async () => {
    const remove = jest.spyOn(subscriberTagsApi, 'remove').mockResolvedValue(undefined);
    render(<SubscriberTagsSettingsClient />);
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar etiqueta VIP' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('La etiqueta «VIP» se quitará de 12 suscriptores.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar etiqueta' }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(VIP.id));
    expect(await screen.findByText('Etiqueta «VIP» eliminada.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar etiqueta VIP' })).not.toBeInTheDocument();
  });

  it('para un rol no administrador queda en solo lectura', async () => {
    mockRole.current = UserRole.SALES;
    render(<SubscriberTagsSettingsClient />);
    await screen.findByRole('list', { name: 'Etiquetas de suscriptor' });
    expect(screen.getByText('Solo lectura')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Nueva etiqueta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar etiqueta/ })).not.toBeInTheDocument();
  });

  it('sin acceso a suscriptores no consulta el catálogo', () => {
    mockGranted.current = new Set();
    render(<SubscriberTagsSettingsClient />);
    expect(screen.getByText('No tienes acceso a esta sección')).toBeInTheDocument();
    expect(subscriberTagsApi.list).not.toHaveBeenCalled();
  });

  it('catálogo vacío y error con reintento', async () => {
    jest
      .spyOn(subscriberTagsApi, 'list')
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce([]);
    render(<SubscriberTagsSettingsClient />);
    expect(await screen.findByText('No pudimos cargar las etiquetas.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Aún no hay etiquetas')).toBeInTheDocument();
  });
});
