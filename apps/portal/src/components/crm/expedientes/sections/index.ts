export { IdentificationSection } from './IdentificationSection';
export { ContactSection } from './ContactSection';
export { LocationSection } from './LocationSection';
export { CommercialInterestSection } from './CommercialInterestSection';
export { TechnicalFeasibilitySection } from './TechnicalFeasibilitySection';
export { LegalConsentSection } from './LegalConsentSection';
export { BillingSection } from './BillingSection';
export { InstallationSection } from './InstallationSection';
export { ExpedienteSections } from './ExpedienteSections';
export type { SectionId, DraftValues, SectionConfig, CompletenessDimension } from './types';
export {
  SECTIONS,
  FIELD_LABELS,
  FIELD_PLACEHOLDERS,
  EMPTY_VALUE,
  DIMENSION_SECTION_GROUPS,
  getIdentificationRelevantFields,
  hasPersistedIdentificationData,
  getSectionRenderFields,
  getSectionPayloadFields,
  getSectionCompletionFields,
  buildDraftValues,
  getCandidateTechnologiesFromDraft,
  calculateSectionCompletion,
  calculateDocumentSupportCompletion,
  calculateDimensionCompletion,
  getProtectedFieldHelper,
  DEFAULT_PRODUCTS,
  ACQUISITION_CHANNEL_OPTIONS,
  DEPARTAMENTO_DEFAULT,
  DEPARTAMENTOS,
  DOCUMENT_TYPE_OPTIONS,
  EVALUATION_SOURCE_OPTIONS,
  TECHNICAL_CONFIDENCE_OPTIONS,
  TECHNICAL_VIABILITY_RESULT_OPTIONS,
  TECHNOLOGY_OPTION_OPTIONS,
  getMunicipiosByDepartamento,
} from './constants';
