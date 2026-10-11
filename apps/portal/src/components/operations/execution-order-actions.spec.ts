import { getRequirementAction, requirementActionLabel } from './execution-order-actions';

describe('execution-order-actions', () => {
  it('etiqueta el registro de material con el nombre del requisito del snapshot', () => {
    const requirement = {
      key: 'custom-material-key',
      label: 'Materiales usados en la instalación',
      required: false,
      kind: 'MATERIAL',
      itemCategory: 'CONSUMIBLESFO',
    } as const;

    const action = getRequirementAction(requirement, ['REGISTER_ITEM_USAGE']);

    expect(action).toMatchObject({
      kind: 'consumption',
      requirementKey: 'custom-material-key',
      requirementLabel: 'Materiales usados en la instalación',
    });
    if (!action || action.kind !== 'consumption') throw new Error('Falta la acción del requisito.');
    expect(requirementActionLabel(action)).toBe('Registrar materiales usados en la instalación');
  });
});
