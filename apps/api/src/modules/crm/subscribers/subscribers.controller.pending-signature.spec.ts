// MOD05 Cierre de venta · bloque F (ADR-109 D3): la ficha expone `pendingSignature` para la
// insignia «Pendiente de firma». Campo opcional: sin lector no se emite.
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  UserRole,
  VatTreatment,
} from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SubscribersController } from './subscribers.controller';

const SUBSCRIBER_ID = '51515151-5151-4515-8515-515151515151';
const user = { sub: 'sales-001', role: UserRole.SALES } as JwtPayload;

function subscriber() {
  return {
    id: SUBSCRIBER_ID,
    tenantId: 'tenant-001',
    partyId: null,
    userId: null,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    documentType: DocumentType.CC,
    status: SubscriberStatus.ACTIVE,
    vatTreatment: VatTreatment.EXCLUDED,
    stratum: 2,
    firstName: 'Nombre',
    lastName: 'Ficticio',
    emailEncrypted: null,
    phoneEncrypted: null,
    anonymizedAt: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  };
}

function build(pending?: { subscribersPendingSignature: jest.Mock }) {
  return new SubscribersController(
    { findById: jest.fn().mockResolvedValue(subscriber()) } as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
    {} as never,
    { activeMarks: jest.fn().mockResolvedValue({}) } as never,
    {} as never,
    pending as never,
  );
}

describe('SubscribersController — pendingSignature en el detalle', () => {
  it('true cuando el lector marca al suscriptor', async () => {
    const pending = {
      subscribersPendingSignature: jest.fn().mockResolvedValue(new Set([SUBSCRIBER_ID])),
    };

    const result = await build(pending).findById(SUBSCRIBER_ID, user);

    expect(pending.subscribersPendingSignature).toHaveBeenCalledWith([SUBSCRIBER_ID]);
    expect(result.data.pendingSignature).toBe(true);
  });

  it('false cuando no está pendiente', async () => {
    const pending = { subscribersPendingSignature: jest.fn().mockResolvedValue(new Set()) };

    const result = await build(pending).findById(SUBSCRIBER_ID, user);

    expect(result.data.pendingSignature).toBe(false);
  });

  it('sin lector el campo no viaja (contrato opcional)', async () => {
    const result = await build().findById(SUBSCRIBER_ID, user);

    expect(result.data).not.toHaveProperty('pendingSignature');
  });
});

// La ficha del portal lee la vista 360°: la insignia depende de que también la lleve (CA-5).
describe('SubscribersController — pendingSignature en la vista 360°', () => {
  function build360(pending?: { subscribersPendingSignature: jest.Mock }) {
    const view360 = {
      subscriber: subscriber(),
      contacts: [],
      contracts: [],
      quotes: [],
      habeasData: [],
      arcoRequests: [],
      privacyMarks: [],
      expedienteSummary: null,
      timelineSeed: [],
      provisioningReadiness: null,
    };
    return new SubscribersController(
      { get360View: jest.fn().mockResolvedValue(view360) } as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      { activeMarks: jest.fn().mockResolvedValue({}) } as never,
      {} as never,
      pending as never,
    );
  }

  it('true cuando el lector marca al suscriptor', async () => {
    const pending = {
      subscribersPendingSignature: jest.fn().mockResolvedValue(new Set([SUBSCRIBER_ID])),
    };

    const result = await build360(pending).get360View(SUBSCRIBER_ID, user);

    expect(pending.subscribersPendingSignature).toHaveBeenCalledWith([SUBSCRIBER_ID]);
    expect(result.data.subscriber.pendingSignature).toBe(true);
  });

  it('false cuando no está pendiente', async () => {
    const pending = { subscribersPendingSignature: jest.fn().mockResolvedValue(new Set()) };

    const result = await build360(pending).get360View(SUBSCRIBER_ID, user);

    expect(result.data.subscriber.pendingSignature).toBe(false);
  });

  it('sin lector el campo no viaja', async () => {
    const result = await build360().get360View(SUBSCRIBER_ID, user);

    expect(result.data.subscriber).not.toHaveProperty('pendingSignature');
  });
});
