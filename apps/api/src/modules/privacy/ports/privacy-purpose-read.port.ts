import { DataPurpose } from '@iwana/shared';

export abstract class IPrivacyPurposeReadPort {
  abstract enabledPurposes(): Promise<DataPurpose[]>;
}
