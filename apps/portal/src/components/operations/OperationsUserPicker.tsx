// apps/portal/src/components/operations/OperationsUserPicker.tsx
// Picker de personas (responsable de tarea, asignado de OT, destinatario
// interno) sobre el typeahead `GET /users/search` — sustituye al crawl de
// usuarios del monolito (spec de diseño §4.8; CA-08: ningún montaje recorre
// el directorio completo).
//
// D-P1 (resolución del orquestador, Salida 2 — degradación visible): el
// endpoint exige @Roles(ADMIN, SYSTEM_ADMIN); los perfiles de monitoreo
// operativo y soporte reciben 403. La degradación NUNCA es silenciosa: el 403
// se mapea a un aviso explícito y accionable que explica la restricción y la
// salida (seguir operando sin el filtro; en el alta, pedir apoyo a un
// administrador). Copy conforme a `system-vocabulary-review` (sin roles
// crudos ni siglas internas).
'use client';

import { useCallback, useState } from 'react';
import { ApiError, usersApi } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';

/** Límite canónico del typeahead E-4 (máx. dominio ≤20). */
const USER_PICKER_LIMIT = 20;

const USER_RESOURCE = { singular: 'persona', plural: 'personas' } as const;

export interface OperationsUserPickerProps {
  id?: string;
  label?: string;
  /** id seleccionado o null. Controlado puro. */
  value: string | null;
  /** Etiqueta del valor actual para S0 cuando el ítem no está en la última query. */
  selectedItem?: Pick<SearchablePickerItem, 'label' | 'sublabel'> | null;
  onChange: (next: SearchablePickerItem | null) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Mensaje de validación del campo (debajo del control). */
  error?: string | undefined;
  /** Título del aviso visible cuando el perfil no puede buscar personas (403). */
  unavailableTitle: string;
  /** Descripción del aviso: qué pasó y qué salida tiene el usuario. */
  unavailableDescription: string;
}

export function OperationsUserPicker({
  id,
  label,
  value,
  selectedItem = null,
  onChange,
  disabled = false,
  placeholder,
  error,
  unavailableTitle,
  unavailableDescription,
}: OperationsUserPickerProps) {
  const [unavailable, setUnavailable] = useState(false);

  const searchUsers = useCallback(async (query: string, signal: AbortSignal) => {
    try {
      const response = await usersApi.searchForPicker(
        { q: query, limit: USER_PICKER_LIMIT },
        { signal },
      );
      setUnavailable(false);
      return { items: response.data, total: response.total };
    } catch (searchError) {
      if (searchError instanceof ApiError && searchError.status === 403) {
        // D-P1: visible y accionable, nunca silencioso. El listado devuelve
        // vacío para que el picker muestre su estado vacío junto al aviso.
        setUnavailable(true);
        return { items: [] as SearchablePickerItem[], total: 0 };
      }
      throw searchError;
    }
  }, []);

  return (
    <div className="space-y-2">
      <SearchablePicker
        {...(id ? { id } : {})}
        {...(label ? { label } : {})}
        resource={USER_RESOURCE}
        value={value}
        selectedItem={selectedItem}
        onChange={onChange}
        onSearch={searchUsers}
        disabled={disabled}
        {...(placeholder ? { placeholder } : {})}
        labels={{
          empty: () => 'Sin resultados de la búsqueda',
        }}
      />

      {unavailable ? (
        <PortalAlert
          variant="warning"
          title={unavailableTitle}
          description={unavailableDescription}
        />
      ) : null}

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
