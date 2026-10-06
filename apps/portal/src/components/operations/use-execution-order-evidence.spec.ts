// SLOT R2 — subida de evidencia por requisito: payloads, `expiresAt` del recibo,
// espera acotada del análisis, reanudación del registro del mismo asset y
// resultados obsoletos. Transporte simulado: `tasksApi` es un doble; no hay red.
import { renderHook } from '@testing-library/react';
import { ApiError, tasksApi, type ExecutionOrderDetailResponse } from '@/lib/api-client';
import {
  EVIDENCE_ANALYSIS_POLICY,
  EVIDENCE_FILE_MAX_BYTES,
  useExecutionOrderEvidence,
  type ExecutionOrderEvidenceAdapter,
  type ExecutionOrderEvidenceOutcome,
} from './use-execution-order-evidence';

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
  tasksApi: {
    executionOrders: {
      uploadEvidenceAsset: jest.fn(),
      getEvidenceAsset: jest.fn(),
      registerEvidence: jest.fn(),
    },
  },
}));

const upload = jest.mocked(tasksApi.executionOrders.uploadEvidenceAsset);
const getAsset = jest.mocked(tasksApi.executionOrders.getEvidenceAsset);
const register = jest.mocked(tasksApi.executionOrders.registerEvidence);

const NOW = new Date('2026-10-05T12:00:00.000Z');
const EXPIRES_AT = '2026-10-06T12:00:00.000Z';
const ASSET = 'asset-001';

function order(id = 'eo-001', version = 7): ExecutionOrderDetailResponse {
  return { id, version } as ExecutionOrderDetailResponse;
}

function receipt(
  status: 'PENDING_ANALYSIS' | 'AVAILABLE' | 'REJECTED' | 'EXPIRED',
  mediaAssetId = ASSET,
) {
  return { intentId: 'intent-001', mediaAssetId, status, expiresAt: EXPIRES_AT };
}

function file(name = 'foto.jpg', type = 'image/jpeg', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type, lastModified: 1_000 });
}

function setup(initial: ExecutionOrderDetailResponse | null = order()) {
  const adapter = {
    selectedExecutionOrder: initial,
    requestSequence: { current: 0 },
    setIsSubmittingExecutionOrder: jest.fn(),
    setIsAnalyzingEvidence: jest.fn(),
    setExecutionOrderError: jest.fn(),
    setExecutionOrderSuccess: jest.fn(),
    refreshExecutionOrder: jest.fn().mockResolvedValue(undefined),
  } satisfies ExecutionOrderEvidenceAdapter;
  const hook = renderHook(
    (props: ExecutionOrderEvidenceAdapter) => useExecutionOrderEvidence(props),
    {
      initialProps: adapter,
    },
  );
  const outcomes: ExecutionOrderEvidenceOutcome[] = [];
  const onOutcome = (outcome: ExecutionOrderEvidenceOutcome) => outcomes.push(outcome);
  return { adapter, hook, outcomes, onOutcome };
}

const DELAYS = EVIDENCE_ANALYSIS_POLICY.retryDelaysMs;
const FIRST_DELAY_MS = DELAYS[0];
const MAX_READS = DELAYS.length + 1;
const TOTAL_WAIT_MS = DELAYS.reduce((sum, delay) => sum + delay, 0);

/** Avanza el reloj lo que dura la espera completa del análisis y deja correr las promesas. */
async function elapseFullPolling() {
  await jest.advanceTimersByTimeAsync(TOTAL_WAIT_MS);
}

