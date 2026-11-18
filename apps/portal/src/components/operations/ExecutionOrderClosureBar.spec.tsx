// Barra de cierre (spec 2026-11-18 bloque E; dictamen R0 §3; veredicto DS «barra de cierre»).
import { fireEvent, render, screen } from '@testing-library/react';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { ExecutionOrderClosureBar } from './ExecutionOrderClosureBar';
import { PROVISIONING_REQUIREMENT_KEY } from './ExecutionOrderRequirementIndex';

const REQUIREMENTS = [
  { key: 'a', label: 'Equipo', required: true, kind: 'MATERIAL', itemCategory: 'CPE' },
  { key: 'b', label: 'Foto', required: true, kind: 'EVIDENCE', evidenceType: 'PHOTO' },
  { key: 'c', label: 'Firma', required: true, kind: 'EVIDENCE', evidenceType: 'SIGNATURE' },
  { key: 'd', label: 'Bitácora', required: false, kind: 'ACTIVITY', activityType: 'X' },
] as const;

function order(satisfied: Record<string, boolean> | null): ExecutionOrderDetailResponse {
  return {
    id: 'eo-bar',
    number: 'OTE-BAR-001',
    status: ExecutionOrderStatus.IN_PROGRESS,
    workType: WfmWorkType.INSTALLATION,
    template: { id: 't', key: 'T', version: 1, label: 'T', requirements: [...REQUIREMENTS] },
    completion: {
      progress: 0,
      completed: 0,
      total: 3,
      ...(satisfied
        ? {
            requirements: REQUIREMENTS.map((requirement) => ({
              requirementId: requirement.key,
              label: requirement.label,
              kind: requirement.kind,
              satisfied: satisfied[requirement.key] ?? false,
            })),
          }
        : {}),
    },
  } as unknown as ExecutionOrderDetailResponse;
}

function renderBar(
  satisfied: Record<string, boolean> | null,
  provisioning: { known: boolean; certified: boolean } | null = null,
) {
  const onActivateRequirement = jest.fn();
  const onGoToClose = jest.fn();
  render(
    <ExecutionOrderClosureBar
      order={order(satisfied)}
      template={null}
      provisioning={provisioning}
      onActivateRequirement={onActivateRequirement}
      onGoToClose={onGoToClose}
    />,
  );
  return { onActivateRequirement, onGoToClose };
}

describe('ExecutionOrderClosureBar', () => {
  it('cuenta solo obligatorios, nombra dos faltantes y resume el resto', () => {
    renderBar({ a: true }, { known: true, certified: false });
    expect(screen.getByText('1 de 4 obligatorios cumplidos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Foto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Firma' })).toBeInTheDocument();
    expect(screen.getByText(/y 1 más/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bitácora' })).toBeNull();
  });

  it('una etiqueta de «Falta» activa ese requisito; «Ir al cierre» solo navega', () => {
    const { onActivateRequirement, onGoToClose } = renderBar(
      { a: true, b: true, c: true },
      {
        known: true,
        certified: false,
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aprovisionamiento certificado' }));
    expect(onActivateRequirement).toHaveBeenCalledWith(PROVISIONING_REQUIREMENT_KEY);
    fireEvent.click(screen.getByRole('button', { name: 'Ir al cierre' }));
    expect(onGoToClose).toHaveBeenCalledTimes(1);
  });

  it('completa: «Todos los obligatorios están cumplidos»', () => {
    renderBar({ a: true, b: true, c: true });
    expect(screen.getByText('Todos los obligatorios están cumplidos')).toBeInTheDocument();
    expect(screen.queryByText(/Falta/)).toBeNull();
  });

  it('sin evaluación no inventa un número', () => {
    renderBar(null);
    expect(
      screen.getByText('No pudimos consultar el estado de los requisitos'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/obligatorios cumplidos/)).toBeNull();
  });
});
