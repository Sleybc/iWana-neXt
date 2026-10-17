import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  PersonType,
  SUBSCRIBER_FISCAL_DATA_INCOMPLETE,
  type SubscriberFiscalCompleteness,
  type SubscriberFiscalMissingField,
} from '@iwana/shared';
import { calculateNitVerificationDigit } from '../../../common/crypto/nit-verification-digit.util';

export interface SubscriberFiscalData {
  personType: PersonType;
  vatResponsibility: string | null | undefined;
  rutResponsibilities: readonly string[] | null | undefined;
  nit: string | null | undefined;
  nitVerificationDigit: string | null | undefined;
  legalRepresentativePartyId: string | null | undefined;
}

export function evaluateSubscriberFiscalCompleteness(
  subscriber: SubscriberFiscalData,
): SubscriberFiscalCompleteness {
  const missing: SubscriberFiscalMissingField[] = [];

  if (!subscriber.vatResponsibility) missing.push('VAT_RESPONSIBILITY');
  if (!subscriber.rutResponsibilities?.length) missing.push('RUT_RESPONSIBILITIES');

  if (subscriber.personType === PersonType.JURIDICA) {
    if (!hasValidVerificationDigit(subscriber.nit, subscriber.nitVerificationDigit)) {
      missing.push('NIT_VERIFICATION_DIGIT');
    }
    if (!subscriber.legalRepresentativePartyId) missing.push('LEGAL_REPRESENTATIVE');
  }

  return { complete: missing.length === 0, missing };
}

function hasValidVerificationDigit(
  nit: string | null | undefined,
  verificationDigit: string | null | undefined,
): boolean {
  if (!nit || !verificationDigit || !/^\d$/u.test(verificationDigit)) return false;
  try {
    return calculateNitVerificationDigit(nit) === verificationDigit;
  } catch {
    return false;
  }
}

@Injectable()
export class SubscriberFiscalCompletenessService {
  evaluate(subscriber: SubscriberFiscalData): SubscriberFiscalCompleteness {
    return evaluateSubscriberFiscalCompleteness(subscriber);
  }

  assertComplete(subscriber: SubscriberFiscalData): SubscriberFiscalCompleteness {
    const completeness = this.evaluate(subscriber);
    if (!completeness.complete) {
      throw new UnprocessableEntityException({
        code: SUBSCRIBER_FISCAL_DATA_INCOMPLETE,
        message: 'Faltan datos fiscales para activar o contratar.',
        missing: completeness.missing,
      });
    }
    return completeness;
  }
}
