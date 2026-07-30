import type { ExecutionOrderTemplateRequirement as TemplateRequirement } from '@iwana/shared';
import { ClosureGateEvaluatorService } from '../services/closure-gate-evaluator.service';

/**
 * Tests del evaluador determinista del gate de cierre.
 *
 * ADR-068: El gate evalúa los requisitos de la plantilla contra el estado
 * de la OT y devuelve faltantes accionables (no booleanos opacos).
 *
 * UX spec §6: "El gate de cierre enumera faltantes accionables."
 */

const makeReq = (overrides: Partial<TemplateRequirement> & { kind: string }): TemplateRequirement =>
  ({
    key: 'req-001',
    label: 'Requisito genérico',
    required: true,
    ...overrides,
  }) as TemplateRequirement;

describe('ClosureGateEvaluatorService', () => {
  let evaluator: ClosureGateEvaluatorService;

  beforeEach(() => {
    evaluator = new ClosureGateEvaluatorService();
  });

  describe('evaluate', () => {
    it('should pass when all required requirements are satisfied', () => {
      const reqs: TemplateRequirement[] = [
        makeReq({
          key: 'actividad-instalacion',
          label: 'Actividad de instalación',
          kind: 'ACTIVITY',
          activityType: 'INSTALLATION',
        } as any),
        makeReq({
          key: 'foto-cpe',
          label: 'Foto del CPE',
          kind: 'EVIDENCE',
          evidenceType: 'PHOTO',
        } as any),
      ];

      const result = evaluator.evaluate(reqs, {
        activities: [{ activityType: 'INSTALLATION' }],
        evidences: [{ evidenceType: 'PHOTO', requirementKey: 'foto-cpe' }],
      });

      expect(result.passed).toBe(true);
      expect(result.missingRequirements).toHaveLength(0);
    });

    it('should return actionable missing requirements when gate is incomplete', () => {
      const reqs: TemplateRequirement[] = [
        makeReq({
          key: 'firma-cliente',
          label: 'Firma del cliente',
          required: true,
          kind: 'EVIDENCE',
          evidenceType: 'SIGNATURE',
        } as any),
        makeReq({
          key: 'medicion-potencia',
          label: 'Potencia óptica',
          required: true,
          kind: 'MEASUREMENT',
          measurement: 'NUMBER',
          unit: 'dBm',
        } as any),
      ];

      const result = evaluator.evaluate(reqs, {
        evidences: [],
        measurements: [],
      });

      expect(result.passed).toBe(false);
      expect(result.missingRequirements).toHaveLength(2);
      const first = result.missingRequirements[0]!;
      expect(first).toHaveProperty('requirementId');
      expect(first).toHaveProperty('label');
      expect(first).toHaveProperty('kind');
      expect(first).toHaveProperty('reason');
      expect(first.satisfied).toBe(false);
    });

    it('should skip optional requirements', () => {
      const reqs: TemplateRequirement[] = [
        makeReq({
          key: 'foto-cpe',
          label: 'Foto CPE',
          required: true,
          kind: 'EVIDENCE',
          evidenceType: 'PHOTO',
        } as any),
        makeReq({
          key: 'nota-adicional',
          label: 'Nota adicional',
          required: false,
          kind: 'FIELD',
          fieldType: 'TEXT',
        } as any),
      ];

      const result = evaluator.evaluate(reqs, {
        evidences: [{ evidenceType: 'PHOTO', requirementKey: 'foto-cpe' }],
        fieldData: {},
      });

      expect(result.passed).toBe(true);
      expect(result.missingRequirements).toHaveLength(0);
    });

    it('should pass with non-required unsatisfied but gate only checks required', () => {
      const reqs: TemplateRequirement[] = [
        makeReq({
          key: 'firma-cliente',
          label: 'Firma',
          required: true,
          kind: 'EVIDENCE',
          evidenceType: 'SIGNATURE',
        } as any),
      ];

      const result = evaluator.evaluate(reqs, {
        evidences: [{ evidenceType: 'SIGNATURE', requirementKey: 'firma-cliente' }],
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('FIELD requirement', () => {
    it('should pass when field data is present', () => {
      const req: TemplateRequirement = makeReq({
        key: 'observaciones',
        label: 'Observaciones',
        kind: 'FIELD',
        fieldType: 'TEXT',
      } as any);
      const result = evaluator.evaluate([req], { fieldData: { observaciones: 'Todo OK' } });
      expect(result.passed).toBe(true);
    });

    it('should fail when field data is missing', () => {
      const req: TemplateRequirement = makeReq({
        key: 'observaciones',
        label: 'Observaciones',
        kind: 'FIELD',
        fieldType: 'TEXT',
      } as any);
      const result = evaluator.evaluate([req], { fieldData: {} });
      expect(result.passed).toBe(false);
    });
  });

  describe('ACTIVITY requirement', () => {
    it('should pass when at least one activity of matching type exists', () => {
      const req: TemplateRequirement = makeReq({
        key: 'act-instalacion',
        label: 'Instalación',
        kind: 'ACTIVITY',
        activityType: 'INSTALLATION',
      } as any);
      const result = evaluator.evaluate([req], { activities: [{ activityType: 'INSTALLATION' }] });
      expect(result.passed).toBe(true);
    });

    it('should fail when no matching activity type', () => {
      const req: TemplateRequirement = makeReq({
        key: 'act-instalacion',
        label: 'Instalación',
        kind: 'ACTIVITY',
        activityType: 'INSTALLATION',
      } as any);
      const result = evaluator.evaluate([req], { activities: [{ activityType: 'CONFIGURATION' }] });
      expect(result.passed).toBe(false);
    });

    it('uses the canonical Spanish product label instead of the technical activity type', () => {
      const req: TemplateRequirement = makeReq({
        key: 'act-instalacion',
        label: 'Instalación de fibra',
        kind: 'ACTIVITY',
        activityType: 'INSTALLATION',
      } as any);

      const result = evaluator.evaluate([req], { activities: [] });

      expect(result.missingRequirements[0]).toEqual(
        expect.objectContaining({
          requirementId: 'act-instalacion',
          label: 'Instalación de fibra',
        }),
      );
      expect(result.missingRequirements[0]?.reason).toBe(
        'No se ha registrado la actividad "Instalación de fibra".',
      );
      expect(result.missingRequirements[0]?.reason).not.toContain('INSTALLATION');
    });

    it('uses a safe generic label when an activity label is empty', () => {
      const req: TemplateRequirement = makeReq({
        key: 'act-instalacion',
        label: '',
        kind: 'ACTIVITY',
        activityType: 'INSTALLATION',
      } as any);

      const result = evaluator.evaluate([req], { activities: [] });

      expect(result.missingRequirements[0]?.label).toBe('Actividad requerida');
      expect(result.missingRequirements[0]?.reason).toBe(
        'No se ha registrado la actividad requerida.',
      );
      expect(result.missingRequirements[0]?.reason).not.toContain('INSTALLATION');
    });
  });

  describe('MEASUREMENT requirement', () => {
    it('should pass when measurement with matching key exists', () => {
      const req: TemplateRequirement = makeReq({
        key: 'potencia-rx',
        label: 'Potencia RX',
        kind: 'MEASUREMENT',
        measurement: 'NUMBER',
        unit: 'dBm',
      } as any);
      const result = evaluator.evaluate([req], {
        measurements: [{ key: 'potencia-rx', value: -18.5 }],
      });
      expect(result.passed).toBe(true);
    });

    it('should fail when measurement is missing', () => {
      const req: TemplateRequirement = makeReq({
        key: 'potencia-rx',
        label: 'Potencia RX',
        kind: 'MEASUREMENT',
        measurement: 'NUMBER',
        unit: 'dBm',
      } as any);
      const result = evaluator.evaluate([req], { measurements: [] });
      expect(result.passed).toBe(false);
    });
  });

  describe('EVIDENCE requirement', () => {
    it('should pass when evidence with matching requirementKey exists', () => {
      const req: TemplateRequirement = makeReq({
        key: 'foto-cpe',
        label: 'Foto CPE',
        kind: 'EVIDENCE',
        evidenceType: 'PHOTO',
      } as any);
      const result = evaluator.evaluate([req], {
        evidences: [{ evidenceType: 'PHOTO', requirementKey: 'foto-cpe' }],
      });
      expect(result.passed).toBe(true);
    });

    it('should fail when evidence is missing', () => {
      const req: TemplateRequirement = makeReq({
        key: 'foto-cpe',
        label: 'Foto CPE',
        kind: 'EVIDENCE',
        evidenceType: 'PHOTO',
      } as any);
      const result = evaluator.evaluate([req], { evidences: [] });
      expect(result.passed).toBe(false);
    });
  });

  describe('MATERIAL requirement', () => {
    it('should pass when at least one item usage exists', () => {
      const req: TemplateRequirement = makeReq({
        key: 'cpe-equipo',
        label: 'CPE/Equipo',
        kind: 'MATERIAL',
        itemCategory: 'CPE',
      } as any);
      const result = evaluator.evaluate([req], {
        itemUsages: [{ itemId: 'item-001', itemCategory: 'CPE', requirementKey: 'cpe-equipo' }],
      });
      expect(result.passed).toBe(true);
    });

    it('should fail when the consumed item category does not match the requirement', () => {
      const req: TemplateRequirement = makeReq({
        key: 'cpe-equipo',
        label: 'CPE/Equipo',
        kind: 'MATERIAL',
        itemCategory: 'CPE',
      } as unknown as TemplateRequirement);
      const result = evaluator.evaluate([req], {
        itemUsages: [{ itemId: 'item-001', itemCategory: 'CABLE', requirementKey: 'cpe-equipo' }],
      });
      expect(result.passed).toBe(false);
    });

    it('should fail when no item usage', () => {
      const req: TemplateRequirement = makeReq({
        key: 'cpe-equipo',
        label: 'CPE/Equipo',
        kind: 'MATERIAL',
        itemCategory: 'CPE',
      } as any);
      const result = evaluator.evaluate([req], { itemUsages: [] });
      expect(result.passed).toBe(false);
    });

    it('uses the canonical Spanish product label instead of the technical item category', () => {
      const req: TemplateRequirement = makeReq({
        key: 'cpe-equipo',
        label: 'Equipo del cliente',
        kind: 'MATERIAL',
        itemCategory: 'CPE',
      } as any);

      const result = evaluator.evaluate([req], { itemUsages: [] });

      expect(result.missingRequirements[0]).toEqual(
        expect.objectContaining({
          requirementId: 'cpe-equipo',
          label: 'Equipo del cliente',
        }),
      );
      expect(result.missingRequirements[0]?.reason).toBe(
        'No se ha registrado el material "Equipo del cliente".',
      );
      expect(result.missingRequirements[0]?.reason).not.toContain('CPE');
    });

    it('uses a safe generic label when a material label is empty', () => {
      const req: TemplateRequirement = makeReq({
        key: 'cpe-equipo',
        label: '',
        kind: 'MATERIAL',
        itemCategory: 'CPE',
      } as any);

      const result = evaluator.evaluate([req], { itemUsages: [] });

      expect(result.missingRequirements[0]?.label).toBe('Material requerido');
      expect(result.missingRequirements[0]?.reason).toBe(
        'No se ha registrado el material requerido.',
      );
      expect(result.missingRequirements[0]?.reason).not.toContain('CPE');
    });
  });

  describe('COMPLIANCE requirement', () => {
    it('should pass when customer acceptance is present', () => {
      const req: TemplateRequirement = makeReq({
        key: 'aceptacion',
        label: 'Aceptación',
        kind: 'COMPLIANCE',
        policyKey: 'customer-acceptance',
      } as any);
      const result = evaluator.evaluate([req], { hasCustomerAcceptance: true });
      expect(result.passed).toBe(true);
    });

    it('should pass when close command has customerAcceptance', () => {
      const req: TemplateRequirement = makeReq({
        key: 'aceptacion',
        label: 'Aceptación',
        kind: 'COMPLIANCE',
        policyKey: 'customer-acceptance',
      } as any);
      const result = evaluator.evaluate([req], {
        closeCommand: { customerAcceptance: { artifactId: 'art-001', method: 'SIGNATURE' } },
      });
      expect(result.passed).toBe(true);
    });

    it('should fail without customer acceptance', () => {
      const req: TemplateRequirement = makeReq({
        key: 'aceptacion',
        label: 'Aceptación',
        kind: 'COMPLIANCE',
        policyKey: 'customer-acceptance',
      } as any);
      const result = evaluator.evaluate([req], {});
      expect(result.passed).toBe(false);
    });
  });

  it('should fail closed for an unknown requirement kind', () => {
    const req = makeReq({
      key: 'unsupported',
      label: 'Requisito no soportado',
      kind: 'UNSUPPORTED',
    } as unknown as TemplateRequirement);

    const result = evaluator.evaluate([req], {});

    expect(result.passed).toBe(false);
    expect(result.missingRequirements[0]?.satisfied).toBe(false);
  });

  describe('evaluate against frozen snapshot, not live template', () => {
    it('should evaluate against the provided snapshot array', () => {
      // The evaluator receives the requirements array directly; it doesn't
      // fetch the template. This guarantees it evaluates against the frozen
      // snapshot appended to the OT at creation time.
      const snapshot: TemplateRequirement[] = [
        makeReq({
          key: 'v1-only',
          label: 'Requisito v1',
          required: true,
          kind: 'FIELD',
          fieldType: 'TEXT',
        } as any),
      ];

      // If live template had more requirements, they wouldn't be in the snapshot
      const result = evaluator.evaluate(snapshot, { fieldData: { 'v1-only': 'ok' } });
      expect(result.passed).toBe(true);
    });
  });

  describe('reasonForRequirement', () => {
    it('should generate a human-readable reason for FIELD', () => {
      const req = makeReq({
        key: 'obs',
        label: 'Observaciones',
        kind: 'FIELD',
        fieldType: 'TEXT',
      } as any);
      const result = evaluator.evaluate([req], { fieldData: {} });
      expect(result.missingRequirements[0]!.reason).toContain('Observaciones');
    });

    it('should generate a human-readable reason for EVIDENCE', () => {
      const req = makeReq({
        key: 'foto',
        label: 'Foto CPE',
        kind: 'EVIDENCE',
        evidenceType: 'PHOTO',
      } as any);
      const result = evaluator.evaluate([req], { evidences: [] });
      expect(result.missingRequirements[0]!.reason).toContain('foto');
    });

    it('should translate SIGNATURE to "firma" in reason', () => {
      const req = makeReq({
        key: 'firma',
        label: 'Firma cliente',
        kind: 'EVIDENCE',
        evidenceType: 'SIGNATURE',
      } as any);
      const result = evaluator.evaluate([req], { evidences: [] });
      expect(result.missingRequirements[0]!.reason).toContain('firma');
    });
  });
});
