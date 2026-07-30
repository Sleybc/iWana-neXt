import type { ExecutionOrderDetail, ExecutionOrderError } from './execution-orders';

describe('execution order shared contracts', () => {
  it('accepts a missing template in the detail contract', () => {
    const template: ExecutionOrderDetail['template'] = null;

    expect(template).toBeNull();
  });

  it('models closure missing requirements as product labels', () => {
    const error: ExecutionOrderError = {
      code: 'CLOSURE_GATE_INCOMPLETE',
      message: 'No se puede cerrar la OT: requisitos pendientes.',
      correlationId: '00000000-0000-4000-8000-000000000001',
      missingRequirements: ['Instalación de fibra'],
    };

    expect(error.missingRequirements).toEqual(['Instalación de fibra']);
  });
});
