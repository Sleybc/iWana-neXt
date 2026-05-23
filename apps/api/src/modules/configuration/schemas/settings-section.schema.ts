import { z } from 'zod';
import { AccessPermissionKey, SettingsSectionKey, SettingsSectionStatus } from '@iwana/shared';

export const settingsSectionSchema = z.object({
  key: z.nativeEnum(SettingsSectionKey),
  label: z.string().min(1),
  description: z.string().min(1),
  ownerModule: z.string().min(1),
  status: z.nativeEnum(SettingsSectionStatus),
  route: z.string().min(1).nullable(),
  requiredPermissions: z.array(z.nativeEnum(AccessPermissionKey)),
});

export const settingsSectionsResponseSchema = z.array(settingsSectionSchema);
