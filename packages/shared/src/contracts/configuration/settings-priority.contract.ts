import {
  SettingsPriorityEvaluation,
  SettingsPriorityKey,
  SettingsPriorityLevel,
  SettingsPrioritySource,
  SettingsPriorityState,
} from '../../enums/configuration/settings-priority.enum';
import { SettingsSectionKey } from '../../enums/configuration/settings-section-key.enum';

export interface SettingsPriorityItem {
  key: SettingsPriorityKey;
  level: SettingsPriorityLevel;
  sectionKey: SettingsSectionKey;
  targetPath: string;
}

export interface SettingsPriorityResponse {
  state: SettingsPriorityState;
  item: SettingsPriorityItem | null;
  evaluation: SettingsPriorityEvaluation;
  unknownSources: SettingsPrioritySource[];
}
