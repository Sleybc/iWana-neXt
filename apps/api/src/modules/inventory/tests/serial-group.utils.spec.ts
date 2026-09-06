import { BadRequestException } from '@nestjs/common';
import { assertSerialGroupQty, normalizeSerialGroup } from '../services/serial-group.utils';

const ASSET_A = '66666666-6666-4666-8666-666666666666';
const ASSET_B = '88888888-8888-4888-8888-888888888888';

describe('serial-group.utils (MOD12 S2.1 · B2)', () => {
  describe('normalizeSerialGroup', () => {
    it('el arreglo manda tal cual', () => {
      expect(normalizeSerialGroup({ serializedAssetIds: [ASSET_A, ASSET_B] })).toEqual([
        ASSET_A,
        ASSET_B,
      ]);
    });

    it('el singular de transición equivale a un grupo de un elemento', () => {
      expect(normalizeSerialGroup({ serializedAssetId: ASSET_A })).toEqual([ASSET_A]);
    });

    it('sin seriales no hay grupo (undefined, no arreglo vacío)', () => {
      expect(normalizeSerialGroup({})).toBeUndefined();
      expect(normalizeSerialGroup({ serializedAssetId: null })).toBeUndefined();
    });
  });

  describe('assertSerialGroupQty (CA-S2.1-BE04)', () => {
    it('acepta entero igual al tamaño del grupo (número o decimal string)', () => {
      expect(() => assertSerialGroupQty(2, 2, 'SKU-1')).not.toThrow();
      expect(() => assertSerialGroupQty('2.00', 2, 'SKU-1')).not.toThrow();
    });

    it('rechaza la cantidad fraccionaria en español', () => {
      const error = catchSync(() => assertSerialGroupQty(2.5, 2, 'SKU-1'));

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('número entero');
    });

    it('rechaza la cantidad distinta del tamaño del grupo con el detalle', () => {
      const error = catchSync(() => assertSerialGroupQty(3, 2, 'CFO-SER-1'));

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        'La cantidad solicitada del ítem CFO-SER-1 debe coincidir con el número de ' +
          'seriales seleccionados (2 seriales, cantidad 3).',
      );
    });
  });
});

function catchSync(work: () => void): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  return null;
}
