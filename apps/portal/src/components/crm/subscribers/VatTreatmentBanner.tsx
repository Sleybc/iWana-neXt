import type { TaxRegime, VatTreatment } from '@iwana/shared';

interface VatTreatmentBannerProps {
  vatTreatment: VatTreatment;
  taxRegime: TaxRegime;
}

export function VatTreatmentBanner({ vatTreatment, taxRegime }: VatTreatmentBannerProps) {
  void vatTreatment;
  void taxRegime;
  return null;
}
