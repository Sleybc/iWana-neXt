import type {
  ExecutionOrderDetail,
  ExecutionOrderError,
  RegisterEvidenceCommand,
} from './execution-orders';

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

  it('models nullable capturedAt explicitly in evidence requests', () => {
    const command: RegisterEvidenceCommand = {
      mediaAssetId: '00000000-0000-4000-8000-000000000001',
      evidenceType: 'PHOTO',
      requirementKey: 'req-photo',
      expiresAt: '2099-06-25T14:00:00.000Z',
      capturedAt: null,
    };

    expect(command.capturedAt).toBeNull();
  });
});
