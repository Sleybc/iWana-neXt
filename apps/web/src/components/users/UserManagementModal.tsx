'use client';

import { useEffect, useState } from 'react';
import { Button } from '@iwana/ui';
import { ApiError, usersApi, type UpdateUserPayload, type UserListItem } from '@/lib/api-client';

const USER_ROLES = [
  'ADMIN',
  'NOC',
  'SUPPORT',
  'TECHNICIAN',
  'SALES',
  'ACCOUNTANT',
  'HR',
  'SUBSCRIBER',
  'CONTRACTOR',
  'PARTNER',
  'AUDITOR',
  'INVESTOR',
];

const USER_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'INACTIVE'];

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía (CC)' },
  { value: 'CE', label: 'Cédula de Extranjería (CE)' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'NIT_PERSONA', label: 'NIT Persona Natural' },
];

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-dark-border dark:bg-dark-surface-3';
const LABEL_CLASS = 'block text-xs font-medium text-gray-600 dark:text-gray-400';

export function UserManagementModal({
  open,
  tenantSlug,
  user,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  tenantSlug: string;
  user: UserListItem | null;
  onClose: () => void;
  onSaved: (user: UserListItem) => void;
  onDeleted: (userId: string) => void;
}) {
  const [detail, setDetail] = useState<UserListItem | null>(user);
  const [role, setRole] = useState(user?.role ?? 'NOC');
  const [status, setStatus] = useState(user?.status ?? 'ACTIVE');
  const [mfaRequired, setMfaRequired] = useState(user?.mfaRequired ?? false);
  // Campos de perfil
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Carga detalle del usuario al abrir el modal o al cambiar de usuario.
  // Dependencia en user?.id (no el objeto completo) para evitar recargar cuando
  // el padre actualiza la referencia del objeto tras guardar (onSaved → setSelectedUser).
  useEffect(() => {
    if (!open || !tenantSlug || !user) return;

    const loadDetail = async () => {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      try {
        const current = await usersApi.getOne(tenantSlug, user.id);
        setDetail(current);
        setRole(current.role);
        setStatus(current.status);
        setFirstName(current.firstName ?? '');
        setLastName(current.lastName ?? '');
        setPhone(current.phone ?? '');
        setJobTitle(current.jobTitle ?? '');
        setDocumentType(current.documentType ?? '');
        setAvatarUrl(current.avatarUrl ?? '');
        setMfaRequired(current.mfaRequired ?? false);
        // documentNumber nunca retorna del backend (PII sensible — Ley 1581)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No fue posible cargar el detalle.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadDetail();
    // user?.id en deps: solo recargar cuando cambia el usuario seleccionado, no su referencia
  }, [open, tenantSlug, user?.id]);

  // Limpiar al cerrar
  useEffect(() => {
    if (!open) {
      setDetail(null);
      setRole('NOC');
      setStatus('ACTIVE');
      setFirstName('');
      setLastName('');
      setPhone('');
      setJobTitle('');
      setDocumentType('');
      setDocumentNumber('');
      setAvatarUrl('');
      setMfaRequired(false);
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  if (!open || !user) return null;

  const fullName = firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null;

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const payload: UpdateUserPayload = {
        role,
        status,
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(phone ? { phone } : {}),
        ...(jobTitle !== undefined ? { jobTitle } : {}),
        ...(documentType ? { documentType } : {}),
        ...(documentNumber ? { documentNumber } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
        mfaRequired,
      };
      const updated = await usersApi.update(tenantSlug, user.id, payload, crypto.randomUUID());
      setDetail(updated);
      setSuccess('Usuario actualizado correctamente.');
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible actualizar el usuario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setSuccess(null);
    setIsDeleting(true);
    try {
      await usersApi.remove(tenantSlug, user.id);
      onDeleted(user.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible eliminar el usuario.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-management-modal-title"
    >
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl dark:bg-dark-surface-2 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="user-management-modal-title" className="text-lg font-semibold">
              {fullName ?? 'Gestión de usuario'}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-gray-400">{user.id}</p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        {success && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>
        )}

        {isLoading || !detail ? (
          <p className="mt-4 text-sm text-gray-500">Cargando detalle...</p>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Info de seguridad */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-dark-border">
                <p>
                  <strong>Tenant:</strong>{' '}
                  <span className="font-mono text-xs">{detail.tenantId.slice(0, 12)}…</span>
                </p>
                <p>
                  <strong>MFA:</strong> {detail.mfaEnabled ? 'Activo' : 'Inactivo'}
                </p>
                <p>
                  <strong>Email verificado:</strong> {detail.emailVerified ? 'Sí' : 'No'}
                </p>
                <p>
                  <strong>Reset de clave:</strong>{' '}
                  {detail.passwordResetRequired ? 'Pendiente' : 'No'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-dark-border">
                <p>
                  <strong>Creado:</strong> {new Date(detail.createdAt).toLocaleString('es-CO')}
                </p>
                <p>
                  <strong>Actualizado:</strong> {new Date(detail.updatedAt).toLocaleString('es-CO')}
                </p>
                <p>
                  <strong>Último login:</strong>{' '}
                  {detail.lastLoginAt
                    ? new Date(detail.lastLoginAt).toLocaleString('es-CO')
                    : 'Nunca'}
                </p>
              </div>
            </div>

            {/* Rol y Estado */}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="um-role" className={LABEL_CLASS}>
                  Rol
                </label>
                <select
                  id="um-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {USER_ROLES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="um-status" className={LABEL_CLASS}>
                  Estado
                </label>
                <select
                  id="um-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {USER_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Seguridad */}
            <div className="rounded-lg border border-gray-200 p-3 dark:border-dark-border">
              <label className={LABEL_CLASS}>Seguridad</label>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={mfaRequired}
                  onChange={(e) => setMfaRequired(e.target.checked)}
                />
                Requerir verificación en dos pasos (MFA)
              </label>
              {detail?.mfaEnabled && (
                <p className="mt-1 text-xs text-gray-400">
                  MFA actualmente configurado. Desactivar este toggle no elimina el MFA ya
                  configurado.
                </p>
              )}
            </div>

            {/* Perfil personal */}
            <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-dark-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Datos de perfil
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="um-firstname" className={LABEL_CLASS}>
                    Nombres
                  </label>
                  <input
                    id="um-firstname"
                    className={INPUT_CLASS}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Carlos"
                  />
                </div>
                <div>
                  <label htmlFor="um-lastname" className={LABEL_CLASS}>
                    Apellidos
                  </label>
                  <input
                    id="um-lastname"
                    className={INPUT_CLASS}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="García"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="um-jobtitle" className={LABEL_CLASS}>
                  Cargo
                </label>
                <input
                  id="um-jobtitle"
                  className={INPUT_CLASS}
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Técnico de soporte"
                />
              </div>

              <div>
                <label htmlFor="um-phone" className={LABEL_CLASS}>
                  Teléfono (E.164)
                </label>
                <input
                  id="um-phone"
                  type="tel"
                  className={INPUT_CLASS}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+573001234567"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="um-doctype" className={LABEL_CLASS}>
                    Tipo de documento
                  </label>
                  <select
                    id="um-doctype"
                    className={INPUT_CLASS}
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                  >
                    <option value="">-- Seleccionar --</option>
                    {DOCUMENT_TYPES.map((dt) => (
                      <option key={dt.value} value={dt.value}>
                        {dt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="um-docnum" className={LABEL_CLASS}>
                    N.° de documento{' '}
                    <span className="text-xs font-normal text-gray-400">(se cifra)</span>
                  </label>
                  <input
                    id="um-docnum"
                    className={INPUT_CLASS}
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="Dejar vacío para no modificar"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="um-avatar" className={LABEL_CLASS}>
                  URL de avatar
                </label>
                <input
                  id="um-avatar"
                  type="url"
                  className={INPUT_CLASS}
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                loading={isDeleting}
              >
                Eliminar usuario
              </Button>
              <Button type="button" onClick={handleSave} loading={isSaving}>
                Guardar cambios
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
