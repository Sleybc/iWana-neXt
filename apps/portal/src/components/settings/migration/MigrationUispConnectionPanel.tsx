'use client';

import { useId, useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { PlugZap } from 'lucide-react';
import {
  MigrationSourceConnectionUpsertSchema,
  type MigrationSourceConnection,
  type MigrationSourceConnectionUpsert,
} from '@iwana/shared';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  portalCheckboxClassName,
  portalFieldClassName,
  portalWellClassName,
} from '@/components/shared/portal-ui';
import { migrationApi } from '@/lib/api-client';
import { formatMigrationDate } from './migration-labels';
import {
  UISP_CHECK_RESULT_PRESENTATION,
  normalizeCertificateFingerprint,
  uispConnectionErrorMessage,
} from './migration-uisp-users-labels';

type FieldErrors = Partial<Record<'baseUrl' | 'appKey' | 'fingerprint', string>>;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function fieldError(id: string, message: string | undefined) {
  return message ? (
    <p id={id} className="text-sm text-red-700 dark:text-red-300">
      {message}
    </p>
  ) : null;
}

interface ConnectionFormProps {
  connection: MigrationSourceConnection | null;
  onSaved: (connection: MigrationSourceConnection) => void;
  onCancel?: (() => void) | undefined;
}

/**
 * Formulario de la conexión. La clave vive solo en el estado de este formulario mientras se
 * escribe: se borra al guardar y nunca se guarda en el navegador ni se escribe en la consola.
 */
