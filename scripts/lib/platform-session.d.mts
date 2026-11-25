export interface PlatformCredentials {
  apiUrl: string;
  email: string;
  password: string;
}
export interface PlatformLoginData {
  accessToken: string;
  passwordResetRequired?: boolean;
  mfaSetupRequired?: boolean;
}
export function totpCode(secret: string, step: number): string;
export function nextTotpCode(secret: string): Promise<string>;
export function loginPlatform(credentials: PlatformCredentials): Promise<PlatformLoginData>;
export function platformAccessToken(credentials: PlatformCredentials): Promise<string>;
export function enrollPlatformMfa(apiUrl: string, setupToken: string): Promise<string>;
