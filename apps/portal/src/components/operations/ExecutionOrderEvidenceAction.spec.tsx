// SLOT R2 — evidencia por requisito, a través del drawer real (el sobre de props
// del slot es el contrato de `execution-order-slots.ts`). Los casos de subida de
// archivo que antes vivían en `ExecutionOrderDrawer.spec.tsx` y
// `ExecutionOrderMomentContainer.spec.tsx` se movieron aquí porque su aserción
// cambia con R2: el slot publica `{ evidenceType, signal, ... }` como tercer
// argumento. Transporte simulado: `onUploadEvidence` es un doble.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type {
  ExecutionOrderAllowedAction,
  ExecutionOrderEvidence,
  ExecutionOrderTemplateVersion,
} from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';
import {
  ExecutionOrderEvidenceAction,
  ExecutionOrderEvidenceHistory,
} from './ExecutionOrderEvidenceAction';
import {
  drawStroke,
  installCanvasMocks,
  installPointerEvent,
  type CanvasMocks,
} from './execution-order-canvas.test-helper';
import type { ExecutionOrderSlotContext } from './execution-order-slots';
import type {
  ExecutionOrderEvidenceUploadHandler,
  ExecutionOrderEvidenceUploadOptions,
} from './use-execution-order-evidence';

const REQUIREMENTS: ExecutionOrderTemplateVersion['requirements'] = [
  {
    key: 'service-test',
    label: 'Prueba de servicio en el sitio',
    required: true,
    kind: 'EVIDENCE',
    evidenceType: 'PHOTO',
  },
  {
    key: 'work-photo',
    label: 'Fotos del trabajo realizado',
    required: true,
    kind: 'EVIDENCE',
    evidenceType: 'PHOTO',
  },
  {
    key: 'installation-plan',
    label: 'Plano de la instalación',
    required: false,
    kind: 'EVIDENCE',
    evidenceType: 'DOCUMENT',
  },
  {
    key: 'CUSTOMER_SIGNATURE',
    label: 'Acta de conformidad firmada por el cliente',
    required: true,
    kind: 'EVIDENCE',
    evidenceType: 'SIGNATURE',
  },
];

function template(): ExecutionOrderTemplateVersion {
  return {
    id: 'tplv-r2',
    templateId: 'tpl-r2',
    key: 'INSTALACION_ESTANDAR',
    version: 2,
    label: 'Instalación estándar',
    workType: WfmWorkType.INSTALLATION,
    status: 'PUBLISHED',
    requirements: REQUIREMENTS,
    reasonCatalogs: [],
  };
}

function detail(
  overrides: Partial<ExecutionOrderDetailResponse> = {},
): ExecutionOrderDetailResponse {
  return {
    id: 'eo-r2',
    number: 'OTE-R2-001',
    version: 4,
    status: ExecutionOrderStatus.IN_PROGRESS,
    annulled: false,
    workType: WfmWorkType.INSTALLATION,
    template: {
      id: 'tpl-r2',
      key: 'INSTALACION_ESTANDAR',
      version: 2,
      label: 'Instalación estándar',
      requirements: REQUIREMENTS,
    },
    schedule: { eventId: 'se-001', window: null },
    assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Técnico de campo' },
    site: { id: 'site-001', label: 'Sitio R2', address: 'Calle 1 # 2 - 3' },
    completion: {
      progress: 0,
      completed: 0,
      total: REQUIREMENTS.length,
      requirements: REQUIREMENTS.map((requirement) => ({
        requirementId: requirement.key,
        label: requirement.label,
        kind: requirement.kind,
        satisfied: false,
        reason: `Falta ${requirement.key}`,
      })),
    },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: ['REGISTER_EVIDENCE'] as ExecutionOrderAllowedAction[],
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
    ...overrides,
  };
}

type DrawerProps = Parameters<typeof ExecutionOrderDrawer>[0];

