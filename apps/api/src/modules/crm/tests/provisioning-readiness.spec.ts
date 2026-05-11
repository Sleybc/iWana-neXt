import { ExpedienteStatus, SubscriberStatus } from '@iwana/shared';
import {
  evaluateProvisioningReadiness,
  isBlockingLegalComplianceStatus,
  PROVISIONING_READINESS_STATUS,
} from '../provisioning-readiness';

describe('provisioning-readiness', () => {
  it('retorna LISTO_PARA_APROVISIONAR cuando cumple requisitos mínimos', () => {
    const result = evaluateProvisioningReadiness({
      expedienteStatus: ExpedienteStatus.INSTALACION_AGENDADA,
      subscriberStatus: SubscriberStatus.PROSPECT,
      hasPartyOrDocument: true,
      hasInstallationAddress: true,
      hasSiteContact: true,
      hasCommercialOffer: true,
      hasTechnologyDefinition: true,
      hasTicketReference: true,
      hasWorkOrderReference: true,
      hasAssignedTechnician: true,
      hasMinimumConsent: true,
      isBlocked: false,
      blockedReason: null,
      hasRetryableError: false,
      retryableErrorMessage: null,
    });

    expect(result.status).toBe(PROVISIONING_READINESS_STATUS.LISTO_PARA_APROVISIONAR);
    expect(result.canProvision).toBe(true);
    expect(result.missingRequirements).toEqual([]);
  });

  it('retorna PENDIENTE_DE_DATOS cuando faltan requisitos', () => {
    const result = evaluateProvisioningReadiness({
      expedienteStatus: ExpedienteStatus.INSTALACION_AGENDADA,
      subscriberStatus: SubscriberStatus.PROSPECT,
      hasPartyOrDocument: false,
      hasInstallationAddress: true,
      hasSiteContact: false,
      hasCommercialOffer: true,
      hasTechnologyDefinition: true,
      hasTicketReference: false,
      hasWorkOrderReference: true,
      hasAssignedTechnician: true,
      hasMinimumConsent: true,
      isBlocked: false,
      blockedReason: null,
      hasRetryableError: false,
      retryableErrorMessage: null,
    });

    expect(result.status).toBe(PROVISIONING_READINESS_STATUS.PENDIENTE_DE_DATOS);
    expect(result.canProvision).toBe(false);
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        'Documento o party del suscriptor',
        'Contacto operativo de instalación',
        'Ticket de instalación',
      ]),
    );
  });

  it('retorna BLOQUEADO cuando hay bloqueo explícito', () => {
    const result = evaluateProvisioningReadiness({
      expedienteStatus: ExpedienteStatus.INSTALACION_AGENDADA,
      subscriberStatus: SubscriberStatus.PROSPECT,
      hasPartyOrDocument: true,
      hasInstallationAddress: true,
      hasSiteContact: true,
      hasCommercialOffer: true,
      hasTechnologyDefinition: true,
      hasTicketReference: true,
      hasWorkOrderReference: true,
      hasAssignedTechnician: true,
      hasMinimumConsent: true,
      isBlocked: true,
      blockedReason: 'Consentimiento revocado',
      hasRetryableError: false,
      retryableErrorMessage: null,
    });

    expect(result.status).toBe(PROVISIONING_READINESS_STATUS.BLOQUEADO);
    expect(result.message).toContain('Consentimiento revocado');
    expect(result.canProvision).toBe(false);
  });

  it('retorna ERROR_REINTENTABLE cuando falla sincronización', () => {
    const result = evaluateProvisioningReadiness({
      expedienteStatus: ExpedienteStatus.INSTALACION_AGENDADA,
      subscriberStatus: SubscriberStatus.PROSPECT,
      hasPartyOrDocument: true,
      hasInstallationAddress: true,
      hasSiteContact: true,
      hasCommercialOffer: true,
      hasTechnologyDefinition: true,
      hasTicketReference: true,
      hasWorkOrderReference: true,
      hasAssignedTechnician: true,
      hasMinimumConsent: true,
      isBlocked: false,
      blockedReason: null,
      hasRetryableError: true,
      retryableErrorMessage: 'Error de integración temporal',
    });

    expect(result.status).toBe(PROVISIONING_READINESS_STATUS.ERROR_REINTENTABLE);
    expect(result.retryable).toBe(true);
    expect(result.message).toContain('Error de integración temporal');
  });

  it('detecta estados legales que deben bloquear', () => {
    expect(isBlockingLegalComplianceStatus('NO_AUTORIZA')).toBe(true);
    expect(isBlockingLegalComplianceStatus('rechazado')).toBe(true);
    expect(isBlockingLegalComplianceStatus('válido')).toBe(false);
    expect(isBlockingLegalComplianceStatus(null)).toBe(false);
  });
});
