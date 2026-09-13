// apps/portal/src/components/operations/execution-order-requirements.spec.ts
// Spec puro migrado desde OperationsClient.spec.tsx (D-A2, split F2): los
// helpers viven ahora en `execution-order-requirements.ts`; las aserciones son
// idénticas. Se construye el `ApiError` real (mismo tipo que consume
// `getMissingRequirements` vía `instanceof`) en lugar del doble del mock del
// monolito; la semántica del caso no cambia.
import { ApiError } from '@/lib/api-client';
import { WfmWorkType } from '@iwana/shared';
import {
  deriveTemplateFromDetail,
  getMissingRequirements,
  isValidFutureEvidenceExpiry,
  mapOperationsError,
  productRequirementLabel,
} from './execution-order-requirements';

describe('execution-order-requirements', () => {
  it('el 404 se mapea sin el sustantivo «tarea» (aplica a tareas y órdenes)', () => {
    const error = new ApiError(404, 'NOT_FOUND', 'No disponible');

    expect(mapOperationsError(error)).toBe('El elemento consultado ya no está disponible.');
  });

  it('conserva la etiqueta real de un requisito faltante', () => {
    const error = new ApiError(422, 'CLOSURE_GAP', 'Faltan requisitos', undefined, [
      {
        requirementId: 'req-photo-install',
        label: 'Foto de instalación',
        kind: 'EVIDENCE',
        reason: 'Adjunta una foto de la instalación.',
      },
    ]);
    const missing = getMissingRequirements(error);

    expect(missing[0]).toEqual({
      requirementId: 'req-photo-install',
      label: 'Foto de instalación',
      kind: 'EVIDENCE',
      reason: 'Adjunta una foto de la instalación.',
    });
  });

  it('usa el fallback genérico solo cuando la etiqueta está vacía', () => {
    const error = new ApiError(422, 'CLOSURE_GAP', 'Faltan requisitos', undefined, [
      {
        requirementId: 'req-photo-install',
        label: '   ',
        kind: 'EVIDENCE',
        reason: '',
      },
    ]);
    const missing = getMissingRequirements(error);

    expect(missing).toEqual([
      {
        requirementId: 'req-photo-install',
        label: 'Evidencia requerida',
        kind: 'EVIDENCE',
        reason: 'Adjunta evidencia requerida antes de cerrar la orden.',
      },
    ]);
  });

  it('conserva labels de producto y deriva copy cuando no hay label', () => {
    expect(productRequirementLabel('Material o equipo', 'MATERIAL', 'ONT')).toBe(
      'Material o equipo',
    );
    expect(productRequirementLabel(undefined, 'EVIDENCE', 'req-photo-install')).toBe(
      'Evidencia requerida',
    );
  });

  describe('deriveTemplateFromDetail', () => {
    it('devuelve null cuando la OT no tiene plantilla o snapshot', () => {
      expect(deriveTemplateFromDetail(null)).toBeNull();
      expect(deriveTemplateFromDetail({ template: null } as never)).toBeNull();
      expect(
        deriveTemplateFromDetail({
          workType: WfmWorkType.INSTALLATION,
          template: { id: 'tpl-001', key: 'K', version: 1, label: 'L' },
        } as never),
      ).toBeNull();
    });

    it('proyecta la referencia congelada al shape de versión usado por el drawer', () => {
      const detail = {
        workType: WfmWorkType.INSTALLATION,
        template: {
          id: 'tpl-001',
          key: 'INSTALACION_FIBRA',
          version: 2,
          label: 'Instalación fibra',
          requirements: [
            {
              key: 'CUSTOMER_SIGNATURE',
              label: 'Firma del cliente',
              required: true,
              kind: 'EVIDENCE',
              evidenceType: 'SIGNATURE',
            },
          ],
        },
      } as never;

      const template = deriveTemplateFromDetail(detail);

      expect(template).toEqual({
        id: 'tpl-001',
        templateId: 'tpl-001',
        key: 'INSTALACION_FIBRA',
        version: 2,
        label: 'Instalación fibra',
        workType: WfmWorkType.INSTALLATION,
        status: 'PUBLISHED',
        requirements: [
          {
            key: 'CUSTOMER_SIGNATURE',
            label: 'Firma del cliente',
            required: true,
            kind: 'EVIDENCE',
            evidenceType: 'SIGNATURE',
          },
        ],
        reasonCatalogs: [],
      });
    });
  });

  describe('expiración de evidencia', () => {
    const now = Date.parse('2026-07-30T12:00:00.000Z');

    it('acepta únicamente una fecha válida futura', () => {
      expect(isValidFutureEvidenceExpiry('2026-07-30T12:00:01.000Z', now)).toBe(true);
    });

    it.each([
      undefined,
      null,
      'no-es-una-fecha',
      '2026-07-30T11:59:59.000Z',
      '2026-07-30T12:00:00.000Z',
    ])('rechaza expiresAt inválido o no futuro: %s', (expiresAt) => {
      expect(isValidFutureEvidenceExpiry(expiresAt, now)).toBe(false);
    });
  });
});
