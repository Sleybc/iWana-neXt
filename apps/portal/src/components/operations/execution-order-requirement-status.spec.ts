// C4 (OLA1): el checklist cruza la plantilla con `completion.requirements[]`
// del contrato v1 y degrada de forma visible cuando no viene.
import type { ExecutionOrderTemplateRequirement } from '@iwana/shared';
import type { ExecutionOrderRequirementStatus } from '@iwana/shared';
import {
  getRequirementChecklistItems,
  getRequirementStateText,
} from './execution-order-requirement-status';

function templateRequirement(
  overrides: Partial<ExecutionOrderTemplateRequirement> = {},
): ExecutionOrderTemplateRequirement {
  return {
    key: 'installation-activity',
    label: 'Actividad de instalación',
    required: true,
    kind: 'ACTIVITY',
    activityType: 'INSTALLATION',
    ...overrides,
  } as ExecutionOrderTemplateRequirement;
}

function status(
  overrides: Partial<ExecutionOrderRequirementStatus> = {},
): ExecutionOrderRequirementStatus {
  return {
    requirementId: 'installation-activity',
    label: 'Actividad de instalación',
    kind: 'ACTIVITY',
    satisfied: true,
    ...overrides,
  };
}

const fallback = (req: ExecutionOrderTemplateRequirement): string =>
  typeof req.label === 'string' && req.label.trim() ? req.label : 'Requisito pendiente';

describe('getRequirementChecklistItems', () => {
  it('marca cumplido sin razón cuando el backend lo declara satisfecho', () => {
    const [item] = getRequirementChecklistItems([templateRequirement()], [status()], fallback);

    expect(item?.state).toBe('satisfied');
    expect(item?.label).toBe('Actividad de instalación');
    expect(item?.reason).toBeUndefined();
    expect(item?.required).toBe(true);
  });

  it('marca pendiente con la razón real del evaluador', () => {
    const [item] = getRequirementChecklistItems(
      [templateRequirement()],
      [
        status({
          satisfied: false,
          reason: 'No se ha registrado la actividad "Actividad de instalación".',
        }),
      ],
      fallback,
    );

    expect(item?.state).toBe('pending');
    expect(item?.reason).toMatch(/No se ha registrado la actividad/);
  });

  it('conserva el badge Requerido pero no como única información', () => {
    const [item] = getRequirementChecklistItems(
      [templateRequirement()],
      [status({ satisfied: false, reason: 'Falta la actividad.' })],
      fallback,
    );

    expect(item?.required).toBe(true);
    expect(item?.reason).toBe('Falta la actividad.');
  });

  it('degrada a desconocido visible cuando requirements[] no viene (paso 8)', () => {
    const [item] = getRequirementChecklistItems([templateRequirement()], undefined, fallback);

    expect(item?.state).toBe('unknown');
    expect(item?.label).toBe('Actividad de instalación');
    expect(item?.reason).toBeUndefined();
  });

  it('marca pendiente genérico cuando el requisito no tiene estado publicado', () => {
    const [item] = getRequirementChecklistItems(
      [templateRequirement({ key: 'req-nuevo', label: 'Requisito nuevo' })],
      [status()],
      fallback,
    );

    expect(item?.state).toBe('pending');
    expect(item?.reason).toMatch(/antes de cerrar la orden/);
  });

  it('usa la etiqueta de la plantilla cuando el estado no trae etiqueta', () => {
    const [item] = getRequirementChecklistItems(
      [templateRequirement()],
      [status({ label: '   ' })],
      fallback,
    );

    expect(item?.label).toBe('Actividad de instalación');
  });
});

describe('getRequirementStateText', () => {
  it('comunica el estado en texto, no solo con color', () => {
    expect(
      getRequirementStateText({
        key: 'a',
        label: 'Actividad de instalación',
        kind: 'ACTIVITY',
        required: true,
        state: 'satisfied',
      }),
    ).toBe('Cumplido');
    expect(
      getRequirementStateText({
        key: 'b',
        label: 'Evidencia fotográfica',
        kind: 'EVIDENCE',
        required: true,
        state: 'pending',
        reason: 'Adjunta la evidencia.',
      }),
    ).toBe('Pendiente: Adjunta la evidencia.');
    expect(
      getRequirementStateText({
        key: 'c',
        label: 'Otro',
        kind: 'FIELD',
        required: true,
        state: 'unknown',
      }),
    ).toBeNull();
  });
});
