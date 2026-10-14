import { ConsentChannel } from '@iwana/shared';
import { qualifyPotentialSchema } from '../../schemas/qualify-potential.schema';

describe('qualifyPotentialSchema', () => {
  const baseInput = {
    address: 'Dirección sintética',
    planId: 'plan-sintetico',
    consentAccepted: true,
    legalTextVersion: 'v1',
  };

  it('acepta un medio de consentimiento del catálogo', () => {
    expect(
      qualifyPotentialSchema.safeParse({
        ...baseInput,
        consentChannel: ConsentChannel.TELEFONO,
      }).success,
    ).toBe(true);
  });

  it('rechaza valores históricos que no son medios de consentimiento', () => {
    expect(qualifyPotentialSchema.safeParse({ ...baseInput, consentChannel: 'WEB' }).success).toBe(
      false,
    );
  });
});
