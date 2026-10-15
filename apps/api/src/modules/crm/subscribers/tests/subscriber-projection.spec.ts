import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  UserRole,
  VatTreatment,
} from '@iwana/shared';
import { Subscriber } from '../entities/subscriber.entity';
import { projectSubscriberForList } from '../subscriber-projection';

const subscriber = {
  id: 'sub-1',
  tenantId: 'tenant-1',
  partyId: 'party-1',
  personType: PersonType.NATURAL,
  customerSegment: CustomerSegment.RESIDENTIAL,
  vatTreatment: VatTreatment.STANDARD,
  documentType: DocumentType.CC,
  documentNumber: '12345678',
  firstName: 'Ana',
  lastName: 'Prueba',
  stratum: 3,
  nit: '900111222-3',
  nitVerificationDigit: '3',
  businessName: 'Comercio de prueba',
  commercialName: 'Marca de prueba',
  email: 'ana@example.invalid',
  phone: '3001234567',
  emailEncrypted: 'encrypted-email',
  phoneEncrypted: 'encrypted-phone',
  altContactPhone: '3007654321',
  whatsapp: '3001112233',
  whatsappEncrypted: null,
  address: 'Calle privada 1',
  neighborhood: 'Barrio privado',
  city: 'Bogotá',
  department: 'Cundinamarca',
  latitude: 4.6,
  longitude: -74.1,
  birthDate: new Date('1990-01-01'),
  legalRepresentativeId: 'legal-1',
  manualOverrideReason: 'dato interno',
  externalId: 'external-1',
  createdBy: 'user-1',
  userId: 'user-1',
  status: SubscriberStatus.ACTIVE,
  createdAt: new Date('2026-10-12T12:00:00.000Z'),
} as unknown as Subscriber;

describe('projectSubscriberForList', () => {
  const allowed: Record<UserRole, string[]> = {
    [UserRole.ADMIN]: [
      'documentNumber',
      'nit',
      'nitVerificationDigit',
      'phone',
      'altContactPhone',
      'whatsapp',
      'email',
      'address',
      'neighborhood',
      'city',
      'department',
    ],
    [UserRole.NOC]: [],
    [UserRole.SALES]: [],
    [UserRole.SUPPORT]: [
      'documentNumber',
      'nit',
      'nitVerificationDigit',
      'phone',
      'altContactPhone',
      'whatsapp',
      'address',
      'neighborhood',
      'city',
      'department',
    ],
    [UserRole.ACCOUNTANT]: ['documentNumber', 'nit', 'nitVerificationDigit'],
    [UserRole.TECHNICIAN]: [],
    [UserRole.AUDITOR]: [],
    [UserRole.HR]: [],
    [UserRole.SUBSCRIBER]: [],
    [UserRole.CONTRACTOR]: [],
    [UserRole.PARTNER]: [],
    [UserRole.INVESTOR]: [],
  };

  it.each(Object.entries(allowed))('aplica la lista permitida para %s', (role, expected) => {
    const projected = projectSubscriberForList(subscriber, role);

    for (const field of [
      'documentNumber',
      'nit',
      'nitVerificationDigit',
      'phone',
      'altContactPhone',
      'whatsapp',
      'email',
      'address',
      'neighborhood',
      'city',
      'department',
      'latitude',
      'longitude',
    ]) {
      if (expected.includes(field)) {
        expect(projected).toHaveProperty(field);
      } else {
        expect(projected).not.toHaveProperty(field);
      }
    }

    expect(projected).toMatchObject({
      id: 'sub-1',
      firstName: 'Ana',
      lastName: 'Prueba',
      businessName: 'Comercio de prueba',
      commercialName: 'Marca de prueba',
      vatTreatment: VatTreatment.STANDARD,
      createdAt: '2026-10-12T12:00:00.000Z',
      contactPending: false,
    });
    expect(projected).not.toHaveProperty('tenantId');
    expect(projected).not.toHaveProperty('partyId');
    expect(projected).not.toHaveProperty('birthDate');
    expect(projected).not.toHaveProperty('legalRepresentativeId');
    expect(projected).not.toHaveProperty('manualOverrideReason');
    expect(projected).not.toHaveProperty('externalId');
    expect(projected).not.toHaveProperty('createdBy');
    expect(projected).not.toHaveProperty('userId');
  });

  it('fail-closed para un rol sin entrada en el mapa', () => {
    const projected = projectSubscriberForList(subscriber, 'UNKNOWN_ROLE');

    expect(projected).toHaveProperty('firstName', 'Ana');
    expect(projected).not.toHaveProperty('documentNumber');
    expect(projected).not.toHaveProperty('email');
  });

  it('declara contacto pendiente solo cuando faltan ambos canales cifrados', () => {
    const noContact = projectSubscriberForList(
      { ...subscriber, emailEncrypted: null, phoneEncrypted: null },
      UserRole.SALES,
    );
    const phoneOnly = projectSubscriberForList(
      { ...subscriber, emailEncrypted: null },
      UserRole.SALES,
    );

    expect(noContact.contactPending).toBe(true);
    expect(phoneOnly.contactPending).toBe(false);
  });
});
