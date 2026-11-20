'use client';

import { useId, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger, cn, interactiveFocusClassName } from '@iwana/ui';
import { AssigneeMark } from './AssigneeMark';
import { ASSURANCE_UNASSIGNED_LABEL } from './assurance-labels';
import { assuranceTextareaClassName } from './assurance-ui';

/** Tope de la nota de asignación: el mismo que valida la API (`ASSIGNMENT_NOTE_MAX_LENGTH`). */
export const ASSIGNMENT_NOTE_MAX_LENGTH = 2000;

export interface ReassignPayload {
  /** `null` quita el responsable («Sin asignar»). */
  assignedUserId: string | null;
  note?: string;
}

/** Nota sin espacios sobrantes; vacía no viaja (asignar sin nota es un solo paso, CA-6). */
export function withAssignmentNote<T extends object>(
  payload: T,
  note: string,
): T & { note?: string } {
  const trimmed = note.trim();
  return trimmed ? { ...payload, note: trimmed } : payload;
}

export interface AssigneeReassignControlProps {
  ticketNumber: string;
  assigneeLabel: string;
  currentAssigneeId: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean | undefined;
  onReassign: (payload: ReassignPayload) => void;
  /** Muestra el nombre junto a las iniciales (bandeja de Mesa de ayuda). */
  showName?: boolean | undefined;
}

/**
 * Reasignar desde la fila de la bandeja (spec 2026-11-20 asignación visible, bloque C): el
 * responsable es un botón que abre la lista de usuarios del detalle; elegir uno guarda (dos
 * clics). La nota es opcional y va antes de elegir. Los clics no llegan a la fila (que abre el
 * ticket): React propaga los eventos del portal por el árbol de componentes.
 */
export function AssigneeReassignControl({
  ticketNumber,
  assigneeLabel,
  currentAssigneeId,
  options,
  disabled = false,
  onReassign,
  showName = false,
}: AssigneeReassignControlProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const noteId = useId();
  const choices = options.filter((option) => option.value !== currentAssigneeId);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNote('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cambiar responsable de ${ticketNumber}: ${assigneeLabel}`}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'relative inline-flex min-h-11 min-w-11 items-center md:min-h-8 md:min-w-8',
            showName ? 'min-w-0 max-w-full rounded-md px-1' : 'justify-center rounded-full',
            'hover:bg-iwana-surface-soft disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-dark-surface-3',
            interactiveFocusClassName,
          )}
        >
          <AssigneeMark label={assigneeLabel} showName={showName} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={`Cambiar responsable de ${ticketNumber}`}
        className="w-72 max-w-[calc(100vw-2rem)] space-y-2 p-3"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <label
          htmlFor={noteId}
          className="block text-xs font-medium text-gray-700 dark:text-gray-200"
        >
          Nota para el nuevo responsable (opcional)
        </label>
        <textarea
          id={noteId}
          rows={2}
          maxLength={ASSIGNMENT_NOTE_MAX_LENGTH}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={cn(assuranceTextareaClassName, 'min-h-14')}
        />
        <ul aria-label="Asignar a" className="max-h-64 space-y-0.5 overflow-y-auto">
          {currentAssigneeId ? (
            <li>
              <button
                type="button"
                aria-label="Dejar sin asignar"
                onClick={() => {
                  onReassign(withAssignmentNote({ assignedUserId: null }, note));
                  setOpen(false);
                  setNote('');
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-gray-900 hover:bg-iwana-surface-soft md:min-h-9 dark:text-white dark:hover:bg-dark-surface-3',
                  interactiveFocusClassName,
                )}
              >
                <AssigneeMark label={ASSURANCE_UNASSIGNED_LABEL} />
                <span aria-hidden="true" className="min-w-0 truncate">
                  {ASSURANCE_UNASSIGNED_LABEL}
                </span>
              </button>
            </li>
          ) : null}
          {choices.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                aria-label={`Asignar a ${option.label}`}
                onClick={() => {
                  onReassign(withAssignmentNote({ assignedUserId: option.value }, note));
                  setOpen(false);
                  setNote('');
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-gray-900 hover:bg-iwana-surface-soft md:min-h-9 dark:text-white dark:hover:bg-dark-surface-3',
                  interactiveFocusClassName,
                )}
              >
                <AssigneeMark label={option.label} />
                <span aria-hidden="true" className="min-w-0 truncate">
                  {option.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
