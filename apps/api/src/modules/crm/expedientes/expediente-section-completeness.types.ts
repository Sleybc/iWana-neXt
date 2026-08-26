import type { DocumentSupportApprovedFlags } from './document-support.types';

export const INSTALLATION_READINESS_STATUS = {
  NOT_READY: 'NOT_READY',
  READY_WITH_PENDING: 'READY_WITH_PENDING',
  READY_COMPLETE: 'READY_COMPLETE',
} as const;

export type InstallationReadinessStatus =
  (typeof INSTALLATION_READINESS_STATUS)[keyof typeof INSTALLATION_READINESS_STATUS];

export interface MissingRequirement {
  sectionKey: string;
  sectionLabel: string;
  fieldKey: string;
  fieldLabel: string;
}

export interface ExpedienteSensitiveFieldPresence {
  documentNumber: boolean;
  phonePrimary: boolean;
  emailPrimary: boolean;
  altContactPhone: boolean;
  companyName?: boolean;
  altContactName?: boolean;
  paymentMethod?: boolean;
  billingCycle?: boolean;
  fiscalName?: boolean;
  hasAddress?: boolean;
  hasMunicipality?: boolean;
  hasDepartment?: boolean;
  hasPostalCode?: boolean;
  hasStratum?: boolean;
  hasNeighborhood?: boolean;
  hasLatitude?: boolean;
  hasLongitude?: boolean;
  hasLocation?: boolean;
  documentSupportApproved?: DocumentSupportApprovedFlags;
}

export interface SectionCompletenessItem {
  key: string;
  label: string;
  percentage: number;
  completedFields: number;
  totalFields: number;
  missingFields: MissingRequirement[];
}

export interface InstallationReadinessSummary {
  status: InstallationReadinessStatus;
  canTransition: boolean;
  title: string;
  message: string;
}

export interface SectionCompletenessSummary {
  sections: SectionCompletenessItem[];
  overallPercentage: number;
  installationReadiness: InstallationReadinessSummary;
  missingRequirements: MissingRequirement[];
}
