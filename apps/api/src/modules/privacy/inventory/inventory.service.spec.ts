import { DataPurpose } from '@iwana/shared';
import { RetentionService } from '../retention/retention.service';
import { PrivacyInventoryService } from './inventory.service';

describe('PrivacyInventoryService', () => {
  const retentionService = {
    list: jest.fn(),
  };
  let service: PrivacyInventoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    retentionService.list.mockResolvedValue([
      { category: 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR', years: 5 },
      { category: 'FACTURACION_SOPORTES_CONTABLES', years: 10 },
      { category: 'PROSPECTO_SIN_CONTRATO', years: 2 },
      { category: 'AUTORIZACIONES_EVIDENCIA', years: 5 },
      { category: 'LOGS_IP_CONEXION', years: 0 },
    ]);
    service = new PrivacyInventoryService(retentionService as unknown as RetentionService);
  });

  it('publica los cuatro inventarios declarativos con finalidades y retención del catálogo', async () => {
    const inventory = await service.getInventory();

    expect(inventory.databases.map(({ key }) => key)).toEqual([
      'CLIENTES',
      'PROSPECTOS',
      'PROVEEDORES',
      'USUARIOS_SISTEMA',
    ]);
    expect(inventory.databases.find(({ key }) => key === 'PROSPECTOS')?.retention).toEqual([
      { category: 'PROSPECTO_SIN_CONTRATO', years: 2 },
      { category: 'AUTORIZACIONES_EVIDENCIA', years: 5 },
      { category: 'LOGS_IP_CONEXION', years: 0 },
    ]);
    expect(inventory.databases.find(({ key }) => key === 'USUARIOS_SISTEMA')?.purposes).toEqual([]);
    expect(
      inventory.databases.every(
        ({ internationalTransfer }) => internationalTransfer === 'NO_DECLARADA',
      ),
    ).toBe(true);
    expect(inventory.generatedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(inventory.generatedAt))).toBe(false);
  });

  it('no consulta datos de otros módulos ni presenta conteos', async () => {
    const inventory = await service.getInventory();

    expect(retentionService.list).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(inventory)).not.toMatch(/count|total|records|registros/i);
  });

  it('usa solo finalidades del contrato compartido', async () => {
    const inventory = await service.getInventory();
    const allowedPurposes: DataPurpose[] = [
      'TRATAMIENTO_CONTRACTUAL',
      'CONTACTO_COMERCIAL',
      'REPORTE_CENTRALES_RIESGO',
      'DATOS_BIOMETRICOS',
    ];

    expect(
      inventory.databases
        .flatMap(({ purposes }) => purposes)
        .every((purpose) => allowedPurposes.includes(purpose)),
    ).toBe(true);
  });
});
