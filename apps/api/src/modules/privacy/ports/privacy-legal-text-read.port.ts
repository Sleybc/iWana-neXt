import { LegalTextType } from '@iwana/shared';

export abstract class IPrivacyLegalTextReadPort {
  abstract current(
    type: LegalTextType,
  ): Promise<{ id: string; version: string; sha256: string } | null>;

  abstract findByVersion(type: LegalTextType, version: string): Promise<{ id: string } | null>;
}
