// apps/portal/src/components/operations/OperationsUserPicker.spec.tsx
// Picker de personas sobre el typeahead `GET /users/search` (spec de diseño
// §4.8; CA-08: ningún montaje recorre el directorio). Cubre la resolución D-P1
// (Salida 2): el 403 del endpoint para perfiles sin acceso al buscador NUNCA
// se degrada en silencio — se mapea a un aviso visible y accionable.
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, usersApi } from '@/lib/api-client';
import { OperationsUserPicker } from './OperationsUserPicker';

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  usersApi: {
    searchForPicker: jest.fn(),
  },
}));

const UNAVAILABLE_TITLE = 'No puedes buscar personas';
const UNAVAILABLE_DESCRIPTION =
  'Tu perfil no tiene acceso al buscador de personas. La bandeja funciona igual sin este filtro: la persona asignada aparece en cada orden.';

function renderPicker(props: Partial<ComponentProps<typeof OperationsUserPicker>> = {}) {
  const onChange = jest.fn();
  render(
    <OperationsUserPicker
      id="assignee-filter"
      label="Asignado a"
      value={null}
      onChange={onChange}
      unavailableTitle={UNAVAILABLE_TITLE}
      unavailableDescription={UNAVAILABLE_DESCRIPTION}
      {...props}
    />,
  );
  return { onChange };
}

describe('OperationsUserPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('busca con el typeahead canónico (q + límite ≤20) y entrega la selección', async () => {
    const user = userEvent.setup();
    jest.mocked(usersApi.searchForPicker).mockResolvedValue({
      data: [{ id: 'user-001', label: 'Carlos López', sublabel: 'Técnico' }],
      total: 1,
    } as never);
    const { onChange } = renderPicker();

    await user.type(screen.getByRole('combobox'), 'car');

    const option = await screen.findByRole('option', { name: 'Carlos López — Técnico' });
    await user.click(option);

    expect(usersApi.searchForPicker).toHaveBeenCalledWith(
      { q: 'car', limit: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(onChange).toHaveBeenCalledWith({
      id: 'user-001',
      label: 'Carlos López',
      sublabel: 'Técnico',
    });
  });

  it('D-P1 (Salida 2): un 403 muestra el aviso visible y accionable, nunca silencioso', async () => {
    const user = userEvent.setup();
    jest
      .mocked(usersApi.searchForPicker)
      .mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Sin permiso'));
    renderPicker();

    await user.type(screen.getByRole('combobox'), 'car');

    // El aviso aparece con el copy recibido por props (título + salida).
    expect(await screen.findByText(UNAVAILABLE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(UNAVAILABLE_DESCRIPTION)).toBeInTheDocument();
    // El listbox queda vacío, sin errores técnicos crudos.
    expect(await screen.findByText('Sin resultados de la búsqueda')).toBeInTheDocument();
    expect(screen.queryByText('No fue posible cargar personas.')).not.toBeInTheDocument();
  });

  it('un error distinto de 403 sí escala al estado de error del picker con reintento', async () => {
    const user = userEvent.setup();
    jest
      .mocked(usersApi.searchForPicker)
      .mockRejectedValue(new ApiError(500, 'INTERNAL', 'Fallo interno'));
    renderPicker();

    await user.type(screen.getByRole('combobox'), 'car');

    expect(await screen.findByText('No fue posible cargar personas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE_TITLE)).not.toBeInTheDocument();
  });

  it('muestra la etiqueta del valor actual (S0) sin lanzar búsqueda', () => {
    renderPicker({
      value: 'user-009',
      selectedItem: { label: 'Laura Ruiz' },
    });

    expect(screen.getByRole('combobox')).toHaveValue('Laura Ruiz');
    expect(usersApi.searchForPicker).not.toHaveBeenCalled();
  });

  it('propaga el mensaje de validación del campo cuando existe error', () => {
    renderPicker({ error: 'Selecciona un responsable' });

    expect(screen.getByText('Selecciona un responsable')).toBeInTheDocument();
  });
});
