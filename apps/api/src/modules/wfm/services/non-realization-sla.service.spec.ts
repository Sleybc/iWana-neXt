import {
  NonRealizationSlaService,
  NonRealizationCauseSlaView,
} from './non-realization-sla.service';
import { NonRealizationCauseCategory } from '@iwana/shared';

describe('NonRealizationSlaService', () => {
  let service: NonRealizationSlaService;

  beforeEach(() => {
    service = new NonRealizationSlaService();
  });

  // ─── Helper para construir una causa mínima ───────────────────────────
  function makeCause(overrides: {
    category: NonRealizationCauseCategory;
    requiresEvidence?: boolean;
    pausesSla?: boolean;
    closesWork?: boolean;
    label?: string;
  }): NonRealizationCauseSlaView {
    return {
      category: overrides.category,
      requiresEvidence: overrides.requiresEvidence ?? false,
      pausesSla: overrides.pausesSla ?? false,
      closesWork: overrides.closesWork ?? false,
      label: overrides.label ?? 'Causa de prueba',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // F2.4 — evaluateSlaAction
  // ═══════════════════════════════════════════════════════════════════════

  describe('evaluateSlaAction', () => {
    it('debe retornar PAUSE para causa de cliente con evidencia', () => {
      const cause = makeCause({
        category: NonRealizationCauseCategory.CUSTOMER,
        pausesSla: true,
        requiresEvidence: true,
      });

      const result = service.evaluateSlaAction(cause, 1, true);

      expect(result.action).toBe('PAUSE');
    });

    it('debe retornar CONTINUE para causa de cliente SIN evidencia cuando requiresEvidence=true', () => {
      const cause = makeCause({
        category: NonRealizationCauseCategory.CUSTOMER,
        pausesSla: true,
        requiresEvidence: true,
      });

      const result = service.evaluateSlaAction(cause, 1, false);

      expect(result.action).toBe('CONTINUE');
      expect(result.reason).toContain('evidencia');
    });

    it('debe retornar CONTINUE para causa de operación (SLA sigue corriendo)', () => {
      const cause = makeCause({
        category: NonRealizationCauseCategory.OPERATIONAL,
        pausesSla: false,
      });

      const result = service.evaluateSlaAction(cause, 1, false);

      expect(result.action).toBe('CONTINUE');
    });

    it('debe retornar CONTINUE para causa de operación incluso con evidencia', () => {
      const cause = makeCause({
        category: NonRealizationCauseCategory.OPERATIONAL,
        pausesSla: false,
      });

      const result = service.evaluateSlaAction(cause, 2, true);

      expect(result.action).toBe('CONTINUE');
    });

    it('debe retornar PAUSE para fuerza mayor', () => {
      const cause = makeCause({
        category: NonRealizationCauseCategory.FORCE_MAJEURE,
        pausesSla: true,
        requiresEvidence: false,
      });

      const result = service.evaluateSlaAction(cause, 0, false);

      expect(result.action).toBe('PAUSE');
    });

    it('debe retornar CLOSE cuando closesWork=true y retryCount >= 3', () => {
      const cause = makeCause({
        category: NonRealizationCauseCategory.CUSTOMER,
        closesWork: true,
        pausesSla: false,
      });

      const result = service.evaluateSlaAction(cause, 3, false);

      expect(result.action).toBe('CLOSE');
    });

    it('NO debe retornar CLOSE cuando closesWork=true pero retryCount < 3', () => {
      const cause = makeCause({
        category: NonRealizationCauseCategory.CUSTOMER,
        closesWork: true,
        pausesSla: false,
      });

      const result = service.evaluateSlaAction(cause, 2, false);

      expect(result.action).not.toBe('CLOSE');
    });

    // ═══════════════════════════════════════════════════════════════════
    // PUERTA 2: El SLA no se reinicia en ninguna ruta
    // ═══════════════════════════════════════════════════════════════════

    it('PUERTA 2: SLA nunca se reinicia — PAUSE no es reinicio, CONTINUE no modifica', () => {
      // Simular todos los escenarios posibles de causas
      const scenarios = [
        {
          cat: NonRealizationCauseCategory.CUSTOMER,
          label: 'Cliente',
          pauses: true,
          reqEv: true,
          ev: true,
        },
        {
          cat: NonRealizationCauseCategory.CUSTOMER,
          label: 'Cliente sin evidencia',
          pauses: true,
          reqEv: true,
          ev: false,
        },
        {
          cat: NonRealizationCauseCategory.OPERATIONAL,
          label: 'Operación',
          pauses: false,
          reqEv: false,
          ev: false,
        },
        {
          cat: NonRealizationCauseCategory.FORCE_MAJEURE,
          label: 'Fuerza mayor',
          pauses: true,
          reqEv: false,
          ev: false,
        },
      ];

      for (const scenario of scenarios) {
        const cause = makeCause({
          category: scenario.cat,
          pausesSla: scenario.pauses,
          requiresEvidence: scenario.reqEv,
        });

        const result = service.evaluateSlaAction(cause, 1, scenario.ev);

        // El SLA solo puede PAUSE o CONTINUE o CLOSE — nunca REINICIAR
        expect(['PAUSE', 'CONTINUE', 'CLOSE']).toContain(result.action);
        // Reiniciar implicaría modificar slaDueAt, lo cual este servicio no hace
        // por diseño. La acción PAUSE solo marca slaPausedAt; no toca slaDueAt.
      }
    });

    it('PUERTA 2: múltiples PAUSEs consecutivas no reinician el SLA', () => {
      // Cada intento fallido de cliente con evidencia → PAUSE
      const cause = makeCause({
        category: NonRealizationCauseCategory.CUSTOMER,
        pausesSla: true,
        requiresEvidence: true,
      });

      // 3 intentos seguidos — todos PAUSE
      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = service.evaluateSlaAction(cause, attempt, true);
        expect(result.action).toBe('PAUSE');
      }

      // El servicio no modifica slaDueAt, solo recomienda PAUSE.
      // La responsabilidad de acumular tiempo de pausa es del llamante.
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // F2.3 — consumesRetry / isCustomerCause
  // ═══════════════════════════════════════════════════════════════════════

  describe('consumesRetry / isCustomerCause', () => {
    it('solo CUSTOMER consume intento', () => {
      expect(service.consumesRetry(NonRealizationCauseCategory.CUSTOMER)).toBe(true);
      expect(service.consumesRetry(NonRealizationCauseCategory.OPERATIONAL)).toBe(false);
      expect(service.consumesRetry(NonRealizationCauseCategory.FORCE_MAJEURE)).toBe(false);
    });

    it('causas de operación y fuerza mayor NO consumen intento', () => {
      expect(service.isCustomerCause(NonRealizationCauseCategory.OPERATIONAL)).toBe(false);
      expect(service.isCustomerCause(NonRealizationCauseCategory.FORCE_MAJEURE)).toBe(false);
      expect(service.isCustomerCause(NonRealizationCauseCategory.CUSTOMER)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // F2.3 — computeReclassificationRetryDelta
  // ═══════════════════════════════════════════════════════════════════════

  describe('computeReclassificationRetryDelta', () => {
    it('sin clasificación previa: CUSTOMER → +1', () => {
      expect(
        service.computeReclassificationRetryDelta(null, NonRealizationCauseCategory.CUSTOMER),
      ).toBe(1);
    });

    it('sin clasificación previa: OPERATIONAL → 0', () => {
      expect(
        service.computeReclassificationRetryDelta(null, NonRealizationCauseCategory.OPERATIONAL),
      ).toBe(0);
    });

    it('reclasificación de OPERATIONAL a CUSTOMER: incrementa retroactivamente (+1)', () => {
      expect(
        service.computeReclassificationRetryDelta(
          NonRealizationCauseCategory.OPERATIONAL,
          NonRealizationCauseCategory.CUSTOMER,
        ),
      ).toBe(1);
    });

    it('reclasificación de FORCE_MAJEURE a CUSTOMER: incrementa retroactivamente (+1)', () => {
      expect(
        service.computeReclassificationRetryDelta(
          NonRealizationCauseCategory.FORCE_MAJEURE,
          NonRealizationCauseCategory.CUSTOMER,
        ),
      ).toBe(1);
    });

    it('reclasificación de CUSTOMER a OPERATIONAL: NUNCA decrementa (0)', () => {
      expect(
        service.computeReclassificationRetryDelta(
          NonRealizationCauseCategory.CUSTOMER,
          NonRealizationCauseCategory.OPERATIONAL,
        ),
      ).toBe(0);
    });

    it('reclasificación de CUSTOMER a FORCE_MAJEURE: NUNCA decrementa (0)', () => {
      expect(
        service.computeReclassificationRetryDelta(
          NonRealizationCauseCategory.CUSTOMER,
          NonRealizationCauseCategory.FORCE_MAJEURE,
        ),
      ).toBe(0);
    });

    it('misma categoría: sin cambio (0)', () => {
      expect(
        service.computeReclassificationRetryDelta(
          NonRealizationCauseCategory.CUSTOMER,
          NonRealizationCauseCategory.CUSTOMER,
        ),
      ).toBe(0);

      expect(
        service.computeReclassificationRetryDelta(
          NonRealizationCauseCategory.OPERATIONAL,
          NonRealizationCauseCategory.OPERATIONAL,
        ),
      ).toBe(0);
    });

    it('PUERTA 2: el contador nunca baja — OPERATIONAL a CUSTOMER sube, CUSTOMER a OPERATIONAL no baja', () => {
      // Ida: sube
      expect(
        service.computeReclassificationRetryDelta(
          NonRealizationCauseCategory.OPERATIONAL,
          NonRealizationCauseCategory.CUSTOMER,
        ),
      ).toBe(1);

      // Vuelta: no baja
      expect(
        service.computeReclassificationRetryDelta(
          NonRealizationCauseCategory.CUSTOMER,
          NonRealizationCauseCategory.OPERATIONAL,
        ),
      ).toBe(0);

      // Tercera vuelta: sube otra vez (porque ahora es CUSTOMER de nuevo)
      expect(
        service.computeReclassificationRetryDelta(
          NonRealizationCauseCategory.OPERATIONAL,
          NonRealizationCauseCategory.CUSTOMER,
        ),
      ).toBe(1);
    });
  });
});
