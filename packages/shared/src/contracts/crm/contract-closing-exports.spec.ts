import {
  AccessPermissionKey,
  COMMERCIAL_ACTIVATION_BLOCK_REASONS,
  CONTRACT_ACTIVATED_EVENT_TYPE,
  CommercialActivationBlockReasonSchema,
  LEGAL_APPROVAL_DECLARATION,
  LEGAL_TEXT_TYPES_REQUIRING_LEGAL_APPROVAL,
  OPERATOR_CONTRACT_REQUIRED_FIELDS,
  legalTextTypeSchema,
} from '../..';

describe('cierre de venta — contrato publicado por @iwana/shared', () => {
  it('agrega CONTRACT_UNSIGNED sin perder los motivos actuales', () => {
    expect(COMMERCIAL_ACTIVATION_BLOCK_REASONS).toEqual([
      'NO_EXPEDIENTE',
      'CONTACT_REQUIRED',
      'FISCAL_INCOMPLETE',
      'CONTRACT_UNSIGNED',
    ]);
    expect(CommercialActivationBlockReasonSchema.safeParse('CONTRACT_UNSIGNED').success).toBe(true);
    expect(CommercialActivationBlockReasonSchema.safeParse('OTRO').success).toBe(false);
  });

  it('publica el permiso de aviso de pendiente de firma', () => {
    expect(AccessPermissionKey.CRM_CONTRACTS_PENDING_SIGNATURE_NOTIFY).toBe(
      'crm.contracts.pending_signature.notify',
    );
  });

  it('publica el tipo legal y la declaración', () => {
    expect(legalTextTypeSchema.options).toEqual([
      'POLITICA_TRATAMIENTO',
      'AVISO_PRIVACIDAD',
      'AUTORIZACION',
      'CONTRATO_SERVICIO',
    ]);
    expect(LEGAL_TEXT_TYPES_REQUIRING_LEGAL_APPROVAL).toEqual(['CONTRATO_SERVICIO']);
    expect(LEGAL_APPROVAL_DECLARATION).toBe('APROBADO_POR_ASESORIA_JURIDICA');
  });

  it('publica el evento y los datos obligatorios del operador', () => {
    expect(CONTRACT_ACTIVATED_EVENT_TYPE).toBe('crm.contract.activated');
    expect(OPERATOR_CONTRACT_REQUIRED_FIELDS).toHaveLength(7);
  });
});
