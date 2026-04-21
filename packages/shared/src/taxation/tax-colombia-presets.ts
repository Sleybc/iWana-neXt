import {
  TaxCategory,
  JurisdictionLevel,
  TaxTreatment,
  TaxContext,
  TaxOrigin,
} from '../enums/taxation';

export interface TaxPresetDefinition {
  code: string;
  name: string;
  category: TaxCategory;
  jurisdictionLevel: JurisdictionLevel;
  municipalityCode: string | null;
  baseRate: number | null;
  treatment: TaxTreatment;
  context: TaxContext;
  origin: TaxOrigin;
  isActive: boolean;
  notes: string | null;
}

export const TAX_COLOMBIA_PRESETS: readonly TaxPresetDefinition[] = [
  {
    code: 'IVA_19',
    name: 'IVA 19%',
    category: TaxCategory.VAT,
    jurisdictionLevel: JurisdictionLevel.NATIONAL,
    municipalityCode: null,
    baseRate: 19,
    treatment: TaxTreatment.STANDARD,
    context: TaxContext.BOTH,
    origin: TaxOrigin.SYSTEM,
    isActive: true,
    notes: 'Tarifa general IVA Colombia — Art. 468 E.T.',
  },
  {
    code: 'IVA_EXENTO',
    name: 'IVA exento (0%)',
    category: TaxCategory.VAT,
    jurisdictionLevel: JurisdictionLevel.NATIONAL,
    municipalityCode: null,
    baseRate: 0,
    treatment: TaxTreatment.EXEMPT,
    context: TaxContext.BOTH,
    origin: TaxOrigin.SYSTEM,
    isActive: true,
    notes: 'Servicios de internet residencial estrato 1-3 — Decreto 1835/2021',
  },
  {
    code: 'IVA_EXCLUIDO',
    name: 'IVA excluido',
    category: TaxCategory.VAT,
    jurisdictionLevel: JurisdictionLevel.NATIONAL,
    municipalityCode: null,
    baseRate: null,
    treatment: TaxTreatment.EXCLUDED,
    context: TaxContext.BOTH,
    origin: TaxOrigin.SYSTEM,
    isActive: true,
    notes: 'Bienes y servicios excluidos de IVA — Art. 424 E.T.',
  },
  {
    code: 'RETE_FUENTE_SERVICIOS',
    name: 'Retención en la fuente — Servicios',
    category: TaxCategory.WITHHOLDING,
    jurisdictionLevel: JurisdictionLevel.NATIONAL,
    municipalityCode: null,
    baseRate: 4,
    treatment: TaxTreatment.STANDARD,
    context: TaxContext.PURCHASE,
    origin: TaxOrigin.SYSTEM,
    isActive: true,
    notes: 'RteFte servicios en general — Art. 392 E.T. (4% para no autoretenedores)',
  },
  {
    code: 'RETE_ICA',
    name: 'ReteICA — Bogotá',
    category: TaxCategory.MUNICIPAL,
    jurisdictionLevel: JurisdictionLevel.MUNICIPAL,
    municipalityCode: '11001',
    baseRate: 0.414,
    treatment: TaxTreatment.STANDARD,
    context: TaxContext.PURCHASE,
    origin: TaxOrigin.SYSTEM,
    isActive: true,
    notes: 'Retención ICA Bogotá D.C. — CIIU 6130 (telecomunicaciones inalámbricas)',
  },
  {
    code: 'ESTAMPILLA_DEPARTAMENTAL',
    name: 'Estampilla departamental',
    category: TaxCategory.STAMP,
    jurisdictionLevel: JurisdictionLevel.DEPARTMENT,
    municipalityCode: null,
    baseRate: null,
    treatment: TaxTreatment.STANDARD,
    context: TaxContext.BOTH,
    origin: TaxOrigin.SYSTEM,
    isActive: false,
    notes: 'Estampilla pro-hospitales, pro-universidad, etc. según departamento',
  },
] as const;