function ConnectionForm({ connection, onSaved, onCancel }: ConnectionFormProps) {
  const baseId = useId();
  const ids = {
    baseUrl: `${baseId}-direccion`,
    appKey: `${baseId}-clave`,
    trust: `${baseId}-confiar`,
    fingerprint: `${baseId}-huella`,
  };
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? '');
  const [appKey, setAppKey] = useState('');
  const [trust, setTrust] = useState(Boolean(connection?.trustedCertificateSha256));
  const [fingerprint, setFingerprint] = useState(connection?.trustedCertificateSha256 ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function validate(): MigrationSourceConnectionUpsert | null {
    const next: FieldErrors = {};
    const url = baseUrl.trim();
    if (!isHttpsUrl(url)) {
      next.baseUrl = 'Escribe la dirección completa de UISP, que empiece por https://.';
    }
    if (appKey.trim() === '') next.appKey = 'Escribe la clave de aplicación de UISP.';
    const normalized = normalizeCertificateFingerprint(fingerprint);
    if (trust && !/^[0-9a-f]{64}$/u.test(normalized)) {
      next.fingerprint =
        'La huella debe tener 64 caracteres entre 0-9 y a-f. Puedes pegarla con o sin dos puntos.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    const parsed = MigrationSourceConnectionUpsertSchema.safeParse({
      baseUrl: url,
      appKey,
      ...(trust ? { trustedCertificateSha256: normalized } : {}),
    });
    if (!parsed.success) {
      setErrors({ baseUrl: 'Revisa la dirección: debe usar https y no llevar usuario ni clave.' });
      return null;
    }
    return parsed.data;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    const payload = validate();
    if (!payload) return;
    setSaving(true);
    try {
      const saved = await migrationApi.saveUispConnection(payload);
      setAppKey('');
      onSaved(saved);
    } catch (saveError) {
      setError(
        uispConnectionErrorMessage(saveError, 'No pudimos guardar la conexión. Intenta de nuevo.'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4"
      aria-busy={saving}
      noValidate
    >
      <div className="space-y-1">
        <label htmlFor={ids.baseUrl} className="text-sm font-medium text-gray-900 dark:text-white">
          Dirección de UISP
        </label>
        <input
          id={ids.baseUrl}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://uisp.tuempresa.co"
          value={baseUrl}
          disabled={saving}
          aria-invalid={errors.baseUrl ? true : undefined}
          aria-describedby={errors.baseUrl ? `${ids.baseUrl}-error` : undefined}
          className={`${portalFieldClassName} min-h-11`}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
        {fieldError(`${ids.baseUrl}-error`, errors.baseUrl)}
      </div>

      <div className="space-y-1">
        <label htmlFor={ids.appKey} className="text-sm font-medium text-gray-900 dark:text-white">
          {connection ? 'Nueva clave de aplicación' : 'Clave de aplicación'}
        </label>
        <input
          id={ids.appKey}
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          value={appKey}
          disabled={saving}
          aria-invalid={errors.appKey ? true : undefined}
          aria-describedby={`${ids.appKey}-ayuda${errors.appKey ? ` ${ids.appKey}-error` : ''}`}
          className={`${portalFieldClassName} min-h-11`}
          onChange={(event) => setAppKey(event.target.value)}
        />
        <p id={`${ids.appKey}-ayuda`} className="text-sm text-gray-500 dark:text-gray-400">
          Créala en UISP con permiso de solo lectura.
          {connection
            ? ' Por seguridad no mostramos la clave guardada: escríbela de nuevo para guardar cambios.'
            : ' Después de guardarla no se vuelve a mostrar.'}
        </p>
        {fieldError(`${ids.appKey}-error`, errors.appKey)}
      </div>

      <div className={`${portalWellClassName} space-y-3`}>
        <div className="flex items-start gap-3">
          <input
            id={ids.trust}
            type="checkbox"
            checked={trust}
            disabled={saving}
            aria-describedby={`${ids.trust}-ayuda`}
            className={`${portalCheckboxClassName} mt-1`}
            onChange={(event) => setTrust(event.target.checked)}
          />
          <div className="space-y-1">
            <label
              htmlFor={ids.trust}
              className="text-sm font-medium text-gray-900 dark:text-white"
            >
              Confiar en este certificado
            </label>
            <p id={`${ids.trust}-ayuda`} className="text-sm text-gray-600 dark:text-gray-300">
              Márcalo solo si UISP usa un certificado autofirmado (el navegador lo muestra como «no
              seguro»). Copia la huella SHA-256 desde los detalles del certificado en el navegador:
              iWana confiará solo en ese certificado exacto.
            </p>
          </div>
        </div>
        {trust ? (
          <div className="space-y-1">
            <label
              htmlFor={ids.fingerprint}
              className="text-sm font-medium text-gray-900 dark:text-white"
            >
              Huella SHA-256 del certificado
            </label>
            <input
              id={ids.fingerprint}
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={fingerprint}
              disabled={saving}
              aria-invalid={errors.fingerprint ? true : undefined}
              aria-describedby={errors.fingerprint ? `${ids.fingerprint}-error` : undefined}
              className={`${portalFieldClassName} min-h-11 font-mono`}
              onChange={(event) => setFingerprint(event.target.value)}
            />
            {fieldError(`${ids.fingerprint}-error`, errors.fingerprint)}
          </div>
        ) : null}
      </div>

      {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="min-h-11" loading={saving}>
          Probar y guardar
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={saving}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        ) : null}
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Antes de guardar, iWana prueba la conexión con UISP.
        </p>
      </div>
    </form>
  );
}

function shortFingerprint(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

interface MigrationUispConnectionPanelProps {
  connection: MigrationSourceConnection | null;
  onChange: (connection: MigrationSourceConnection | null) => void;
  /** Recarga la conexión (p. ej. tras una prueba fallida que registró su resultado). */
  onReload: () => void;
}

export function MigrationUispConnectionPanel({
  connection,
  onChange,
  onReload,
}: MigrationUispConnectionPanelProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'test' | 'remove' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function testConnection() {
    setBusy('test');
    setError(null);
    setNotice(null);
    try {
      const tested = await migrationApi.testUispConnection();
      onChange(tested);
      setNotice('UISP respondió correctamente.');
    } catch (testError) {
      setError(uispConnectionErrorMessage(testError, 'No pudimos probar la conexión.'));
      onReload();
    } finally {
      setBusy(null);
    }
  }

  async function removeConnection() {
    setConfirmRemove(false);
    setBusy('remove');
    setError(null);
    setNotice(null);
    try {
      await migrationApi.removeUispConnection();
      onChange(null);
      setNotice('Conexión retirada. La clave se borró de iWana.');
    } catch (removeError) {
      setError(uispConnectionErrorMessage(removeError, 'No pudimos retirar la conexión.'));
    } finally {
      setBusy(null);
    }
  }

  const feedback = (
    <>
      {notice ? <PortalAlert variant="success" title={notice} /> : null}
      {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}
    </>
  );

  if (!connection || editing) {
    return (
      <PortalPanel
        title="Conexión con UISP"
        description="iWana solo consulta UISP; nunca cambia nada allá."
        labelled
      >
        <div className="space-y-4">
          {!connection && !editing ? (
            <PortalEmptyState
              embedded
              icon={PlugZap}
              title="Aún no hay conexión con UISP"
              description="Registra la dirección de tu UISP y una clave de aplicación de solo lectura para traer a tu personal."
            />
          ) : null}
          {feedback}
          <ConnectionForm
            connection={connection}
            onCancel={connection ? () => setEditing(false) : undefined}
            onSaved={(saved) => {
              setEditing(false);
              setError(null);
              setNotice('Conexión guardada. UISP respondió correctamente.');
              onChange(saved);
            }}
          />
        </div>
      </PortalPanel>
    );
  }

  const check = connection.lastCheckResult
    ? UISP_CHECK_RESULT_PRESENTATION[connection.lastCheckResult]
    : { label: 'Sin probar', variant: 'neutral' as const };

  return (
    <PortalPanel
      title="Conexión con UISP"
      titleAddon={<Badge variant={check.variant}>{check.label}</Badge>}
      description="iWana solo consulta UISP; nunca cambia nada allá."
      labelled
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={busy !== null}
            loading={busy === 'test'}
            onClick={() => void testConnection()}
          >
            Probar conexión
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={busy !== null}
            onClick={() => {
              setNotice(null);
              setError(null);
              setEditing(true);
            }}
          >
            Reemplazar clave
          </Button>
          <Button
            type="button"
            variant="softDestructive"
            className="min-h-11"
            disabled={busy !== null}
            loading={busy === 'remove'}
            onClick={() => setConfirmRemove(true)}
          >
            Retirar
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Dirección</dt>
            <dd className="break-all text-gray-900 dark:text-white">{connection.baseUrl}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Clave de aplicación</dt>
            <dd className="text-gray-900 dark:text-white">Guardada; no se muestra</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Certificado</dt>
            <dd className="text-gray-900 dark:text-white">
              {connection.trustedCertificateSha256 ? (
                <>
                  Huella fijada{' '}
                  <span className="font-mono">
                    {shortFingerprint(connection.trustedCertificateSha256)}
                  </span>
                </>
              ) : (
                'De una entidad reconocida'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Última prueba</dt>
            <dd className="text-gray-900 dark:text-white">
              {connection.lastCheckedAt
                ? `${check.label} · ${formatMigrationDate(connection.lastCheckedAt)}`
                : 'Todavía no se ha probado'}
            </dd>
          </div>
        </dl>
        {feedback}
      </div>

      <Dialog open={confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Retirar la conexión con UISP</DialogTitle>
            <DialogDescription>
              Se borra la clave guardada y ya no se podrán traer usuarios hasta registrar una
              conexión nueva. Los usuarios ya creados o enlazados no cambian.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setConfirmRemove(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              onClick={() => void removeConnection()}
            >
              Retirar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
