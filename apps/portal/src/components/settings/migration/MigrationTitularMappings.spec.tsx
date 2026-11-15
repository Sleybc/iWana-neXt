/**
 * Importaciones → «Titulares existentes» (spec 2026-11-15 complementar titular §2.7, bloque F).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MigrationBatchCounts, MigrationPendingValue } from '@iwana/shared';
import {
  ApiError,
  billingCyclesApi,
  migrationApi,
  subscribersApi,
  type SubscriberRecord,
} from '@/lib/api-client';
import { MigrationMappingEditor } from './MigrationMappingEditor';

const CANDIDATE = '00000000-0000-4000-8000-0000000000c1';
const TITULAR: MigrationPendingValue = {
  kind: 'TITULAR',
  externalValue: 'uisp:client:22',
  externalLabel: null,
  occurrences: 1,
  candidateRef: CANDIDATE,
};
const CICLO: MigrationPendingValue = {
  kind: 'CICLO',
  externalValue: '5',
  externalLabel: 'Día 5',
  occurrences: 3,
};
const COUNTS = {
  procesamiento: 'COMPLETADO',
  archivos: { recibidos: 1, leidos: 1, rechazados: {} },
  entidades: {
    SUSCRIPTOR: { leidos: 1, validos: 0, rechazados: 1 },
    CONTRATO: { leidos: 2, validos: 0, rechazados: 2 },
    DOCUMENTO_COBRO: { leidos: 12, validos: 0, rechazados: 12 },
    PAGO: { leidos: 9, validos: 0, rechazados: 9 },
  },
  observaciones: { CRUCE_CON_FACTURACION_IWANA: 3 },
  tareasSinFuente: 0,
  pendientesEquivalencia: [],
  titulares: { complementados: 0 },
  procesadoEn: '2026-11-15T10:00:00.000Z',
} as unknown as MigrationBatchCounts;

const SUBSCRIBER = {
  id: CANDIDATE,
  personType: 'NATURAL',
  firstName: 'Ana',
  lastName: 'Pérez',
  businessName: null,
  documentType: 'CC',
  documentNumber: '1020304050',
  nit: null,
  status: 'ACTIVE',
  convertedAt: '2024-03-10T15:00:00.000Z',
  activatedAt: null,
  createdAt: '2024-01-01T15:00:00.000Z',
  anonymizedAt: null,
  privacyRestricted: false,
} as unknown as SubscriberRecord;

let getSpy: jest.SpyInstance;
beforeEach(() => {
  getSpy = jest.spyOn(subscribersApi, 'getById').mockResolvedValue(SUBSCRIBER);
  jest.spyOn(billingCyclesApi, 'list').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('Titulares existentes', () => {
  it('agrupa los titulares antes del resto y muestra el candidato con el documento enmascarado', async () => {
    render(
      <MigrationMappingEditor pending={[CICLO, TITULAR]} counts={COUNTS} onSaved={jest.fn()} />,
    );
    const group = screen.getByRole('list', { name: 'Titulares existentes' });
    expect(within(group).getByText('Cliente 22 de UISP')).toBeInTheDocument();
    expect(screen.getByText('Cargando el suscriptor de iWana…')).toBeInTheDocument();
    const link = await within(group).findByRole('link', { name: 'Ana Pérez' });
    expect(link).toHaveAttribute('href', `/dashboard/crm/subscribers/${CANDIDATE}`);
    expect(getSpy).toHaveBeenCalledWith(CANDIDATE);
    expect(group.textContent).not.toContain('1020304050');
    expect(group.textContent).toMatch(/4050/);
    expect(within(group).getByText('Activo')).toBeInTheDocument();
    expect(within(group).getByText(/2024/)).toBeInTheDocument();
    // El grupo va antes de las demás equivalencias.
    const lists = await screen.findAllByRole('list');
    expect(lists[0]).toHaveAccessibleName('Titulares existentes');
    expect(document.body.textContent).not.toMatch(/TITULAR|uisp:client/);
  });

  it('muestra el error al no poder leer el candidato y no deja complementar', async () => {
    getSpy.mockRejectedValue(new Error('x'));
    render(<MigrationMappingEditor pending={[TITULAR]} counts={COUNTS} onSaved={jest.fn()} />);
    expect(await screen.findByText('No pudimos cargar el suscriptor de iWana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Complementar este titular/ })).toBeDisabled();
  });

  it('el diálogo explica lo que hará y al confirmar guarda la equivalencia', async () => {
    const createSpy = jest.spyOn(migrationApi, 'createMapping').mockResolvedValue({} as never);
    const onSaved = jest.fn();
    const user = userEvent.setup();
    render(<MigrationMappingEditor pending={[TITULAR]} counts={COUNTS} onSaved={onSaved} />);
    await screen.findByRole('link', { name: 'Ana Pérez' });
    await user.click(screen.getByRole('button', { name: /Complementar este titular/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Complementar este titular' });
    expect(dialog).toHaveTextContent('contratos terminados');
    expect(dialog).toHaveTextContent('2 contratos, 12 facturas y 9 pagos');
    expect(dialog).toHaveTextContent('3 facturas se cruzan con la facturación de iWana');
    expect(dialog).toHaveTextContent('no cobrar dos veces');
    expect(dialog).toHaveTextContent('Solo se completan los datos que están vacíos');
    await user.click(within(dialog).getByRole('button', { name: 'Complementar' }));
    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith({
        kind: 'TITULAR',
        externalValue: 'uisp:client:22',
        externalLabel: null,
        action: 'EQUIVALE',
        targetRef: CANDIDATE,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('con el resumen del titular muestra sus propios conteos y cruces, no los del lote (D4)', async () => {
    const user = userEvent.setup();
    const withSummary: MigrationPendingValue = {
      ...TITULAR,
      titularSummary: { servicios: 1, facturas: 53, pagos: 40, tickets: 2, cruces: 1 },
    };
    render(<MigrationMappingEditor pending={[withSummary]} counts={COUNTS} onSaved={jest.fn()} />);
    await screen.findByRole('link', { name: 'Ana Pérez' });
    await user.click(screen.getByRole('button', { name: /Complementar este titular/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Complementar este titular' });
    expect(dialog).toHaveTextContent('1 servicio, 53 facturas, 40 pagos y 2 tickets');
    expect(dialog).toHaveTextContent('1 factura se cruza con la facturación de iWana');
    expect(dialog).not.toHaveTextContent('12 facturas');
  });

  it('a11y: el diálogo tiene nombre y descripción, atrapa el foco y lo devuelve al cerrar', async () => {
    const user = userEvent.setup();
    render(<MigrationMappingEditor pending={[TITULAR]} counts={COUNTS} onSaved={jest.fn()} />);
    await screen.findByRole('link', { name: 'Ana Pérez' });
    const trigger = screen.getByRole('button', {
      name: 'Complementar este titular: Cliente 22 de UISP',
    });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Complementar este titular' });
    expect(dialog).toHaveAccessibleDescription(/se une al suscriptor que ya existe en iWana/);
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('un 422 muestra el mensaje sin códigos y no re-simula', async () => {
    jest
      .spyOn(migrationApi, 'createMapping')
      .mockRejectedValue(new ApiError(422, 'MIGRATION_TITULAR_TARGET_INVALID', 'invalid'));
    const onSaved = jest.fn();
    const user = userEvent.setup();
    render(<MigrationMappingEditor pending={[TITULAR]} counts={COUNTS} onSaved={onSaved} />);
    await screen.findByRole('link', { name: 'Ana Pérez' });
    await user.click(screen.getByRole('button', { name: /Complementar este titular/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Complementar' }));
    expect(
      await screen.findByText('Ese suscriptor no corresponde a este cliente de UISP.'),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
