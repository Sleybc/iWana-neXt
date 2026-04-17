'use client';

import { Card, CardContent } from '@iwana/ui';
import { BadgeInfo } from 'lucide-react';
import { TaxRegime, VatTreatment } from '@iwana/shared';
import { TAX_REGIME_META, VAT_TREATMENT_META } from './subscriber-ui';

interface VatTreatmentBannerProps {
  vatTreatment: VatTreatment;
  taxRegime: TaxRegime;
}

export function VatTreatmentBanner({ vatTreatment, taxRegime }: VatTreatmentBannerProps) {
  const vatMeta = VAT_TREATMENT_META[vatTreatment];
  const regimeMeta = TAX_REGIME_META[taxRegime];

  return (
    <Card className={`border-l-4 ${vatMeta.accentClass} rounded-[20px] shadow-iwana-soft`}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="mt-0.5 rounded-2xl bg-iwana-primary/8 p-2 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
          <BadgeInfo className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Tratamiento IVA: {vatMeta.label}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{vatMeta.description}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
            Régimen tributario: {regimeMeta.label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
