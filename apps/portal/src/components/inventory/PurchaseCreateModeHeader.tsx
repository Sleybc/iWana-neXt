'use client';

import { Badge, Button } from '@iwana/ui';

interface PurchaseCreateModeHeaderProps {
  draftLineCount: number;
  onBack: () => void;
}

export function PurchaseCreateModeHeader({
  draftLineCount,
  onBack,
}: PurchaseCreateModeHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-dark-border md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <p className="portal-eyebrow">Creacion</p>
        <h1 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
          Nueva solicitud de compra
        </h1>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Construye la solicitud sin competir con la bandeja operativa.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">
          {draftLineCount} linea{draftLineCount === 1 ? '' : 's'}
        </Badge>
        <Button type="button" variant="secondary" onClick={onBack}>
          Volver a la bandeja
        </Button>
      </div>
    </div>
  );
}
