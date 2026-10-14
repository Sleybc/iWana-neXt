import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { InstallationRule, NetworkType } from '@iwana/shared';
import { PlanCatalogFormPeek } from './PlanCatalogFormPeek';
import type { PlanFormValues } from './plan-catalog-helpers';

/**
 * Spec de regresión de la modalidad de velocidad con radios nativos.
 * El peek recibe muchas props; se monta con react-hook-form real y se dejan
 * como noop los handlers que no participan del flujo bajo prueba. No se aserta
 * contra vocabulario de secciones distintas al radiogroup (otro agente puede
 * estar ajustando textos del formulario en paralelo).
 */

const baseFormValues: PlanFormValues = {
  name: 'Hogar 300',
  technology: 'GPON',
  vatConcept: '',
  networkType: NetworkType.FIXED,
  speedMode: 'SYMMETRIC',
  downloadSpeedMbps: 300,
  uploadSpeedMbps: 300,
  basePrice: 89900,
  installationEnabled: false,
  installationFee: 0,
  installationRule: InstallationRule.ON_DEMAND,
};

function RenderFormPeek({ speedMode = 'SYMMETRIC' }: { speedMode?: PlanFormValues['speedMode'] }) {
  const { control, register, handleSubmit, setValue, formState } = useForm<PlanFormValues>({
    defaultValues: { ...baseFormValues, speedMode },
  });
  const noop = () => undefined;

  return (
    <PlanCatalogFormPeek
      open
      onClose={noop}
      canEdit
      editingPlan={null}
      editingPlanId={null}
      deletingPlanId={null}
      serverMessage={null}
      control={control}
      register={register}
      handleSubmit={handleSubmit}
      setValue={setValue}
      onSubmit={async () => undefined}
      errors={formState.errors}
      isSubmitting={false}
      speedMode={speedMode}
      installationEnabled={false}
      selectTechnologyOptions={['GPON']}
      effectiveTechnologyOptions={['GPON']}
      technologiesInActivePlans={new Set()}
      technologyDraft=""
      setTechnologyDraft={noop}
      editingTechnologyOriginal={null}
      setEditingTechnologyOriginal={noop}
      editingTechnologyDraft=""
      setEditingTechnologyDraft={noop}
      onAddTechnology={noop}
      onStartEditTechnology={noop}
      onSaveEditedTechnology={noop}
      onDeleteTechnology={noop}
      onRequestDelete={noop}
    />
  );
}

describe('PlanCatalogFormPeek — Modalidad de velocidad', () => {
  it('expone un grupo nativo controlado con la opción seleccionada', () => {
    render(<RenderFormPeek />);

    expect(screen.getByRole('group', { name: 'Modalidad de velocidad' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Simétrica' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Asimétrica' })).not.toBeChecked();
  });

  it('usa el cambio por teclado nativo sin añadir roles ARIA al grupo', async () => {
    const user = userEvent.setup();
    const { container } = render(<RenderFormPeek />);
    const simetrica = screen.getByRole('radio', { name: 'Simétrica' });
    simetrica.focus();
    await user.keyboard('{ArrowRight}');

    const asimetrica = screen.getByRole('radio', { name: 'Asimétrica' });
    expect(asimetrica).toBeChecked();
    expect(asimetrica).toHaveFocus();
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.querySelector('[role="radio"]')).toBeNull();
  });

  it('actualiza la selección al hacer clic', async () => {
    const user = userEvent.setup();
    render(<RenderFormPeek />);

    await user.click(screen.getByRole('radio', { name: 'Asimétrica' }));

    expect(screen.getByRole('radio', { name: 'Asimétrica' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Simétrica' })).not.toBeChecked();
  });
});
