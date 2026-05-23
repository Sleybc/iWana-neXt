import { z } from 'zod';
import {
  settingsSectionSchema,
  settingsSectionsResponseSchema,
} from '../schemas/settings-section.schema';

export type SettingsSectionDto = z.infer<typeof settingsSectionSchema>;
export type SettingsSectionsResponseDto = z.infer<typeof settingsSectionsResponseSchema>;
