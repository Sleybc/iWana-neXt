import { SubscriberStatus, VatTreatment } from '@iwana/shared';
import { deriveSubscriberBadges, deriveSubscriberListBadges } from './subscriber-badges';

const base = { status: SubscriberStatus.ACTIVE, vatTreatment: VatTreatment.STANDARD };
const ids = (input: Parameters<typeof deriveSubscriberBadges>[0]) =>
  deriveSubscriberBadges(input).map((badge) => badge.id);

describe('insignias derivadas del suscriptor (spec §3 G, CA-6)', () => {
  it('sin datos que las justifiquen no devuelve insignias', () => {
    expect(deriveSubscriberBadges(base)).toEqual([]);
  });

  it.each([
    [VatTreatment.EXEMPT, 'IVA exento'],
    [VatTreatment.EXCLUDED, 'IVA excluido'],
  ])('tratamiento de IVA %s → «%s»; el estándar no se marca', (vatTreatment, label) => {
    expect(deriveSubscriberBadges({ ...base, vatTreatment })).toEqual([
      { id: 'vat', label, variant: 'info' },
    ]);
  });

  it('datos fiscales incompletos solo con completitud explícita en falso y titular no cancelado', () => {
    expect(ids({ ...base, fiscalCompleteness: { complete: false } })).toEqual([
      'fiscal-incomplete',
    ]);
    expect(ids({ ...base, fiscalCompleteness: { complete: true } })).toEqual([]);
    expect(ids({ ...base, fiscalCompleteness: undefined })).toEqual([]);
    expect(
      ids({
        ...base,
        status: SubscriberStatus.CANCELLED,
        fiscalCompleteness: { complete: false },
      }),
    ).toEqual([]);
  });

  it('contacto pendiente sale del indicador del titular', () => {
    expect(ids({ ...base, contactPending: true })).toEqual(['contact-pending']);
  });

  it('deuda vencida solo con algún documento VENCIDO del estado de cuenta', () => {
    expect(ids({ ...base, documentPaymentStates: ['PENDIENTE', 'VENCIDO'] })).toEqual([
      'overdue-debt',
    ]);
    expect(ids({ ...base, documentPaymentStates: ['PENDIENTE', 'PAGADO'] })).toEqual([]);
  });

  it('servicio suspendido por el titular o por cualquiera de sus servicios', () => {
    expect(ids({ ...base, status: SubscriberStatus.SUSPENDED })).toEqual(['service-suspended']);
    expect(ids({ ...base, serviceStatuses: ['ACTIVE', 'SUSPENDED'] })).toEqual([
      'service-suspended',
    ]);
  });

  it('un titular anonimizado no muestra insignias', () => {
    expect(
      deriveSubscriberBadges({
        ...base,
        vatTreatment: VatTreatment.EXEMPT,
        contactPending: true,
        anonymizedAt: '2026-11-01T00:00:00.000Z',
      }),
    ).toEqual([]);
  });

  it('la lista deriva desde la fila: IVA, contacto y servicio principal suspendido', () => {
    expect(
      deriveSubscriberListBadges({
        status: SubscriberStatus.ACTIVE,
        vatTreatment: VatTreatment.EXCLUDED,
        contactPending: true,
        anonymizedAt: null,
        primaryService: { status: 'SUSPENDED' } as never,
      }).map((badge) => badge.label),
    ).toEqual(['IVA excluido', 'Contacto pendiente', 'Servicio suspendido']);
  });
});