function drawerProps(props: Partial<DrawerProps> = {}): DrawerProps {
  return {
    open: true,
    order: detail(),
    activities: [],
    itemUsage: [],
    evidence: [],
    template: template(),
    isLoading: false,
    isSubmitting: false,
    error: null,
    offline: false,
    onClose: jest.fn(),
    isLoadingMoreActivities: false,
    isLoadingMoreItemUsage: false,
    isLoadingMoreEvidence: false,
    isLoadingMoreExecutorCustody: false,
    onLoadMoreActivities: jest.fn(),
    onLoadMoreItemUsage: jest.fn(),
    onLoadMoreEvidence: jest.fn(),
    onLoadMoreExecutorCustody: jest.fn(),
    onStart: jest.fn().mockResolvedValue(undefined),
    onRegisterActivity: jest.fn().mockResolvedValue(undefined),
    onRegisterItemUsage: jest.fn().mockResolvedValue(undefined),
    onUploadEvidence: jest.fn().mockResolvedValue(true),
    onCloseOrder: jest.fn().mockResolvedValue(undefined),
    ...props,
  };
}

function renderDrawer(props: Partial<DrawerProps> = {}) {
  const result = render(<ExecutionOrderDrawer {...drawerProps(props)} />);
  return {
    ...result,
    rerenderDrawer: (next: Partial<DrawerProps>) =>
      result.rerender(<ExecutionOrderDrawer {...drawerProps(next)} />),
  };
}

const TRIGGERS = {
  serviceTest: /^Añadir foto de la prueba de servicio para /,
  workPhoto: /^Añadir fotos del trabajo para /,
  plan: /^Adjuntar evidencia para /,
  signature: /^Capturar firma del cliente para /,
};

async function openSheet(trigger: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: trigger }));
  return user;
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText('Archivo de evidencia') as HTMLInputElement;
}

let canvasMocks: CanvasMocks;
beforeAll(installPointerEvent);
beforeEach(() => {
  jest.clearAllMocks();
  canvasMocks = installCanvasMocks();
});