describe('useExecutionOrderEvidence', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    upload.mockReset();
    getAsset.mockReset();
    register.mockReset();
    upload.mockResolvedValue(receipt('PENDING_ANALYSIS'));
    register.mockResolvedValue({} as never);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('payloads por tipo de evidencia', () => {
    it.each([
      ['PHOTO', 'foto.jpg', 'image/jpeg', 'La evidencia fue registrada.'],
      ['DOCUMENT', 'acta.pdf', 'application/pdf', 'La evidencia fue registrada.'],
      ['SIGNATURE', 'firma-cliente.png', 'image/png', 'Firma guardada'],
    ] as const)(
      'registra %s con su clave, su tipo y el vencimiento del recibo',
      async (evidenceType, name, type, success) => {
        getAsset.mockResolvedValue(receipt('AVAILABLE'));
        const { adapter, hook } = setup();

        const result = await hook.result.current(file(name, type), 'req-clave', { evidenceType });

        expect(result).toBe(true);
        expect(upload).toHaveBeenCalledWith('eo-001', expect.any(File), 7);
        expect(register).toHaveBeenCalledWith(
          'eo-001',
          { mediaAssetId: ASSET, evidenceType, requirementKey: 'req-clave', expiresAt: EXPIRES_AT },
          7,
        );
        expect(adapter.refreshExecutionOrder).toHaveBeenCalledWith('eo-001', 'evidence');
        expect(adapter.setExecutionOrderSuccess).toHaveBeenLastCalledWith(success);
      },
    );

    it('usa el tipo del descriptor aunque el MIME sugiera otro', async () => {
      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      const { hook } = setup();

      await hook.result.current(file('plano.jpg', 'image/jpeg'), 'req-doc', {
        evidenceType: 'DOCUMENT',
      });

      expect(register).toHaveBeenCalledWith(
        'eo-001',
        expect.objectContaining({ evidenceType: 'DOCUMENT' }),
        7,
      );
    });

    it('descarta el aviso de éxito si cambia la OT durante el refresco posterior', async () => {
      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      const { adapter, hook } = setup();
      let signalRefreshStarted!: () => void;
      let resolveRefresh!: () => void;
      const refreshStarted = new Promise<void>((resolve) => {
        signalRefreshStarted = resolve;
      });
      adapter.refreshExecutionOrder.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveRefresh = resolve;
            signalRefreshStarted();
          }),
      );

      const pending = hook.result.current(file(), 'req-a', { evidenceType: 'PHOTO' });
      await refreshStarted;
      adapter.requestSequence.current += 1;
      resolveRefresh();

      expect(await pending).toBe(true);
      expect(adapter.setExecutionOrderSuccess).not.toHaveBeenCalledWith(
        'La evidencia fue registrada.',
      );
    });

    it('sin tipo declarado conserva la derivación anterior por MIME', async () => {
      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      const { hook } = setup();

      await hook.result.current(file('foto.jpg', 'image/jpeg'), 'req-a');
      await hook.result.current(file('acta.pdf', 'application/pdf'), 'req-b');

      expect(register.mock.calls.map(([, dto]) => dto.evidenceType)).toEqual(['PHOTO', 'DOCUMENT']);
    });

    it('sin orden seleccionada o sin clave no sube nada', async () => {
      const sinOrden = setup(null);
      expect(await sinOrden.hook.result.current(file(), 'req-a')).toBe(false);

      const sinClave = setup();
      expect(await sinClave.hook.result.current(file(), '  ')).toBe(false);
      expect(sinClave.adapter.setExecutionOrderError).toHaveBeenCalledWith(
        expect.stringContaining('No hay un requisito de evidencia válido'),
      );
      expect(upload).not.toHaveBeenCalled();
    });
  });

  describe('archivo', () => {
    it.each([
      ['vacío', file('v.jpg', 'image/jpeg', 0), 'PHOTO', 'El archivo está vacío.'],
      [
        'demasiado grande',
        Object.defineProperty(file('g.jpg'), 'size', { value: EVIDENCE_FILE_MAX_BYTES + 1 }),
        'PHOTO',
        'El archivo supera el tamaño máximo de 25 MB.',
      ],
      [
        'de un tipo que no es foto',
        file('a.pdf', 'application/pdf'),
        'PHOTO',
        'Selecciona una foto en formato JPG, PNG, WebP o GIF.',
      ],
      [
        'de un tipo no permitido como documento',
        file('a.txt', 'text/plain'),
        'DOCUMENT',
        'Selecciona un documento en PDF o una imagen en formato JPG, PNG, WebP o GIF.',
      ],
    ] as const)(
      'rechaza antes de subir un archivo %s',
      async (_name, candidate, evidenceType, message) => {
        const { adapter, hook, outcomes, onOutcome } = setup();

        const result = await hook.result.current(candidate, 'req-a', { evidenceType, onOutcome });

        expect(result).toBe(false);
        expect(adapter.setExecutionOrderError).toHaveBeenCalledWith(message);
        expect(upload).not.toHaveBeenCalled();
        expect(adapter.setIsSubmittingExecutionOrder).not.toHaveBeenCalled();
        expect(outcomes).toEqual(['invalid-file']);
      },
    );
  });

  describe('análisis del archivo', () => {
    it('espera a AVAILABLE antes de registrar y enciende «Analizando archivo» mientras tanto', async () => {
      getAsset
        .mockResolvedValueOnce(receipt('PENDING_ANALYSIS'))
        .mockResolvedValueOnce(receipt('AVAILABLE'));
      const { adapter, hook, outcomes, onOutcome } = setup();

      const pending = hook.result.current(file(), 'req-a', { evidenceType: 'PHOTO', onOutcome });
      await jest.advanceTimersByTimeAsync(FIRST_DELAY_MS);
      await expect(pending).resolves.toBe(true);

      expect(getAsset).toHaveBeenCalledTimes(2);
      expect(getAsset.mock.invocationCallOrder[1]).toBeLessThan(
        register.mock.invocationCallOrder[0] ?? 0,
      );
      expect(adapter.setIsAnalyzingEvidence).toHaveBeenCalledWith(true);
      expect(adapter.setIsAnalyzingEvidence).toHaveBeenLastCalledWith(false);
      expect(adapter.setIsSubmittingExecutionOrder.mock.calls).toEqual([[true], [false]]);
      expect(outcomes).toEqual(['registered']);
    });

    it.each([
      [
        'REJECTED',
        'rejected',
        'PHOTO',
        'El archivo no superó la revisión y no se registró. Selecciona otro archivo para continuar.',
      ],
      [
        'EXPIRED',
        'expired',
        'PHOTO',
        'El archivo venció antes de completar la revisión y no se registró. Vuelve a seleccionarlo para adjuntarlo.',
      ],
      ['REJECTED', 'rejected', 'SIGNATURE', 'No pudimos guardar la firma. Intenta de nuevo.'],
      ['EXPIRED', 'expired', 'SIGNATURE', 'No pudimos guardar la firma. Intenta de nuevo.'],
    ] as const)(
      'termina en %s sin registrar y descarta el recibo (%s, %s)',
      async (status, outcome, evidenceType, message) => {
        getAsset.mockResolvedValue(receipt(status));
        const { adapter, hook, outcomes, onOutcome } = setup();
        const candidate = evidenceType === 'SIGNATURE' ? file('f.png', 'image/png') : file();

        expect(await hook.result.current(candidate, 'req-a', { evidenceType, onOutcome })).toBe(
          false,
        );

        expect(adapter.setExecutionOrderError).toHaveBeenLastCalledWith(message);
        expect(register).not.toHaveBeenCalled();
        expect(outcomes).toEqual([outcome]);

        // El asset terminal ya no sirve: repetir con el mismo archivo sube uno nuevo.
        await hook.result.current(candidate, 'req-a', { evidenceType });
        expect(upload).toHaveBeenCalledTimes(2);
      },
    );
  });

  describe('tope de espera y reanudación del mismo asset', () => {
    it('al agotar el tope no registra, conserva el recibo y avisa que sigue en revisión', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { adapter, hook, outcomes, onOutcome } = setup();

      const pending = hook.result.current(file(), 'req-a', { evidenceType: 'PHOTO', onOutcome });
      await elapseFullPolling();

      await expect(pending).resolves.toBe(false);
      expect(getAsset).toHaveBeenCalledTimes(MAX_READS);
      expect(register).not.toHaveBeenCalled();
      expect(adapter.setExecutionOrderError).toHaveBeenLastCalledWith(
        'El archivo sigue en revisión y aún no se registró. Puedes volver a intentarlo en unos minutos.',
      );
      expect(outcomes).toEqual(['pending-review']);
    });

    it('reanuda el registro del mismo mediaAssetId sin repetir la carga', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { hook } = setup();
      const photo = file();

      const first = hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' });
      await elapseFullPolling();
      await first;

      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      const second = await hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' });

      expect(second).toBe(true);
      expect(upload).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledWith(
        'eo-001',
        {
          mediaAssetId: ASSET,
          evidenceType: 'PHOTO',
          requirementKey: 'req-a',
          expiresAt: EXPIRES_AT,
        },
        7,
      );
    });

    it('reconoce el mismo archivo elegido de nuevo (mismo nombre, tipo, tamaño y fecha)', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { hook } = setup();

      const first = hook.result.current(file('prueba.jpg'), 'req-a', { evidenceType: 'PHOTO' });
      await elapseFullPolling();
      await first;

      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      await hook.result.current(file('prueba.jpg'), 'req-a', { evidenceType: 'PHOTO' });

      expect(upload).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledTimes(1);
    });

    it('un archivo distinto, u otro requisito, sube su propio asset', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { hook } = setup();

      const first = hook.result.current(file('uno.jpg'), 'req-a', { evidenceType: 'PHOTO' });
      await elapseFullPolling();
      await first;

      upload.mockResolvedValue(receipt('PENDING_ANALYSIS', 'asset-002'));
      getAsset.mockResolvedValue(receipt('AVAILABLE', 'asset-002'));
      await hook.result.current(file('dos.jpg'), 'req-a', { evidenceType: 'PHOTO' });
      await hook.result.current(file('uno.jpg'), 'req-b', { evidenceType: 'PHOTO' });

      expect(upload).toHaveBeenCalledTimes(3);
      expect(register).toHaveBeenNthCalledWith(
        1,
        'eo-001',
        expect.objectContaining({ mediaAssetId: 'asset-002', requirementKey: 'req-a' }),
        7,
      );
    });

    it('si el recibo conservado venció, sube de nuevo en lugar de registrar un asset caducado', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { hook } = setup();
      const photo = file();

      const first = hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' });
      await elapseFullPolling();
      await first;

      jest.setSystemTime(new Date('2026-10-07T12:00:00.000Z'));
      upload.mockResolvedValue({
        ...receipt('PENDING_ANALYSIS', 'asset-002'),
        expiresAt: '2026-10-08T12:00:00.000Z',
      });
      getAsset.mockResolvedValue(receipt('AVAILABLE', 'asset-002'));
      await hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' });

      expect(upload).toHaveBeenCalledTimes(2);
      expect(register).toHaveBeenCalledWith(
        'eo-001',
        expect.objectContaining({
          mediaAssetId: 'asset-002',
          expiresAt: '2026-10-08T12:00:00.000Z',
        }),
        7,
      );
    });

    it('si el registro falla tras AVAILABLE conserva el recibo y el reintento no vuelve a subir', async () => {
      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      register.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Servicio no disponible'));
      const { adapter, hook, outcomes, onOutcome } = setup();
      const photo = file();

      expect(await hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO', onOutcome })).toBe(
        false,
      );
      expect(adapter.setExecutionOrderError).toHaveBeenLastCalledWith('Servicio no disponible');
      expect(outcomes).toEqual(['failed']);

      expect(await hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' })).toBe(true);
      expect(upload).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledTimes(2);
    });

    it('si la carga falla no hay recibo que conservar', async () => {
      upload.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'Sin servicio'));
      const { adapter, hook } = setup();
      const photo = file();

      expect(await hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' })).toBe(false);
      expect(adapter.setExecutionOrderError).toHaveBeenLastCalledWith('Sin servicio');

      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      expect(await hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' })).toBe(true);
      expect(upload).toHaveBeenCalledTimes(2);
    });

    it('rechaza una carga cuyo recibo trae un vencimiento inválido', async () => {
      upload.mockResolvedValue({
        ...receipt('PENDING_ANALYSIS'),
        expiresAt: '2026-10-01T00:00:00.000Z',
      });
      const { adapter, hook } = setup();

      expect(await hook.result.current(file(), 'req-a', { evidenceType: 'PHOTO' })).toBe(false);

      expect(getAsset).not.toHaveBeenCalled();
      expect(register).not.toHaveBeenCalled();
      expect(adapter.setExecutionOrderError).toHaveBeenLastCalledWith(
        'No fue posible completar la operación. Intenta de nuevo.',
      );
    });
  });

  describe('errores de la firma', () => {
    it('usa el copy cerrado de la firma salvo sesión o permiso', async () => {
      const { adapter, hook } = setup();
      const signature = file('f.png', 'image/png');

      upload.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'detalle técnico'));
      await hook.result.current(signature, 'CUSTOMER_SIGNATURE', { evidenceType: 'SIGNATURE' });
      expect(adapter.setExecutionOrderError).toHaveBeenLastCalledWith(
        'No pudimos guardar la firma. Intenta de nuevo.',
      );

      upload.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'x'));
      await hook.result.current(signature, 'CUSTOMER_SIGNATURE', { evidenceType: 'SIGNATURE' });
      expect(adapter.setExecutionOrderError).toHaveBeenLastCalledWith(
        'Tu sesión expiró. Inicia sesión nuevamente para continuar.',
      );
    });

    it('al agotar el tope de una firma conserva el recibo y dice que la firma sigue en revisión', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { adapter, hook } = setup();
      const signature = file('f.png', 'image/png');

      const pending = hook.result.current(signature, 'CUSTOMER_SIGNATURE', {
        evidenceType: 'SIGNATURE',
      });
      await elapseFullPolling();
      await pending;
      expect(adapter.setExecutionOrderError).toHaveBeenLastCalledWith(
        'La firma sigue en revisión y aún no se guardó. Puedes volver a intentarlo en unos minutos.',
      );

      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      await hook.result.current(signature, 'CUSTOMER_SIGNATURE', { evidenceType: 'SIGNATURE' });
      expect(upload).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledWith(
        'eo-001',
        expect.objectContaining({
          evidenceType: 'SIGNATURE',
          requirementKey: 'CUSTOMER_SIGNATURE',
        }),
        7,
      );
    });
  });

  describe('resultados obsoletos', () => {
    it('al cambiar de OT durante el sondeo se detiene sin registrar ni avisar', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { adapter, hook, outcomes, onOutcome } = setup();

      const pending = hook.result.current(file(), 'req-a', { evidenceType: 'PHOTO', onOutcome });
      await jest.advanceTimersByTimeAsync(0);
      expect(getAsset).toHaveBeenCalledTimes(1);

      hook.rerender({ ...adapter, selectedExecutionOrder: order('eo-002', 1) });
      await jest.advanceTimersByTimeAsync(FIRST_DELAY_MS);
      await expect(pending).resolves.toBe(false);

      expect(getAsset).toHaveBeenCalledTimes(1);
      expect(register).not.toHaveBeenCalled();
      expect(adapter.setExecutionOrderError).toHaveBeenCalledTimes(1);
      expect(adapter.setExecutionOrderError).toHaveBeenLastCalledWith(null);
      expect(adapter.setExecutionOrderSuccess).toHaveBeenCalledTimes(1);
      expect(adapter.setIsSubmittingExecutionOrder).toHaveBeenLastCalledWith(false);
      expect(adapter.setIsAnalyzingEvidence).toHaveBeenLastCalledWith(false);
      expect(outcomes).toEqual(['stale']);
    });

    it('al volver a la OT original se reanuda su recibo en lugar de subir otro', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { adapter, hook } = setup();
      const photo = file();

      const pending = hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' });
      await jest.advanceTimersByTimeAsync(0);
      hook.rerender({ ...adapter, selectedExecutionOrder: order('eo-002', 1) });
      await jest.advanceTimersByTimeAsync(FIRST_DELAY_MS);
      await pending;

      hook.rerender({ ...adapter, selectedExecutionOrder: order('eo-001', 7) });
      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      expect(await hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' })).toBe(true);
      expect(upload).toHaveBeenCalledTimes(1);
    });

    it('al abortar la señal del slot el sondeo termina de inmediato y no avisa', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { adapter, hook, outcomes, onOutcome } = setup();
      const controller = new AbortController();

      const pending = hook.result.current(file(), 'req-a', {
        evidenceType: 'PHOTO',
        signal: controller.signal,
        onOutcome,
      });
      await jest.advanceTimersByTimeAsync(0);
      controller.abort();
      await jest.advanceTimersByTimeAsync(0);

      await expect(pending).resolves.toBe(false);
      expect(getAsset).toHaveBeenCalledTimes(1);
      expect(register).not.toHaveBeenCalled();
      expect(adapter.setExecutionOrderError).toHaveBeenCalledTimes(1);
      expect(outcomes).toEqual(['stale']);
    });

    it('con la señal ya abortada tras la carga no consulta ni registra, y el recibo sigue disponible', async () => {
      const { hook } = setup();
      const controller = new AbortController();
      const photo = file();
      upload.mockImplementationOnce(async () => {
        controller.abort();
        return receipt('PENDING_ANALYSIS');
      });

      expect(
        await hook.result.current(photo, 'req-a', {
          evidenceType: 'PHOTO',
          signal: controller.signal,
        }),
      ).toBe(false);
      expect(getAsset).not.toHaveBeenCalled();

      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      expect(await hook.result.current(photo, 'req-a', { evidenceType: 'PHOTO' })).toBe(true);
      expect(upload).toHaveBeenCalledTimes(1);
    });

    it('al desmontar la consola detiene el sondeo', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { hook } = setup();

      const pending = hook.result.current(file(), 'req-a', { evidenceType: 'PHOTO' });
      await jest.advanceTimersByTimeAsync(0);
      hook.unmount();
      await jest.advanceTimersByTimeAsync(FIRST_DELAY_MS);

      await expect(pending).resolves.toBe(false);
      expect(getAsset).toHaveBeenCalledTimes(1);
      expect(register).not.toHaveBeenCalled();
    });

    it('una llamada más nueva deja obsoleta a la anterior y es la única dueña de los indicadores', async () => {
      getAsset.mockResolvedValue(receipt('PENDING_ANALYSIS'));
      const { adapter, hook } = setup();

      const older = hook.result.current(file('a.jpg'), 'req-a', { evidenceType: 'PHOTO' });
      await jest.advanceTimersByTimeAsync(0);
      upload.mockResolvedValue(receipt('PENDING_ANALYSIS', 'asset-002'));
      getAsset.mockResolvedValue(receipt('AVAILABLE', 'asset-002'));
      const newer = hook.result.current(file('b.jpg'), 'req-b', { evidenceType: 'PHOTO' });
      await jest.advanceTimersByTimeAsync(FIRST_DELAY_MS);

      await expect(older).resolves.toBe(false);
      await expect(newer).resolves.toBe(true);
      expect(register).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledWith(
        'eo-001',
        expect.objectContaining({ mediaAssetId: 'asset-002', requirementKey: 'req-b' }),
        7,
      );
      expect(adapter.setIsSubmittingExecutionOrder).toHaveBeenLastCalledWith(false);
    });
  });

  describe('registro', () => {
    it('registra con la versión vigente de la orden aunque haya cambiado durante el sondeo', async () => {
      getAsset
        .mockResolvedValueOnce(receipt('PENDING_ANALYSIS'))
        .mockResolvedValueOnce(receipt('AVAILABLE'));
      const { adapter, hook } = setup();

      const pending = hook.result.current(file(), 'req-a', { evidenceType: 'PHOTO' });
      await jest.advanceTimersByTimeAsync(0);
      hook.rerender({ ...adapter, selectedExecutionOrder: order('eo-001', 8) });
      await jest.advanceTimersByTimeAsync(FIRST_DELAY_MS);

      await expect(pending).resolves.toBe(true);
      expect(register).toHaveBeenCalledWith('eo-001', expect.anything(), 8);
    });

    it('avisa el registro antes de releer la orden, para poder cerrar la hoja sin esperar al refresco', async () => {
      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      const { adapter, hook } = setup();
      const onRegistered = jest.fn();

      await hook.result.current(file(), 'req-a', { evidenceType: 'PHOTO', onRegistered });

      expect(onRegistered).toHaveBeenCalledTimes(1);
      expect(onRegistered.mock.invocationCallOrder[0]).toBeLessThan(
        adapter.refreshExecutionOrder.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it('no avisa el registro a un slot que ya se desmontó, pero registra y relee igual', async () => {
      getAsset.mockResolvedValue(receipt('AVAILABLE'));
      const { adapter, hook } = setup();
      const controller = new AbortController();
      const onRegistered = jest.fn();
      register.mockImplementationOnce(async () => {
        controller.abort();
        return {} as never;
      });

      await hook.result.current(file(), 'req-a', {
        evidenceType: 'PHOTO',
        signal: controller.signal,
        onRegistered,
      });

      expect(onRegistered).not.toHaveBeenCalled();
      expect(adapter.refreshExecutionOrder).toHaveBeenCalledWith('eo-001', 'evidence');
      expect(adapter.setExecutionOrderSuccess).toHaveBeenLastCalledWith(
        'La evidencia fue registrada.',
      );
    });
  });

  it('el manejador es estable entre renders', () => {
    const { adapter, hook } = setup();
    const first = hook.result.current;
    hook.rerender({ ...adapter, selectedExecutionOrder: order('eo-002', 1) });
    expect(hook.result.current).toBe(first);
  });
});
