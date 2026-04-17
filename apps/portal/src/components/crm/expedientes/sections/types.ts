import type { LucideIcon } from 'lucide-react';

export type SectionId =
  | 'identification'
  | 'contact'
  | 'location'
  | 'commercial_interest'
  | 'technical_feasibility'
  | 'legal_consent';

export type DraftValues = Record<string, string>;

export interface SectionConfig {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  renderFields: readonly string[];
  payloadFields: readonly string[];
  completionFields: readonly string[];
}

export type CompletenessDimension = 'commercial' | 'legal' | 'technical' | 'operational';
