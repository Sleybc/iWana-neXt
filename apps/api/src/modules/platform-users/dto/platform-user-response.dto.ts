import { PlatformRole, UserStatus } from '@iwana/shared';

export class PlatformUserResponseDto {
  id: string;
  email: string;
  role: PlatformRole;
  status: UserStatus;
  mfaEnabled: boolean;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  timezone: string;
  language: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
