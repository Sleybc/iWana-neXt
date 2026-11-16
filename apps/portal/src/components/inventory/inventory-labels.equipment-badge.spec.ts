import { SerializedAssetStatus } from '@iwana/shared';
import {
  getSerializedAssetStatusBadgeVariant,
  getSerializedAssetStatusLabel,
  SUBSCRIBER_EQUIPMENT_RETIRED_LABEL,
} from './inventory-labels';

describe('getSerializedAssetStatusBadgeVariant (spec equipos del suscriptor §2.3)', () => {
  it.each([
    [SerializedAssetStatus.INSTALLED_COMODATO, 'info'],
    [SerializedAssetStatus.IN_REPAIR, 'warning'],
    [SerializedAssetStatus.LOST, 'error'],
    [SerializedAssetStatus.WRITTEN_OFF, 'error'],
    [SerializedAssetStatus.AVAILABLE, 'neutral'],
    [SerializedAssetStatus.AVAILABLE_REFURBISHED, 'neutral'],
    [SerializedAssetStatus.IN_TESTING, 'neutral'],
    [SerializedAssetStatus.IN_TRANSIT, 'neutral'],
  ] as const)('%s → %s', (status, variant) => {
    expect(getSerializedAssetStatusBadgeVariant(status)).toBe(variant);
  });

  it('cubre todos los estados con una variante del Badge y una etiqueta en español', () => {
    for (const status of Object.values(SerializedAssetStatus)) {
      expect(['info', 'warning', 'error', 'neutral']).toContain(
        getSerializedAssetStatusBadgeVariant(status),
      );
      expect(getSerializedAssetStatusLabel(status)).not.toBe(status);
    }
  });

  it('nombra «Retirado» el equipo con el comodato cerrado', () => {
    expect(SUBSCRIBER_EQUIPMENT_RETIRED_LABEL).toBe('Retirado');
  });
});
