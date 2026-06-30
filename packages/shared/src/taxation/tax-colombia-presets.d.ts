import { TaxCategory, JurisdictionLevel, TaxTreatment, TaxContext, TaxOrigin } from '../enums/taxation';
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
export declare const TAX_COLOMBIA_PRESETS: readonly TaxPresetDefinition[];
//# sourceMappingURL=tax-colombia-presets.d.ts.map