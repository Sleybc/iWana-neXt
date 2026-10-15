import { hasRealContact } from '../subscriber-contact.util';

describe('hasRealContact', () => {
  it('requires at least one encrypted email or phone', () => {
    expect(hasRealContact({ emailEncrypted: null, phoneEncrypted: null })).toBe(false);
    expect(hasRealContact({ emailEncrypted: 'encrypted-email', phoneEncrypted: null })).toBe(true);
    expect(hasRealContact({ emailEncrypted: null, phoneEncrypted: 'encrypted-phone' })).toBe(true);
    expect(
      hasRealContact({ emailEncrypted: 'encrypted-email', phoneEncrypted: 'encrypted-phone' }),
    ).toBe(true);
  });
});
