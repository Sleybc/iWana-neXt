import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { InstallationRule } from '@iwana/shared';
import { PlanCatalogFormPeek } from './PlanCatalogFormPeek';
import type { PlanFormValues } from './plan-catalog-helpers';

/**
 * Spec de regresión del radiogroup «Modalidad de velocidad» (roving tabIndex).
 * El peek recibe muchas props; se monta con react-hook-form real y se dejan
 * como noop los handlers que no participan del flujo bajo prueba. No se aserta
 * contra vocabulario de secciones distintas al radiogroup (otro agente puede
 * estar ajustando textos del formulario en paralelo).
 */

const baseFormValues: PlanFormValues = {
  name: 'Hogar 300',
  technology: 'GPON',
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

describe('PlanCatalogFormPeek — Modalidad de velocidad (radiogroup)', () => {
  it('aplica roving tabindex: la opción seleccionada queda en el orden de tabulación', () => {
    render(<RenderFormPeek />);

    expect(screen.getByRole('radio', { name: 'Simétrica' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Simétrica' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Asimétrica' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Asimétrica' })).toHaveAttribute('tabindex', '-1');
  });

  it('cambia la selección a Asimétrica y mueve el foco con ArrowRight', () => {
    render(<RenderFormPeek />);

    const simetrica = screen.getByRole('radio', { name: 'Simétrica' });
    simetrica.focus();
    fireEvent.keyDown(simetrica, { key: 'ArrowRight' });

    const asimetrica = screen.getByRole('radio', { name: 'Asimétrica' });
    expect(asimetrica).toHaveAttribute('aria-checked', 'true');
    expect(asimetrica).toHaveAttribute('tabindex', '0');
    expect(asimetrica).toHaveFocus();
    expect(simetrica).toHaveAttribute('aria-checked', 'false');
    expect(simetrica).toHaveAttribute('tabindex', '-1');
  });

  it('cambia la selección a Asimétrica con ArrowDown', () => {
    render(<RenderFormPeek />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Simétrica' }), { key: 'ArrowDown' });

    expect(screen.getByRole('radio', { name: 'Asimétrica' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Simétrica' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('vuelve a Simétrica con ArrowLeft', () => {
    render(<RenderFormPeek speedMode="ASYMMETRIC" />);

    const asimetrica = screen.getByRole('radio', { name: 'Asimétrica' });
    asimetrica.focus();
    fireEvent.keyDown(asimetrica, { key: 'ArrowLeft' });

    expect(screen.getByRole('radio', { name: 'Simétrica' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Simétrica' })).toHaveFocus();
    expect(asimetrica).toHaveAttribute('aria-checked', 'false');
  });

  it('salta a la primera y última opción con Home y End', () => {
    render(<RenderFormPeek />);

    const simetrica = screen.getByRole('radio', { name: 'Simétrica' });
    simetrica.focus();
    fireEvent.keyDown(simetrica, { key: 'End' });

    const asimetrica = screen.getByRole('radio', { name: 'Asimétrica' });
    expect(asimetrica).toHaveAttribute('aria-checked', 'true');
    expect(asimetrica).toHaveFocus();

    fireEvent.keyDown(asimetrica, { key: 'Home' });

    expect(simetrica).toHaveAttribute('aria-checked', 'true');
    expect(simetrica).toHaveFocus();
  });
});
