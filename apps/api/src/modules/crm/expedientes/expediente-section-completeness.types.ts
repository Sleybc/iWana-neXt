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
