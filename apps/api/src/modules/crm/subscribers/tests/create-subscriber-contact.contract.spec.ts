import {
  CreateSubscriberSchema,
  CustomerSegment,
  DocumentType,
  PersonType,
  VatResponsibility,
} from '@iwana/shared';

const baseSubscriber = {
  personType: PersonType.NATURAL,
  customerSegment: CustomerSegment.RESIDENTIAL,
  documentType: DocumentType.CC,
  documentNumber: '10000001',
  firstName: 'Prueba',
  lastName: 'Sintetica',
  stratum: 3,
  address: 'Dirección de prueba',
  vatResponsibility: VatResponsibility.RESPONSABLE,
  rutResponsibilities: ['O-13'],
};

describe('CreateSubscriberSchema contact contract', () => {
  it('accepts a subscriber with only an email', () => {
    expect(
      CreateSubscriberSchema.safeParse({ ...baseSubscriber, email: 'test@example.invalid' })
        .success,
    ).toBe(true);
  });

  it('accepts a subscriber with only a phone', () => {
    expect(
      CreateSubscriberSchema.safeParse({ ...baseSubscriber, phone: '3000000000' }).success,
    ).toBe(true);
  });

  it('requires at least one contact channel', () => {
    const result = CreateSubscriberSchema.safeParse(baseSubscriber);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          code: 'custom',
          message: 'Registra al menos un teléfono o un correo.',
        }),
      );
    }
  });
});
