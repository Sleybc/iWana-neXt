import { Injectable } from '@nestjs/common';
import { CoverageCheck } from './entities/coverage-check.entity';
import { ConsentRecord } from './entities/consent-record-v2.entity';
import { ExpedienteRecord } from './entities/expediente-record.entity';
import { type CrmQuoteSnapshot } from '../ports/crm-quote-read.port';
import {
  DOCUMENT_SUPPORT_STATUS,
  getDocumentDefinitionsByPersonType,
  type StoredDocumentSupportMap,
} from './document-support.types';
import {
  INSTALLATION_READINESS_STATUS,
  type MissingRequirement,
  type SectionCompletenessItem,
  type SectionCompletenessSummary,
} from './expediente-section-completeness.types';

interface SectionRequirement {
  fieldKey: string;
  fieldLabel: string;
  fulfilled: boolean;
}

@Injectable()
export class ExpedienteSectionCompletenessService {
  calculateSummary(params: {
    expediente: ExpedienteRecord;
    consents: ConsentRecord[];
    quotes: CrmQuoteSnapshot[];
    coverageChecks: CoverageCheck[];
  }): SectionCompletenessSummary {
    const { expediente, consents, quotes, coverageChecks } = params;
    const sections = [
      this.buildIdentificationSection(expediente),
      this.buildAddressSection(expediente),
      this.buildContactSection(expediente),
      this.buildTechnicalSection(expediente, coverageChecks),
      this.buildCustomerInterestSection(expediente, quotes),
      this.buildLegalComplianceSection(expediente, consents),
      this.buildDocumentSupportSection(expediente),
    ];

    const overallPercentage =
      sections.length === 0
        ? 0
        : Math.round(
            sections.reduce((total, section) => total + section.percentage, 0) / sections.length,
          );
    const missingRequirements = sections.flatMap((section) => section.missingFields);

    return {
      sections,
      overallPercentage,
      installationReadiness: this.buildInstallationReadiness(
        overallPercentage,
        missingRequirements,
      ),
      missingRequirements,
    };
  }

  private buildIdentificationSection(expediente: ExpedienteRecord): SectionCompletenessItem {
    return this.buildSection('identification', 'Identificación', [
      {
        fieldKey: 'fullName',
        fieldLabel: 'Nombre completo o razón social',
        fulfilled: this.hasText(expediente.fullName) || this.hasText(expediente.companyName),
      },
      {
        fieldKey: 'personType',
        fieldLabel: 'Tipo de persona',
        fulfilled: this.hasText(expediente.personType),
      },
      {
        fieldKey: 'documentType',
        fieldLabel: 'Tipo de documento',
        fulfilled: this.hasText(expediente.documentType),
      },
      {
        fieldKey: 'documentNumberEncrypted',
        fieldLabel: 'Documento',
        fulfilled: this.hasText(expediente.documentNumberEncrypted),
      },
    ]);
  }

  private buildAddressSection(expediente: ExpedienteRecord): SectionCompletenessItem {
    // La sección Dirección debe reflejar únicamente los campos visibles del formulario de ubicación.
    // Las coordenadas se capturan desde Viabilidad técnica y no deben completar esta sección.
    return this.buildSection('address', 'Dirección', [
      {
        fieldKey: 'address',
        fieldLabel: 'Dirección principal',
        fulfilled: this.hasText(expediente.address),
      },
      {
        fieldKey: 'municipality',
        fieldLabel: 'Municipio',
        fulfilled: this.hasText(expediente.municipality),
      },
      {
        fieldKey: 'department',
        fieldLabel: 'Departamento',
        fulfilled: this.hasText(expediente.department),
      },
      {
        fieldKey: 'postalCode',
        fieldLabel: 'Código postal',
        fulfilled: this.hasText(expediente.postalCode),
      },
      {
        fieldKey: 'stratum',
        fieldLabel: 'Estrato',
        fulfilled: expediente.stratum != null,
      },
      {
        fieldKey: 'neighborhood',
        fieldLabel: 'Sector / barrio',
        fulfilled: this.hasText(expediente.neighborhood),
      },
    ]);
  }

  private buildContactSection(expediente: ExpedienteRecord): SectionCompletenessItem {
    // Cuatro campos del formulario del portal: phonePrimary, emailPrimary, altContactName, altContactPhone.
    // contactPreference y bestContactTime no tienen campo en el formulario y no se evalúan.
    return this.buildSection('contact', 'Contacto', [
      {
        fieldKey: 'phonePrimaryEncrypted',
        fieldLabel: 'Teléfono principal',
        fulfilled: this.hasText(expediente.phonePrimaryEncrypted),
      },
      {
        fieldKey: 'emailPrimaryEncrypted',
        fieldLabel: 'Correo principal',
        fulfilled: this.hasText(expediente.emailPrimaryEncrypted),
      },
      {
        fieldKey: 'altContactName',
        fieldLabel: 'Nombre contacto alternativo',
        fulfilled: this.hasText(expediente.altContactName),
      },
      {
        fieldKey: 'altContactPhoneEncrypted',
        fieldLabel: 'Teléfono contacto alternativo',
        fulfilled: this.hasText(expediente.altContactPhoneEncrypted),
      },
    ]);
  }

