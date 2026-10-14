import { Injectable } from '@nestjs/common';
import { DataPurpose, PrivacyInventory, PrivacyInventoryDatabase } from '@iwana/shared';
import { RetentionService } from '../retention/retention.service';

type InventoryDefinition = Pick<
  PrivacyInventoryDatabase,
  | 'key'
  | 'categories'
  | 'purposes'
  | 'hasSensitiveData'
  | 'internationalTransfer'
  | 'securityMeasures'
> & { retentionCategories: string[] };

const INVENTORY_DEFINITIONS: InventoryDefinition[] = [
  {
    key: 'CLIENTES',
    categories: [
      'Identificación y contacto',
      'Dirección y datos del contrato',
      'Facturación y soportes contables',
      'Autorizaciones y evidencias',
      'Datos de conexión',
    ],
    purposes: [
      'TRATAMIENTO_CONTRACTUAL',
      'CONTACTO_COMERCIAL',
      'REPORTE_CENTRALES_RIESGO',
      'DATOS_BIOMETRICOS',
    ],
    retentionCategories: [
      'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR',
      'FACTURACION_SOPORTES_CONTABLES',
      'AUTORIZACIONES_EVIDENCIA',
      'LOGS_IP_CONEXION',
    ],
    hasSensitiveData: true,
    internationalTransfer: 'NO_DECLARADA',
    securityMeasures: [
      'Aislamiento de datos por schema de tenant',
      'Control de acceso por rol y permiso',
      'Auditoría de operaciones sobre datos personales',
      'Validación de finalidad y soporte legal versionado',
    ],
  },
  {
    key: 'PROSPECTOS',
    categories: [
      'Identificación y contacto',
      'Preferencias de contacto',
      'Autorizaciones y evidencias',
    ],
    purposes: ['CONTACTO_COMERCIAL'],
    retentionCategories: ['PROSPECTO_SIN_CONTRATO', 'AUTORIZACIONES_EVIDENCIA', 'LOGS_IP_CONEXION'],
    hasSensitiveData: false,
    internationalTransfer: 'NO_DECLARADA',
    securityMeasures: [
      'Aislamiento de datos por schema de tenant',
      'Control de acceso por rol y permiso',
      'Auditoría de operaciones sobre datos personales',
      'Validación de finalidad y soporte legal versionado',
    ],
  },
  {
    key: 'PROVEEDORES',
    categories: [
      'Identificación y contacto',
      'Relación contractual',
      'Facturación y soportes contables',
      'Autorizaciones y evidencias',
    ],
    purposes: ['TRATAMIENTO_CONTRACTUAL'],
    retentionCategories: ['FACTURACION_SOPORTES_CONTABLES', 'AUTORIZACIONES_EVIDENCIA'],
    hasSensitiveData: false,
    internationalTransfer: 'NO_DECLARADA',
    securityMeasures: [
      'Aislamiento de datos por schema de tenant',
      'Control de acceso por rol y permiso',
      'Auditoría de operaciones sobre datos personales',
      'Validación de finalidad y soporte legal versionado',
    ],
  },
  {
    key: 'USUARIOS_SISTEMA',
    categories: ['Identificación', 'Autenticación y permisos', 'Direcciones IP de conexión'],
    purposes: [],
    retentionCategories: ['LOGS_IP_CONEXION'],
    hasSensitiveData: false,
    internationalTransfer: 'NO_DECLARADA',
    securityMeasures: [
      'Aislamiento de datos por schema de tenant',
      'Control de acceso por rol y permiso',
      'Auditoría de autenticación y acceso',
    ],
  },
];

@Injectable()
export class PrivacyInventoryService {
  constructor(private readonly retentionService: RetentionService) {}

  async getInventory(): Promise<PrivacyInventory> {
    const policies = await this.retentionService.list();
    const retentionByCategory = new Map(policies.map((policy) => [policy.category, policy]));

    const databases = INVENTORY_DEFINITIONS.map(({ retentionCategories, ...definition }) => ({
      ...definition,
      purposes: [...definition.purposes] as DataPurpose[],
      retention: retentionCategories.flatMap((category) => {
        const policy = retentionByCategory.get(category);
        return policy ? [{ category: policy.category, years: policy.years }] : [];
      }),
    }));

    return {
      generatedAt: new Date().toISOString(),
      databases,
    };
  }
}
