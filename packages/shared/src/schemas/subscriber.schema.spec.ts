import { CustomerSegment } from '../enums/customer-segment.enum';
import { DocumentType } from '../enums/document-type.enum';
import { PersonType } from '../enums/person-type.enum';
import { PartyRoleType } from '../enums/parties/party-role-type.enum';
import { RUT_RESPONSIBILITIES, VatResponsibility } from '../enums/vat-responsibility.enum';
import { CreateSubscriberSchema, UpdateSubscriberSchema } from './subscriber.schema';

const naturalSubscriber = {
  personType: PersonType.NATURAL,
  customerSegment: CustomerSegment.RESIDENTIAL,
  documentType: DocumentType.CC,
  documentNumber: 'SYNTHETIC-NATURAL-001',
  firstName: 'Nombre sintético',
  lastName: 'Apellido sintético',
  stratum: 2,
  address: 'Dirección sintética',
  email: 'natural@example.invalid',
  vatResponsibility: VatResponsibility.NO_RESPONSABLE,
  rutResponsibilities: ['O-13'],
};

const juridicalSubscriber = {
  personType: PersonType.JURIDICA,
  customerSegment: CustomerSegment.CORPORATE,
  nit: '900000001',
  nitVerificationDigit: '9',
  businessName: 'Empresa sintética',
  address: 'Dirección sintética',
  email: 'empresa@example.invalid',
  vatResponsibility: VatResponsibility.RESPONSABLE,
  rutResponsibilities: ['O-15', 'O-47'],
  legalRepresentative: {
    fullName: 'Representante sintético',
    documentType: DocumentType.CC,
    documentNumber: 'DOC-SYNTHETIC-001',
  },
};

describe('subscriber shared schemas · MOD05 B1', () => {
  it('publishes the frozen IVA, RUT and Party role values', () => {
    expect(VatResponsibility).toEqual({
      RESPONSABLE: 'RESPONSABLE',
      NO_RESPONSABLE: 'NO_RESPONSABLE',
    });
    expect(RUT_RESPONSIBILITIES).toEqual(['O-13', 'O-15', 'O-23', 'O-47', 'R-99-PN']);
    expect(PartyRoleType.LEGAL_REPRESENTATIVE).toBe('LEGAL_REPRESENTATIVE');
  });

  it('requires and retains IVA responsibility and the non-empty RUT catalog for a natural person', () => {
    const result = CreateSubscriberSchema.safeParse(naturalSubscriber);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      vatResponsibility: 'NO_RESPONSABLE',
      rutResponsibilities: ['O-13'],
    });
  });

  it('requires IVA responsibility and RUT responsibilities for both person types', () => {
    for (const subscriber of [naturalSubscriber, juridicalSubscriber]) {
      expect(
        CreateSubscriberSchema.safeParse({
          ...subscriber,
          vatResponsibility: undefined,
          rutResponsibilities: undefined,
        }).success,
      ).toBe(false);
      expect(
        CreateSubscriberSchema.safeParse({ ...subscriber, rutResponsibilities: [] }).success,
      ).toBe(false);
      expect(
        CreateSubscriberSchema.safeParse({ ...subscriber, rutResponsibilities: ['UNLISTED'] })
          .success,
      ).toBe(false);
    }
  });

  it('requires a one-digit verification digit and a natural-person representative for a company', () => {
    expect(CreateSubscriberSchema.safeParse(juridicalSubscriber).success).toBe(true);
    expect(
      CreateSubscriberSchema.safeParse({
        ...juridicalSubscriber,
        nitVerificationDigit: undefined,
      }).success,
    ).toBe(false);
    expect(
      CreateSubscriberSchema.safeParse({
        ...juridicalSubscriber,
        nitVerificationDigit: '12',
      }).success,
    ).toBe(false);
    expect(
      CreateSubscriberSchema.safeParse({
        ...juridicalSubscriber,
        legalRepresentative: undefined,
      }).success,
    ).toBe(false);
    expect(
      CreateSubscriberSchema.safeParse({
        ...juridicalSubscriber,
        legalRepresentative: {
          ...juridicalSubscriber.legalRepresentative,
          documentType: 'INVALID',
        },
      }).success,
    ).toBe(false);
  });

  it('accepts the new optional fields on updates and does not expose the legacy representative UUID', () => {
    const result = UpdateSubscriberSchema.safeParse({
      vatResponsibility: 'RESPONSABLE',
      rutResponsibilities: ['R-99-PN'],
      legalRepresentative: juridicalSubscriber.legalRepresentative,
      legalRepresentativeId: '00000000-0000-4000-8000-000000000001',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      vatResponsibility: 'RESPONSABLE',
      rutResponsibilities: ['R-99-PN'],
      legalRepresentative: juridicalSubscriber.legalRepresentative,
    });
    expect(result.data).not.toHaveProperty('legalRepresentativeId');
  });
});
