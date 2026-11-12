import {
  CreateSubscriberTagSchema,
  SUBSCRIBER_TAG_NAME_MAX_LENGTH,
  SubscriberTagChipSchema,
  UpdateSubscriberTagSchema,
} from './subscriber-tag.schema';
import { SubscriberListFiltersSchema } from './subscriber.schema';

describe('subscriber-tag.schema (ADR-110 D8)', () => {
  it('normaliza nombre y color al crear', () => {
    expect(CreateSubscriberTagSchema.parse({ name: '  VIP ', color: '#a1b2c3' })).toEqual({
      name: 'VIP',
      color: '#A1B2C3',
    });
  });

  it.each([
    { name: '   ', color: '#000000' },
    { name: 'x'.repeat(SUBSCRIBER_TAG_NAME_MAX_LENGTH + 1), color: '#000000' },
    { name: 'VIP', color: '#000' },
    { name: 'VIP', color: 'red' },
    { name: 'VIP', color: '#000000', otro: 1 },
    { name: 'VIP' },
  ])('rechaza la creación %#', (input) => {
    expect(CreateSubscriberTagSchema.safeParse(input).success).toBe(false);
  });

  it('el cambio exige al menos un campo', () => {
    expect(UpdateSubscriberTagSchema.safeParse({}).success).toBe(false);
    expect(UpdateSubscriberTagSchema.parse({ color: '#ffffff' })).toEqual({ color: '#FFFFFF' });
  });

  it('el chip exige uuid y color hex', () => {
    expect(
      SubscriberTagChipSchema.safeParse({
        id: '00000000-0000-4000-a000-000000000001',
        name: 'VIP',
        color: '#ABCDEF',
      }).success,
    ).toBe(true);
    expect(
      SubscriberTagChipSchema.safeParse({ id: 'x', name: 'VIP', color: '#ABCDEF' }).success,
    ).toBe(false);
  });

  it('el filtro de la lista admite tagId uuid', () => {
    expect(
      SubscriberListFiltersSchema.safeParse({ tagId: '00000000-0000-4000-a000-000000000001' })
        .success,
    ).toBe(true);
    expect(SubscriberListFiltersSchema.safeParse({ tagId: 'vip' }).success).toBe(false);
  });
});
