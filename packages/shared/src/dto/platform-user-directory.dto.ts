import type { PlatformRole } from '../enums/platform-role.enum';
import type { UserStatus } from '../enums/user-status.enum';

export interface PlatformUserDirectoryEntry {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: PlatformRole;
  status: UserStatus;
  mfaEnabled: boolean;
  passwordResetRequired: boolean;
  lastLoginAt: string | null;
}

export interface PlatformUserDirectory {
  items: PlatformUserDirectoryEntry[];
  total: number;
  pageSize: number;
}
