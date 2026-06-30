'use client';

// Panel expandido compartido entre modo Básico y Técnico — muestra diff completo
// y metadata técnica del evento de auditoría
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import {
  computeDiff,
  renderValue,
  formatFieldName,
  abbreviateUserAgent,
} from './helpers/computeDiff';

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
}

/** Botón que copia texto al portapapeles y muestra confirmación visual */
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
      className="ml-1 inline-flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
}

/** Fila de metadata técnica con etiqueta + valor + botón de copia opcional */
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
      <span className="min-w-[100px] text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span
        className={`text-gray-800 dark:text-gray-200 break-all ${mono ? 'font-mono text-[11px]' : ''}`}
      >
        {value}
        {copyable && <CopyButton text={value} />}
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
}: AuditExpandedDetailsProps) {
  const diff = computeDiff(oldValue, newValue);

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Sección: Cambios del evento */}
      {action === 'UPDATE' ? (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
            Cambios ({diff.length} campo{diff.length !== 1 ? 's' : ''} modificado
            {diff.length !== 1 ? 's' : ''})
          </p>
          {diff.length > 0 ? (
            <div className="space-y-1.5">
              {diff.map(({ field, old: oldVal, new: newVal }) => (
                <div
                  key={field}
                  className="flex items-center gap-3 text-xs bg-white dark:bg-dark-surface-2 rounded-lg px-3 py-2"
                >
                  <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[130px]">
                    {formatFieldName(field)}
                  </span>
                  <span className="text-red-500 dark:text-red-400 line-through max-w-[180px] truncate">
                    {renderValue(oldVal)}
                  </span>
                  <span className="text-gray-400 shrink-0">→</span>
                  <span className="text-green-600 dark:text-green-400 max-w-[180px] truncate">
                    {renderValue(newVal)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Sin cambios detectados</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {oldValue && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                Valor anterior
              </p>
              <div className="bg-white dark:bg-dark-surface-2 rounded-lg p-3 text-xs space-y-1">
                {Object.entries(oldValue)
                  .slice(0, 12)
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="font-medium text-gray-600 dark:text-gray-400 min-w-[100px]">
                        {formatFieldName(k)}:
                      </span>
                      <span className="text-gray-800 dark:text-gray-200">{renderValue(v)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {newValue && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                Valor nuevo
              </p>
              <div className="bg-white dark:bg-dark-surface-2 rounded-lg p-3 text-xs space-y-1">
                {Object.entries(newValue)
                  .slice(0, 12)
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="font-medium text-gray-600 dark:text-gray-400 min-w-[100px]">
                        {formatFieldName(k)}:
                      </span>
                      <span className="text-gray-800 dark:text-gray-200">{renderValue(v)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sección: Metadata técnica del evento */}
      <div className="border-t border-gray-100 dark:border-dark-border pt-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
          Metadata técnica
        </p>
        <div className="space-y-1">
          <MetaRow label="ID de registro" value={id} mono copyable />
          <MetaRow label="ID de solicitud" value={requestId ?? '—'} mono copyable />
          <MetaRow label="ID de entidad" value={entityId ?? '—'} mono copyable />
          <MetaRow
            label="ID de actor"
            value={userId ?? 'Sistema'}
            mono
            copyable={Boolean(userId)}
          />
          <MetaRow label="IP" value={ipAddress ?? '—'} />
          <MetaRow label="Cliente" value={abbreviateUserAgent(userAgent)} />
          <MetaRow label="Timestamp UTC" value={new Date(createdAt).toISOString()} mono />
        </div>
      </div>
    </div>
  );
}
