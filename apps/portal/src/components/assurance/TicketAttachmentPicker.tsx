'use client';

import { useId, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Button, cn } from '@iwana/ui';
import {
  TICKET_ATTACHMENT_ACCEPT,
  TICKET_ATTACHMENT_HINT,
  addTicketAttachmentFiles,
  formatTicketAttachmentSize,
  type TicketAttachmentSelectionIssue,
} from './ticket-attachments';

interface TicketAttachmentPickerProps {
  files: readonly File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

/**
 * Selector de archivos del comentario: valida en el navegador antes de enviar
 * (tipo, tamaño por tipo, máximo 10 y total) y lista lo elegido con opción de quitar.
 */
export function TicketAttachmentPicker({ files, onChange, disabled }: TicketAttachmentPickerProps) {
  const inputId = useId();
  const hintId = useId();
  const [issues, setIssues] = useState<TicketAttachmentSelectionIssue[]>([]);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={inputId}
          type="file"
          multiple
          accept={TICKET_ATTACHMENT_ACCEPT}
          disabled={disabled}
          aria-describedby={hintId}
          className="peer sr-only"
          data-testid="ticket-comment-attachments-input"
          onChange={(event) => {
            const incoming = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            const selection = addTicketAttachmentFiles(files, incoming);
            setIssues(selection.issues);
            onChange(selection.files);
          }}
        />
        <label
          htmlFor={inputId}
          className={cn(
            'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-iwana-primary/25 bg-white px-4 text-sm font-semibold text-iwana-primary hover:border-iwana-primary hover:bg-iwana-primary-50',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-iwana-primary peer-focus-visible:ring-offset-2',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            'dark:border-iwana-primary-300/40 dark:bg-dark-surface-2 dark:text-iwana-primary-300 dark:hover:bg-dark-surface-3',
          )}
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          Adjuntar archivos
        </label>
        <p id={hintId} className="text-xs text-gray-600 dark:text-gray-300">
          {TICKET_ATTACHMENT_HINT}
        </p>
      </div>

      {issues.length > 0 ? (
        <ul
          role="alert"
          aria-label="Archivos no agregados"
          className="space-y-1 rounded-xl border border-error-500/30 bg-error-50 px-3 py-2 dark:border-error-500/30 dark:bg-error-500/10"
        >
          {issues.map((issue, index) => (
            <li
              key={`${issue.filename}-${index}`}
              className="text-xs text-error-700 dark:text-error-400"
            >
              <span className="break-all font-semibold">«{issue.filename}»</span>: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul aria-label="Archivos para adjuntar" className="space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              data-testid="ticket-comment-attachment-selected"
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 dark:border-dark-border dark:bg-dark-surface-2"
            >
              <Paperclip className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
              <span className="min-w-0 flex-1 break-all text-sm text-gray-800 dark:text-gray-100">
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-gray-600 dark:text-gray-300">
                {formatTicketAttachmentSize(file.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                disabled={disabled}
                aria-label={`Quitar ${file.name}`}
                onClick={() => {
                  setIssues([]);
                  onChange(files.filter((_, position) => position !== index));
                }}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