  private buildTechnicalSection(
    expediente: ExpedienteRecord,
    _coverageChecks: CoverageCheck[],
  ): SectionCompletenessItem {
    const hasCoordinates = expediente.latitude != null && expediente.longitude != null;

    // Viabilidad técnica requiere el bloque técnico más las coordenadas capturadas en esta misma sección.
    // coverageResult no tiene campo propio en el formulario; se evalúa feasibility directamente.
    return this.buildSection('technicalFeasibility', 'Viabilidad técnica', [
      {
        fieldKey: 'feasibility',
        fieldLabel: 'Resultado de viabilidad',
        fulfilled: this.hasText(expediente.feasibility),
      },
      {
        fieldKey: 'candidateTechnologies',
        fieldLabel: 'Opciones viables',
        fulfilled: (expediente.candidateTechnologies?.length ?? 0) > 0,
      },
      {
        fieldKey: 'evaluationSource',
        fieldLabel: 'Fuente de evaluación',
        fulfilled: this.hasText(expediente.evaluationSource),
      },
      {
        fieldKey: 'technicalConfidence',
        fieldLabel: 'Nivel de certeza',
        fulfilled: this.hasText(expediente.technicalConfidence),
      },
      {
        fieldKey: 'coordinates',
        fieldLabel: 'Coordenadas de validación',
        fulfilled: hasCoordinates,
      },
    ]);
  }

  private buildCustomerInterestSection(
    expediente: ExpedienteRecord,
    _quotes: CrmQuoteSnapshot[],
  ): SectionCompletenessItem {
    // El formulario de Interés del cliente expone: interestedPlanId y acquisitionChannel.
    // casePriority y quotes no tienen campo en esta sección del formulario.
    // Seleccionar un plan + tener canal de adquisición = 100%.
    return this.buildSection('customerInterest', 'Interés del cliente', [
      {
        fieldKey: 'acquisitionChannel',
        fieldLabel: 'Canal u origen de la oportunidad',
        fulfilled: this.hasText(expediente.acquisitionChannel) || this.hasText(expediente.source),
      },
      {
        fieldKey: 'interestedPlanId',
        fieldLabel: 'Plan de interés',
        fulfilled: this.hasText(expediente.interestedPlanId),
      },
    ]);
  }

  private buildLegalComplianceSection(
    expediente: ExpedienteRecord,
    _consents: ConsentRecord[],
  ): SectionCompletenessItem {
    // El formulario de Cumplimiento legal solo expone 2 campos: identityVerified y legalComplianceStatus.
    // Los consentimientos se gestionan en el módulo Habeas Data y no bloquean esta sección.
    return this.buildSection('legalCompliance', 'Cumplimiento legal', [
      {
        fieldKey: 'identityVerified',
        fieldLabel: 'Verificación de identidad',
        fulfilled: this.hasText(expediente.identityVerified),
      },
      {
        fieldKey: 'legalComplianceStatus',
        fieldLabel: 'Estado legal del expediente',
        fulfilled: this.hasText(expediente.legalComplianceStatus),
      },
    ]);
  }

  private buildDocumentSupportSection(expediente: ExpedienteRecord): SectionCompletenessItem {
    const definitions = getDocumentDefinitionsByPersonType(expediente.personType);
    const supports =
      expediente.documentSupports && typeof expediente.documentSupports === 'object'
        ? (expediente.documentSupports as StoredDocumentSupportMap)
        : {};

    const requirements =
      definitions.length > 0
        ? definitions.map((definition) => ({
            fieldKey: definition.key,
            fieldLabel: definition.label,
            fulfilled:
              supports[definition.key]?.versions?.[0]?.status === DOCUMENT_SUPPORT_STATUS.APPROVED,
          }))
        : [
            {
              fieldKey: 'documentSupport',
              fieldLabel: 'Soportes documentales',
              fulfilled: false,
            },
          ];

    return this.buildSection('documentSupport', 'Soportes documentales', requirements);
  }

  private buildSection(
    key: string,
    label: string,
    requirements: SectionRequirement[],
  ): SectionCompletenessItem {
    const completedFields = requirements.filter((requirement) => requirement.fulfilled).length;
    const totalFields = requirements.length;
    const missingFields: MissingRequirement[] = requirements
      .filter((requirement) => !requirement.fulfilled)
      .map((requirement) => ({
        sectionKey: key,
        sectionLabel: label,
        fieldKey: requirement.fieldKey,
        fieldLabel: requirement.fieldLabel,
      }));

    return {
      key,
      label,
      percentage: totalFields === 0 ? 0 : Math.round((completedFields / totalFields) * 100),
      completedFields,
      totalFields,
      missingFields,
    };
  }

  private buildInstallationReadiness(
    overallPercentage: number,
    missingRequirements: MissingRequirement[],
  ) {
    if (overallPercentage < 75) {
      return {
        status: INSTALLATION_READINESS_STATUS.NOT_READY,
        canTransition: false,
        title: 'Información insuficiente para continuar a instalación',
        message:
          'La oportunidad aún no supera el 75% de avance general. Completa los pendientes críticos antes de avanzar.',
      };
    }

    if (overallPercentage >= 100 && missingRequirements.length === 0) {
      return {
        status: INSTALLATION_READINESS_STATUS.READY_COMPLETE,
        canTransition: true,
        title: 'Expediente completo para instalación',
        message: 'La oportunidad tiene el 100% de avance general y puede avanzar sin pendientes.',
      };
    }

    return {
      status: INSTALLATION_READINESS_STATUS.READY_WITH_PENDING,
      canTransition: true,
      title: 'Puedes continuar a instalación con información pendiente',
      message:
        'La oportunidad ya supera el 75% de avance general. Aún faltan datos por cerrar en algunas secciones. Recomendamos completarlos lo antes posible para evitar reprocesos en instalación.',
    };
  }

  private hasText(value: string | null | undefined): boolean {
    return Boolean(value?.trim());
  }
}
