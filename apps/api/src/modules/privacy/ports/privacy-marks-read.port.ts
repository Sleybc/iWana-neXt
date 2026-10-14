import { PrivacyMark } from '@iwana/shared';

export abstract class IPrivacyMarksReadPort {
  abstract activeMarks(partyIds: string[]): Promise<Record<string, PrivacyMark[]>>;
}
