'use client';

import { Badge, Button } from '@iwana/ui';

interface StockIssueCreateModeHeaderProps {
  draftLineCount: number;
  eyebrow?: string;
  title?: string;
  description?: string;
  onBack: () => void;
}

export function StockIssueCreateModeHeader({
  draftLineCount,
  eyebrow = 'Creación',
  title = 'Nueva salida',
  description = 'Construye la salida sin competir con la bandeja operativa.',
  onBack,
}: StockIssueCreateModeHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-dark-border md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <p className="portal-eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {description}
        </p>{' '}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">
          {draftLineCount} línea{draftLineCount === 1 ? '' : 's'}
        </Badge>
        <Button type="button" variant="secondary" onClick={onBack}>
          Volver a la bandeja
        </Button>
      </div>
    </div>
  );
}
