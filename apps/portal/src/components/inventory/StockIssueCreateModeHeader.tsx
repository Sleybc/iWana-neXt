'use client';

import { Badge, Button } from '@iwana/ui';

interface StockIssueCreateModeHeaderProps {
  draftLineCount: number;
  eyebrow?: string;
  title?: string;
  description?: string;
  statusLabel?: string;
  referenceLabel?: string;
  onBack: () => void;
}

export function StockIssueCreateModeHeader({
  draftLineCount,
  eyebrow = 'Creación',
  title = 'Nueva salida',
  description = 'Arma la salida sin salir del flujo de creación.',
  statusLabel,
  referenceLabel,
  onBack,
}: StockIssueCreateModeHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-dark-border md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <p className="portal-eyebrow">{eyebrow}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
          {referenceLabel ? (
            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
              {referenceLabel}
            </span>
          ) : null}
          {statusLabel ? <Badge variant="info">{statusLabel}</Badge> : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="neutral">
          {draftLineCount} línea{draftLineCount === 1 ? '' : 's'}
        </Badge>
        <Button type="button" variant="secondary" onClick={onBack}>
          Volver al listado
        </Button>
      </div>
    </div>
  );
}