describe('Slot de evidencia — foto y documento', () => {
  it('muestra el selector de archivo asociado a su requisito y no ofrece arrastre', async () => {
    renderDrawer();
    await openSheet(TRIGGERS.serviceTest);

    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
      'Añadir foto de la prueba de servicio',
    );
    expect(screen.getByText('Selecciona una foto.')).toBeInTheDocument();
    expect(fileInput()).toHaveAccessibleDescription('Selecciona una foto.');
    expect(screen.getByRole('button', { name: 'Seleccionar foto' })).toBeInTheDocument();
    expect(screen.queryByText(/arrastra/i)).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('el selector de una foto solo ofrece imágenes y el de un documento admite además PDF', async () => {
    renderDrawer();
    await openSheet(TRIGGERS.serviceTest);
    expect(fileInput().accept).toBe('image/jpeg,image/png,image/webp,image/gif');
    expect(fileInput().accept).not.toContain('pdf');

    await openSheet(TRIGGERS.plan);
    expect(screen.getAllByLabelText('Archivo de evidencia')).toHaveLength(1);
    expect(screen.getByText('Selecciona un documento en PDF o una imagen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seleccionar documento' })).toBeInTheDocument();
    expect(fileInput().accept).toBe('image/jpeg,image/png,image/webp,image/gif,application/pdf');
  });

  it('conserva el requirementKey real y el evidenceType del requisito, con un solo archivo', async () => {
    const onUploadEvidence = jest.fn().mockResolvedValue(undefined);
    renderDrawer({ onUploadEvidence });
    const user = await openSheet(TRIGGERS.serviceTest);

    const file = new File(['evidencia'], 'instalacion.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput(), file);

    expect(fileInput()).not.toHaveAttribute('multiple');
    expect(onUploadEvidence).toHaveBeenCalledWith(
      file,
      'service-test',
      expect.objectContaining({ evidenceType: 'PHOTO' }),
    );
  });

  it('cada requisito de evidencia sube con su propia clave y su propio tipo', async () => {
    const onUploadEvidence = jest.fn().mockResolvedValue(undefined);
    renderDrawer({ onUploadEvidence });
    const user = await openSheet(TRIGGERS.serviceTest);

    const photo = new File(['x'], 'prueba.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput(), photo);
    expect(onUploadEvidence).toHaveBeenLastCalledWith(
      photo,
      'service-test',
      expect.objectContaining({ evidenceType: 'PHOTO' }),
    );

    await user.click(screen.getByRole('button', { name: TRIGGERS.workPhoto }));
    expect(screen.getAllByLabelText('Archivo de evidencia')).toHaveLength(1);
    await user.upload(fileInput(), photo);
    expect(onUploadEvidence).toHaveBeenLastCalledWith(
      photo,
      'work-photo',
      expect.objectContaining({ evidenceType: 'PHOTO' }),
    );

    await user.click(screen.getByRole('button', { name: TRIGGERS.plan }));
    const document = new File(['x'], 'plano.pdf', { type: 'application/pdf' });
    await user.upload(fileInput(), document);
    expect(onUploadEvidence).toHaveBeenLastCalledWith(
      document,
      'installation-plan',
      expect.objectContaining({ evidenceType: 'DOCUMENT' }),
    );
  });

  it('pasa al manejador una señal viva que se aborta al cerrar la hoja', async () => {
    const onUploadEvidence = jest.fn().mockResolvedValue(undefined);
    renderDrawer({ onUploadEvidence });
    const user = await openSheet(TRIGGERS.serviceTest);

    await user.upload(fileInput(), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    const options = onUploadEvidence.mock.calls[0]![2] as ExecutionOrderEvidenceUploadOptions;
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(options.signal?.aborted).toBe(true);
  });

  it('al cambiar de requisito aborta la señal del anterior y monta una nueva', async () => {
    const onUploadEvidence = jest.fn().mockResolvedValue(undefined);
    renderDrawer({ onUploadEvidence });
    const user = await openSheet(TRIGGERS.serviceTest);
    await user.upload(fileInput(), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    const first = onUploadEvidence.mock.calls[0]![2] as ExecutionOrderEvidenceUploadOptions;

    await user.click(screen.getByRole('button', { name: TRIGGERS.workPhoto }));
    await user.upload(fileInput(), new File(['x'], 'b.jpg', { type: 'image/jpeg' }));
    const second = onUploadEvidence.mock.calls[1]![2] as ExecutionOrderEvidenceUploadOptions;

    expect(first.signal?.aborted).toBe(true);
    expect(second.signal?.aborted).toBe(false);
  });

  it('muestra el estado mientras analiza el archivo, también en la firma', async () => {
    const { rerenderDrawer } = renderDrawer({ isAnalyzingEvidence: true });
    await openSheet(TRIGGERS.serviceTest);
    expect(screen.getByText('Analizando archivo')).toHaveAttribute('role', 'status');

    await openSheet(TRIGGERS.signature);
    expect(screen.getByText('Analizando archivo')).toHaveAttribute('role', 'status');
    rerenderDrawer({ isAnalyzingEvidence: false });
    expect(screen.queryByText('Analizando archivo')).toBeNull();
  });

  it('mantiene el archivo seleccionado y muestra el error si la carga no termina', async () => {
    const error =
      'El archivo no superó la revisión y no se registró. Selecciona otro archivo para continuar.';
    const onUploadEvidence = jest.fn().mockResolvedValue(false);
    renderDrawer({ error, onUploadEvidence });
    const user = await openSheet(TRIGGERS.serviceTest);

    const file = new File(['evidencia'], 'instalacion.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput(), file);

    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(fileInput().files?.[0]).toBe(file);
    expect(screen.getByText('Archivo seleccionado: instalacion.jpg')).toBeInTheDocument();
    expect(onUploadEvidence).toHaveBeenCalledWith(
      file,
      'service-test',
      expect.objectContaining({ evidenceType: 'PHOTO' }),
    );
  });

  it('tras un registro exitoso limpia el selector para poder elegir otra foto', async () => {
    const onUploadEvidence = jest.fn().mockResolvedValue(true);
    renderDrawer({ onUploadEvidence });
    const user = await openSheet(TRIGGERS.workPhoto);

    await user.upload(fileInput(), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(fileInput().files).toHaveLength(0));
    expect(screen.queryByText(/Archivo seleccionado/)).toBeNull();
    // La hoja sigue abierta: «Añadir fotos del trabajo» admite varias, una por vez.
    expect(screen.getByRole('button', { name: 'Seleccionar foto' })).toBeInTheDocument();
  });

  describe('reanudación cuando el análisis no terminó', () => {
    function uploadReporting(outcome: 'pending-review' | 'rejected' | 'failed') {
      return jest.fn<
        ReturnType<ExecutionOrderEvidenceUploadHandler>,
        Parameters<ExecutionOrderEvidenceUploadHandler>
      >(async (_file, _key, options) => {
        options?.onOutcome?.(outcome);
        return false;
      });
    }

    it('ofrece reintentar el registro con el mismo archivo cuando el análisis sigue pendiente', async () => {
      const onUploadEvidence = uploadReporting('pending-review');
      renderDrawer({ onUploadEvidence });
      const user = await openSheet(TRIGGERS.serviceTest);
      const file = new File(['x'], 'prueba.jpg', { type: 'image/jpeg' });

      expect(screen.queryByRole('button', { name: 'Reintentar registro' })).toBeNull();
      await user.upload(fileInput(), file);
      const retry = await screen.findByRole('button', { name: 'Reintentar registro' });

      onUploadEvidence.mockResolvedValueOnce(true);
      await user.click(retry);

      expect(onUploadEvidence).toHaveBeenCalledTimes(2);
      expect(onUploadEvidence.mock.calls[1]![0]).toBe(file);
      expect(onUploadEvidence.mock.calls[1]![1]).toBe('service-test');
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Reintentar registro' })).toBeNull(),
      );
    });

    it('también lo ofrece tras un fallo de red o de registro', async () => {
      renderDrawer({ onUploadEvidence: uploadReporting('failed') });
      const user = await openSheet(TRIGGERS.serviceTest);
      await user.upload(fileInput(), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
      expect(
        await screen.findByRole('button', { name: 'Reintentar registro' }),
      ).toBeInTheDocument();
    });

    it('no lo ofrece si el archivo fue rechazado: hay que elegir otro', async () => {
      renderDrawer({ onUploadEvidence: uploadReporting('rejected') });
      const user = await openSheet(TRIGGERS.serviceTest);
      await user.upload(fileInput(), new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
      await waitFor(() =>
        expect(screen.getByText('Archivo seleccionado: a.jpg')).toBeInTheDocument(),
      );
      expect(screen.queryByRole('button', { name: 'Reintentar registro' })).toBeNull();
    });
  });

  it('bloquea el selector mientras se envía y sin conexión', async () => {
    const { rerenderDrawer } = renderDrawer();
    await openSheet(TRIGGERS.serviceTest);
    expect(screen.getByRole('button', { name: 'Seleccionar foto' })).toBeEnabled();

    rerenderDrawer({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Seleccionar foto' })).toBeDisabled();

    rerenderDrawer({ offline: true });
    expect(screen.getByRole('button', { name: 'Seleccionar foto' })).toBeDisabled();
  });

  it('sin permiso de registro, o fuera de progreso, no monta ningún selector', () => {
    const { unmount } = renderDrawer({ order: detail({ allowedActions: [] }) });
    expect(screen.queryByRole('button', { name: TRIGGERS.serviceTest })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    unmount();

    renderDrawer({ order: detail({ status: ExecutionOrderStatus.ASSIGNED }) });
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
  });
});

describe('Slot de evidencia — firma', () => {
  async function openSignature(props: Partial<DrawerProps> = {}) {
    renderDrawer(props);
    const user = await openSheet(TRIGGERS.signature);
    return { user, surface: screen.getByRole('img', { name: 'Área de firma' }) };
  }

  it('abre la captura en lienzo con instrucciones y no ofrece selector de archivo ni nombre escrito', async () => {
    await openSignature();

    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
      'Capturar firma del cliente',
    );
    expect(screen.getByRole('group', { name: 'Captura de firma del cliente' })).toBeInTheDocument();
    expect(
      screen.getByText(/Pide al cliente que firme el acta de conformidad/),
    ).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar firma' })).toBeInTheDocument();
  });

  it('«Cancelar» existe una sola vez: lo aporta la hoja y devuelve el foco al disparador', async () => {
    const { user } = await openSignature();
    const trigger = screen.getByRole('button', { name: TRIGGERS.signature });

    expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('img', { name: 'Área de firma' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('con el lienzo vacío no sube nada: el nombre escrito no es firma', async () => {
    const onUploadEvidence = jest.fn().mockResolvedValue(true);
    const { user } = await openSignature({ onUploadEvidence });

    await user.click(screen.getByRole('button', { name: 'Guardar firma' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Dibuja la firma antes de guardarla.');
    expect(onUploadEvidence).not.toHaveBeenCalled();
  });

  it('sube el PNG como SIGNATURE con la clave CUSTOMER_SIGNATURE y cierra la hoja', async () => {
    const onUploadEvidence = jest.fn().mockResolvedValue(true);
    const { user, surface } = await openSignature({ onUploadEvidence });
    const trigger = screen.getByRole('button', { name: TRIGGERS.signature });

    drawStroke(surface);
    await user.click(screen.getByRole('button', { name: 'Guardar firma' }));

    await waitFor(() => expect(onUploadEvidence).toHaveBeenCalledTimes(1));
    const [file, key, options] = onUploadEvidence.mock.calls[0]!;
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe('image/png');
    expect(key).toBe('CUSTOMER_SIGNATURE');
    expect(options).toEqual(
      expect.objectContaining({ evidenceType: 'SIGNATURE', signal: expect.any(AbortSignal) }),
    );
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Área de firma' })).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('cierra la hoja en cuanto el servidor acepta el registro, sin esperar al refresco', async () => {
    let finish: (value: boolean) => void = () => undefined;
    const onUploadEvidence = jest.fn(
      (_file: File, _key: string, options?: ExecutionOrderEvidenceUploadOptions) =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
          // El hook avisa el registro y luego relee la orden (la promesa sigue pendiente).
          queueMicrotask(() => options?.onRegistered?.());
        }),
    );
    const { user, surface } = await openSignature({ onUploadEvidence });

    drawStroke(surface);
    await user.click(screen.getByRole('button', { name: 'Guardar firma' }));

    await waitFor(() => expect(screen.queryByRole('img', { name: 'Área de firma' })).toBeNull());
    await act(async () => finish(true));
  });

  it('si no se guarda conserva el trazo y deja reintentar sin volver a exportar', async () => {
    const onUploadEvidence = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { user, surface } = await openSignature({
      onUploadEvidence,
      error: 'No pudimos guardar la firma. Intenta de nuevo.',
    });

    drawStroke(surface);
    await user.click(screen.getByRole('button', { name: 'Guardar firma' }));
    await waitFor(() => expect(onUploadEvidence).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('img', { name: 'Área de firma' })).toBeInTheDocument();
    expect(
      screen.getAllByText('No pudimos guardar la firma. Intenta de nuevo.').length,
    ).toBeGreaterThan(0);
    expect(canvasMocks.context.clearRect).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Guardar firma' }));
    await waitFor(() => expect(onUploadEvidence).toHaveBeenCalledTimes(2));
    expect(onUploadEvidence.mock.calls[1]![0]).toBe(onUploadEvidence.mock.calls[0]![0]);
    expect(canvasMocks.toBlob).toHaveBeenCalledTimes(1);
  });

  it('bloquea el trazo y los botones mientras se envía y sin conexión', async () => {
    const { surface } = await openSignature({ isSubmitting: true });
    drawStroke(surface);
    expect(canvasMocks.context.stroke).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Guardar firma' })).toBeDisabled();
  });

  it('si se abre otro requisito mientras se guarda, aborta la subida en curso y no cierra la hoja nueva', async () => {
    let finish: (value: boolean) => void = () => undefined;
    const onUploadEvidence = jest.fn(
      (_file: File, _key: string, options?: ExecutionOrderEvidenceUploadOptions) =>
        new Promise<boolean>((resolve) => {
          finish = (value) => {
            // Un hook real no avisa el registro a un slot ya desmontado.
            if (options?.signal?.aborted !== true) options?.onRegistered?.();
            resolve(value);
          };
        }),
    );
    const { user, surface } = await openSignature({ onUploadEvidence });
    drawStroke(surface);
    await user.click(screen.getByRole('button', { name: 'Guardar firma' }));
    await waitFor(() => expect(onUploadEvidence).toHaveBeenCalled());
    const options = onUploadEvidence.mock.calls[0]![2] as ExecutionOrderEvidenceUploadOptions;

    await user.click(screen.getByRole('button', { name: TRIGGERS.workPhoto }));
    expect(options.signal?.aborted).toBe(true);

    await act(async () => finish(true));
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Añadir fotos del trabajo');
  });
});

describe('Historial de evidencia por requisito', () => {
  function evidenceEntry(overrides: Partial<ExecutionOrderEvidence> = {}): ExecutionOrderEvidence {
    return {
      id: 'ev-1',
      mediaAssetId: 'asset-1',
      evidenceType: 'PHOTO',
      requirementKey: 'service-test',
      capturedAt: null,
      receivedAt: '2026-10-05T15:00:00.000Z',
      status: 'AVAILABLE',
      createdAt: '2026-10-05T15:00:00.000Z',
      ...overrides,
    };
  }

  function sectionOf(requirementKey: string) {
    return document
      .getElementById(`eo-evidence-heading-${requirementKey}-history`)!
      .closest('section') as HTMLElement;
  }

  it('cada requisito ve solo sus registros, con el tipo y la etiqueta del snapshot', () => {
    renderDrawer({
      evidence: [
        evidenceEntry(),
        evidenceEntry({ id: 'ev-2', requirementKey: 'work-photo' }),
        evidenceEntry({
          id: 'ev-3',
          requirementKey: 'CUSTOMER_SIGNATURE',
          evidenceType: 'SIGNATURE',
        }),
      ],
    });

    expect(
      within(sectionOf('service-test')).getByText('Foto · Prueba de servicio en el sitio'),
    ).toBeInTheDocument();
    expect(within(sectionOf('service-test')).queryByText(/Firma ·/)).toBeNull();
    expect(
      within(sectionOf('CUSTOMER_SIGNATURE')).getByText(
        'Firma · Acta de conformidad firmada por el cliente',
      ),
    ).toBeInTheDocument();
    expect(
      within(sectionOf('installation-plan')).getByText(/Todavía no hay evidencias/),
    ).toBeInTheDocument();
  });

  it('el vacío dice qué aparecerá según el tipo del requisito, sin prometer una acción', () => {
    renderDrawer();
    expect(
      within(sectionOf('service-test')).getByText('Las fotos que añadas aparecerán aquí.'),
    ).toBeInTheDocument();
    expect(
      within(sectionOf('installation-plan')).getByText(
        'Los documentos que adjuntes aparecerán aquí.',
      ),
    ).toBeInTheDocument();
    expect(
      within(sectionOf('CUSTOMER_SIGNATURE')).getByText(
        'La firma del cliente aparecerá aquí cuando se guarde.',
      ),
    ).toBeInTheDocument();
  });

  it('el historial se ve en lectura, también en una orden terminal y sin captura', () => {
    renderDrawer({
      order: detail({ status: ExecutionOrderStatus.COMPLETED, allowedActions: [] }),
      evidence: [evidenceEntry({ status: 'PENDING_ANALYSIS' })],
    });

    expect(screen.getByText('Pendiente de análisis')).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
  });
});

describe('Slot de evidencia — requisito sin clave válida', () => {
  function context(overrides: Partial<ExecutionOrderSlotContext> = {}): ExecutionOrderSlotContext {
    return {
      isSubmitting: false,
      offline: false,
      onUploadEvidence: jest.fn(),
      ...overrides,
    } as unknown as ExecutionOrderSlotContext;
  }

  it('avisa y ofrece actualizar el detalle en lugar de subir contra una clave vacía', () => {
    const onRefreshDetail = jest.fn().mockResolvedValue(undefined);
    const requirement = { ...REQUIREMENTS[0]!, key: ' ' } as Extract<
      ExecutionOrderTemplateVersion['requirements'][number],
      { kind: 'EVIDENCE' }
    >;
    render(
      <ExecutionOrderEvidenceAction
        order={detail()}
        requirement={requirement}
        context={context({ onRefreshDetail })}
        action={{
          kind: 'evidence',
          requirementKey: ' ',
          evidenceType: 'PHOTO',
          action: 'REGISTER_EVIDENCE',
        }}
        bindSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Requisito de evidencia no disponible')).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar detalle' }));
    expect(onRefreshDetail).toHaveBeenCalledTimes(1);
  });

  it('el historial no falla con evidencias nulas', () => {
    render(
      <ExecutionOrderEvidenceHistory
        order={detail()}
        requirement={REQUIREMENTS[0] as never}
        context={context({ evidence: null })}
      />,
    );
    expect(screen.getByText('Todavía no hay evidencias para este requisito')).toBeInTheDocument();
  });
});
