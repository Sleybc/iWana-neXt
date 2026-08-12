'use client';

// Panel expandido — diffs de producto; metadata solo en modo Detalle (CA-AUD-10).
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  computeDiff,
  renderValue,
  formatFieldName,
  abbreviateUserAgent,
} from './helpers/computeDiff';
import { shouldOmitAuditFieldInReading } from '@/lib/platform-audit-vocabulary';
import { cn, interactiveFocusClassName } from '@iwana/ui';

interface AuditExpandedDetailsProps {
  id: string;
  action: string;
  entityId: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  /** Solo en modo Detalle: IP, UUID, UTC, etc. */
  showTechnicalMeta?: boolean;
  fieldMode?: 'reading' | 'detail';
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        void handleCopy(e);
      }}
      aria-label="Copiar al portapapeles"
      className={cn(
        'ml-1 inline-flex items-center text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200',
        interactiveFocusClassName,
      )}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  if (!value || value === '—') return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="min-w-[100px] shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={`break-all text-gray-800 dark:text-gray-200 ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
        {copyable ? <CopyButton text={value} /> : null}
      </span>
    </div>
  );
}

export function AuditExpandedDetails({
  id,
  action,
  entityId,
  userId,
  ipAddress,
  userAgent,
  requestId,
  createdAt,
  oldValue,
  newValue,
  showTechnicalMeta = false,
  fieldMode = 'detail',
}: AuditExpandedDetailsProps) {
  const rawDiff = computeDiff(oldValue, newValue);
  const diff =
    fieldMode === 'reading'
      ? rawDiff.filter((d) => !shouldOmitAuditFieldInReading(d.field))
      : rawDiff;

  return (
    <div className="space-y-4 px-6 py-4">
      {action === 'UPDATE' ? (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Cambios ({diff.length} campo{diff.length !== 1 ? 's' : ''} modificado
            {diff.length !== 1 ? 's' : ''})
          </p>
          {diff.length > 0 ? (
            <div className="space-y-1.5">
              {diff.map(({ field, old: oldVal, new: newVal }) => {
                const label = formatFieldName(field, { mode: fieldMode });
                if (!label) return null;
                return (
                  <div
                    key={field}
                    className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-xs dark:bg-dark-surface-2"
                  >
                    <span className="min-w-[130px] font-medium text-gray-700 dark:text-gray-300">
                      {label}
                    </span>
                    <span className="max-w-[180px] truncate text-red-500 line-through dark:text-red-400">
                      {renderValue(oldVal)}
                    </span>
                    <span className="shrink-0 text-gray-400">→</span>
                    <span className="max-w-[180px] truncate text-green-600 dark:text-green-400">
                      {renderValue(newVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Sin cambios detectados</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {oldValue ? (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Valor anterior
              </p>
              <div className="space-y-1 rounded-lg bg-white p-3 text-xs dark:bg-dark-surface-2">
                {Object.entries(oldValue)
                  .filter(([k]) =>
                    fieldMode === 'reading' ? !shouldOmitAuditFieldInReading(k) : true,
                  )
                  .slice(0, 12)
                  .map(([k, v]) => {
                    const label = formatFieldName(k, { mode: fieldMode });
                    if (!label) return null;
                    return (
                      <div key={k} className="flex gap-2">
                        <span className="min-w-[100px] font-medium text-gray-600 dark:text-gray-400">
                          {label}:
                        </span>
                        <span className="text-gray-800 dark:text-gray-200">{renderValue(v)}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}
          {newValue ? (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Valor nuevo
              </p>
              <div className="space-y-1 rounded-lg bg-white p-3 text-xs dark:bg-dark-surface-2">
                {Object.entries(newValue)
                  .filter(([k]) =>
                    fieldMode === 'reading' ? !shouldOmitAuditFieldInReading(k) : true,
                  )
                  .slice(0, 12)
                  .map(([k, v]) => {
                    const label = formatFieldName(k, { mode: fieldMode });
                    if (!label) return null;
                    return (
                      <div key={k} className="flex gap-2">
                        <span className="min-w-[100px] font-medium text-gray-600 dark:text-gray-400">
                          {label}:
                        </span>
                        <span className="text-gray-800 dark:text-gray-200">{renderValue(v)}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {showTechnicalMeta ? (
        <div className="border-t border-gray-100 pt-3 dark:border-dark-border">
          <div className="space-y-1">
            <MetaRow label="ID de registro" value={id} mono copyable />
            <MetaRow label="ID de solicitud" value={requestId ?? '—'} mono copyable />
            <MetaRow label="ID de entidad" value={entityId ?? '—'} mono copyable />
            <MetaRow
              label="ID de persona"
              value={userId ?? 'Sistema'}
              mono
              copyable={Boolean(userId)}
            />
            <MetaRow label="IP" value={ipAddress ?? '—'} />
            <MetaRow label="Cliente" value={abbreviateUserAgent(userAgent)} />
            <MetaRow label="Fecha UTC" value={new Date(createdAt).toISOString()} mono />
          </div>
        </div>
      ) : null}
    </div>
  );
}
