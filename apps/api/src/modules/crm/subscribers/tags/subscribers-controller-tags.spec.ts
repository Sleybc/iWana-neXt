import { SubscribersController } from '../subscribers.controller';
import type { SubscriberTagsService } from './subscriber-tags.service';

const CHIP = { id: '00000000-0000-4000-a000-0000000000b2', name: 'VIP', color: '#ABCDEF' };

type Enricher = {
  tagsFor(items: Array<{ id: string }>): Promise<Map<string, (typeof CHIP)[]> | null>;
  withTagsAndSignature<T>(
    tags: Map<string, (typeof CHIP)[]> | null,
    item: T,
    pending: Set<string> | null,
  ): T & { tags?: (typeof CHIP)[]; pendingSignature?: boolean };
};

function controllerWith(tagsService?: Partial<SubscriberTagsService>): Enricher {
  return new SubscribersController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    tagsService as SubscriberTagsService | undefined,
  ) as unknown as Enricher;
}

describe('SubscribersController — etiquetas en lista, detalle y ficha (ADR-110 D8)', () => {
  it('agrega las etiquetas por suscriptor y [] al que no tiene', async () => {
    const tagsFor = jest.fn().mockResolvedValue(new Map([['s1', [CHIP]]]));
    const controller = controllerWith({ tagsFor });
    const tags = await controller.tagsFor([{ id: 's1' }, { id: 's2' }]);
    expect(tagsFor).toHaveBeenCalledWith(['s1', 's2']);
    expect(controller.withTagsAndSignature(tags, { id: 's1' }, new Set(['s1']))).toEqual({
      id: 's1',
      tags: [CHIP],
      pendingSignature: true,
    });
    expect(controller.withTagsAndSignature(tags, { id: 's2' }, null)).toEqual({
      id: 's2',
      tags: [],
    });
  });

  it('no muestra etiquetas del titular con datos restringidos para el lector', async () => {
    const controller = controllerWith({
      tagsFor: jest.fn().mockResolvedValue(new Map([['s1', [CHIP]]])),
    });
    const tags = await controller.tagsFor([{ id: 's1' }]);
    expect(
      controller.withTagsAndSignature(tags, { id: 's1', privacyRestricted: true }, null),
    ).toEqual({ id: 's1', privacyRestricted: true, tags: [] });
  });

  it('sin lector de etiquetas no agrega el campo', async () => {
    const controller = controllerWith(undefined);
    const tags = await controller.tagsFor([{ id: 's1' }]);
    expect(tags).toBeNull();
    expect(controller.withTagsAndSignature(tags, { id: 's1' }, null)).toEqual({ id: 's1' });
  });
});
