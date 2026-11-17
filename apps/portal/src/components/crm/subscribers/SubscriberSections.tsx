'use client';

import { useEffect, useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { Pencil } from 'lucide-react';
import { Button, FormStatus, Input, Select, cn } from '@iwana/ui';
import { DocumentType, isRutResponsibilitiesRequired, PersonType } from '@iwana/shared';
import type { UpdateSubscriberPayload } from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import {
  PortalFieldList,
  PortalFieldRow,
  PortalPanel,
  portalPanelDenseActionClassName,
} from '@/components/shared/portal-ui';
import { formatBillingDate } from './billing-cycle-ui';
import { DOCUMENT_TYPE_OPTIONS, PERSON_TYPE_OPTIONS } from './subscriber-ui';
import { validateNitVerificationDigit } from './subscriber-fiscal';
import {
  DOCUMENT_RESTRICTED_EDIT_HELP,
  DOCUMENT_WRITE_FORBIDDEN_MESSAGE,
  isDocumentNumberRestricted,
  isDocumentWriteForbidden,
} from './subscriber-document-access';
import {
  DEPARTAMENTOS,
  getMunicipiosByDepartamento,
} from '@/components/crm/expedientes/expediente-ui';

const LocationPreviewMap = dynamic(() => import('./LocationPreviewMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-100 dark:bg-dark-surface-3" />,
});

interface SubscriberSectionsProps {
  subscriber: SubscriberRecord;
  onSave: (partial: Partial<UpdateSubscriberPayload>) => Promise<void>;
}

/**
 * Sección editable de la ficha sobre `PortalPanel` (receta de panel del portal): misma cabecera
 * y superficie que el resto de bloques, sin tile decorativa. Con `dirty`, «Guardar cambios» solo
 * se habilita si hay cambios pendientes y aparece «Descartar».
 *
 * Con `readView` la sección abre en lectura (etiqueta : valor, como UISP) y «Editar» muestra el
 * formulario; «Cancelar» descarta y vuelve a la lectura (usuario 2026-11-14).
 */
export function SectionCard({
  title,
  description,
  saving,
  onSave,
  error,
  dirty,
  onDiscard,
  readView,
  editing = true,
  onEdit,
  children,
}: {
  title: string;
  description: string;
  saving: boolean;
  onSave: () => void;
  error: string | null;
  /** Ausente: el botón queda siempre habilitado (comportamiento previo). */
  dirty?: boolean;
  onDiscard?: () => void;
  /** Vista de lectura; sin ella la sección es siempre un formulario (comportamiento previo). */
  readView?: React.ReactNode;
  editing?: boolean;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  const reading = readView !== undefined && !editing;
  return (
    <PortalPanel
      as="section"
      labelled
      title={title}
      description={description}
      actions={
        reading && onEdit ? (
          <button
            type="button"
            className={cn(portalPanelDenseActionClassName, 'gap-1.5')}
            aria-label={`Editar ${title.toLowerCase()}`}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Editar
          </button>
        ) : undefined
      }
    >
      {reading ? readView : children}

      {reading ? null : (
        <>
          <div className="mt-3">
            <FormStatus status={error ? 'error' : 'idle'} message={error ?? undefined} />
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {readView !== undefined && onDiscard ? (
              <Button type="button" variant="ghost" disabled={saving} onClick={onDiscard}>
                Cancelar
              </Button>
            ) : dirty && onDiscard ? (
              <Button type="button" variant="ghost" disabled={saving} onClick={onDiscard}>
                Descartar
              </Button>
            ) : null}
            <Button
              type="button"
              loading={saving}
              disabled={dirty === false || saving}
              onClick={onSave}
            >
              {saving ? 'Guardando sección...' : 'Guardar cambios'}
            </Button>
          </div>
        </>
      )}
    </PortalPanel>
  );
}

function optionLabel(options: readonly { value: string; label: string }[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** Mapa de la dirección: el mismo contenedor en lectura y en edición. */
function AddressMapPreview({
  coordinates,
}: {
  coordinates: { latitude: number; longitude: number } | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-gray-100 p-3 dark:border-dark-border">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Vista del mapa
      </p>
      {coordinates ? (
        <div className="space-y-2">
          <div className="h-56 overflow-hidden rounded-lg border border-gray-200 dark:border-dark-border">
            <LocationPreviewMap latitude={coordinates.latitude} longitude={coordinates.longitude} />
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            © Colaboradores de OpenStreetMap
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Ingresa coordenadas en formato latitud, longitud para visualizar el mapa.
        </p>
      )}
    </div>
  );
}

function parseCoordinate(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseLatLngPair(
  value: string,
): { latitude: number; longitude: number } | undefined | null {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parts = normalized.split(',');
  if (parts.length !== 2) {
    return null;
  }

  const latitude = parseCoordinate(parts[0] ?? '');
  const longitude = parseCoordinate(parts[1] ?? '');

  if (latitude === undefined || longitude === undefined) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeMunicipalityValue(
  department: string,
  rawMunicipality: string | null | undefined,
): string {
  const municipality = (rawMunicipality ?? '').trim();
  if (!municipality) {
    return '';
  }

  const scopedMunicipios = getMunicipiosByDepartamento(department);
  const scopedByValue = scopedMunicipios.find((m) => m.value === municipality);
  if (scopedByValue) {
    return scopedByValue.value;
  }

  const scopedByLabel = scopedMunicipios.find(
    (m) => m.label.toLowerCase() === municipality.toLowerCase(),
  );
  if (scopedByLabel) {
    return scopedByLabel.value;
  }

  for (const depto of DEPARTAMENTOS) {
    const globalMatch = depto.municipios.find(
      (m) => m.value === municipality || m.label.toLowerCase() === municipality.toLowerCase(),
    );
    if (globalMatch) {
      return globalMatch.value;
    }
  }

  return municipality;
}

function identFrom(subscriber: SubscriberRecord) {
  return {
    personType: subscriber.personType ?? PersonType.NATURAL,
    documentType: subscriber.documentType ?? '',
    documentNumber: subscriber.documentNumber ?? '',
    firstName: subscriber.firstName ?? '',
    lastName: subscriber.lastName ?? '',
    nit: subscriber.nit ?? '',
    nitVerificationDigit: subscriber.nitVerificationDigit ?? '',
    businessName: subscriber.businessName ?? '',
    commercialName: subscriber.commercialName ?? '',
    legalRepresentativeFullName: '',
    legalRepresentativeDocumentType: '',
    legalRepresentativeDocumentNumber: '',
  };
}

function contactFrom(subscriber: SubscriberRecord) {
  return {
    email: subscriber.email ?? '',
    phone: subscriber.phone ?? '',
    altContactName: subscriber.altContactName ?? '',
    altContactPhone: subscriber.altContactPhone ?? '',
  };
}

function addressFrom(subscriber: SubscriberRecord) {
  return {
    address: subscriber.address ?? '',
    neighborhood: subscriber.neighborhood ?? '',
    municipality: normalizeMunicipalityValue(subscriber.department ?? '', subscriber.city),
    department: subscriber.department ?? '',
    postalCode: subscriber.postalCode ?? '',
    coordinates:
      subscriber.latitude != null && subscriber.longitude != null
        ? `${subscriber.latitude}, ${subscriber.longitude}`
        : '',
  };
}

/** Hay cambios sin guardar si algún campo difiere de lo que trae el servidor. */
function differs<T extends Record<string, string>>(draft: T, saved: T): boolean {
  return (Object.keys(saved) as (keyof T)[]).some((key) => draft[key] !== saved[key]);
}

export function SubscriberSections({ subscriber, onSave }: SubscriberSectionsProps) {
  // ── Estado sección Identificación ────────────────────────────────────────────
  const [ident, setIdent] = useState(() => identFrom(subscriber));
  const [savingIdent, setSavingIdent] = useState(false);
  const [errorIdent, setErrorIdent] = useState<string | null>(null);

  // ── Estado sección Contacto ──────────────────────────────────────────────────
  const [contact, setContact] = useState(() => contactFrom(subscriber));
  const [savingContact, setSavingContact] = useState(false);
  const [errorContact, setErrorContact] = useState<string | null>(null);

  // ── Estado sección Dirección ─────────────────────────────────────────────────
  const [addressDraft, setAddressDraft] = useState(() => addressFrom(subscriber));
  const [savingAddress, setSavingAddress] = useState(false);
  const [errorAddress, setErrorAddress] = useState<string | null>(null);

  // Lectura por defecto; Contacto abre en edición si no hay ningún canal (hay que registrarlo).
  const [editingIdent, setEditingIdent] = useState(false);
  const [editingContact, setEditingContact] = useState(
    () => !subscriber.email && !subscriber.phone,
  );
  const [editingAddress, setEditingAddress] = useState(false);

  // Re-sincronizar cuando el suscriptor se recarga desde el servidor
  useEffect(() => {
    setIdent(identFrom(subscriber));
    setContact(contactFrom(subscriber));
    setAddressDraft(addressFrom(subscriber));
  }, [subscriber]);

  // «Guardar cambios» solo se habilita con cambios pendientes en esa sección (patrón SectionCard).
  const identDirty = differs(ident, identFrom(subscriber));
  const contactDirty = differs(contact, contactFrom(subscriber));
  const addressDirty = differs(addressDraft, addressFrom(subscriber));

  const isJuridica = ident.personType === PersonType.JURIDICA;
  // Sin acceso al documento el valor llega enmascarado: solo lectura y nunca se envía.
  const documentRestricted = isDocumentNumberRestricted(subscriber);
  // Los datos fiscales viven en la pestaña Tributario: aquí se valida contra lo guardado.
  const rutResponsibilitiesRequired = isRutResponsibilitiesRequired({
    personType: ident.personType,
    vatResponsibility: subscriber.vatResponsibility ?? undefined,
  });
  const liveDigitError =
    isJuridica && ident.nit.trim() && ident.nitVerificationDigit.trim()
      ? validateNitVerificationDigit(ident.nit, ident.nitVerificationDigit)
      : null;
  const legalRepresentativeTouched = Boolean(
    ident.legalRepresentativeFullName.trim() ||
    ident.legalRepresentativeDocumentType ||
    ident.legalRepresentativeDocumentNumber.trim(),
  );

  // ── Guardar sección Identificación ──────────────────────────────────────────
  const saveIdent = async () => {
    setErrorIdent(null);
    if (rutResponsibilitiesRequired && !subscriber.rutResponsibilities?.length) {
      setErrorIdent('Registra primero las responsabilidades del RUT en la pestaña Tributario.');
      return;
    }
    if (isJuridica && ident.nitVerificationDigit.trim()) {
      const digitError = validateNitVerificationDigit(ident.nit, ident.nitVerificationDigit);
      if (digitError) {
        setErrorIdent(digitError);
        return;
      }
    }
    if (
      isJuridica &&
      legalRepresentativeTouched &&
      (!ident.legalRepresentativeFullName.trim() ||
        !ident.legalRepresentativeDocumentType ||
        ident.legalRepresentativeDocumentNumber.trim().length < 3)
    ) {
      setErrorIdent(
        'Completa el nombre, el tipo y el número de documento del representante legal.',
      );
      return;
    }
    setSavingIdent(true);
    try {
      const partial: Partial<UpdateSubscriberPayload> = {
        personType: ident.personType,
      };

      if (isJuridica) {
        partial.nit = ident.nit || undefined;
        partial.nitVerificationDigit = ident.nitVerificationDigit || undefined;
        partial.businessName = ident.businessName || undefined;
        partial.commercialName = ident.commercialName || undefined;
        if (legalRepresentativeTouched) {
          partial.legalRepresentative = {
            fullName: ident.legalRepresentativeFullName.trim(),
            documentType: ident.legalRepresentativeDocumentType as DocumentType,
            documentNumber: ident.legalRepresentativeDocumentNumber.trim(),
          };
        }
      } else {
        partial.documentType = (ident.documentType as DocumentType) || undefined;
        if (!documentRestricted) {
          partial.documentNumber = ident.documentNumber || undefined;
        }
        partial.firstName = ident.firstName || undefined;
        partial.lastName = ident.lastName || undefined;
      }

      await onSave(partial);
      setEditingIdent(false);
    } catch (error) {
      setErrorIdent(
        isDocumentWriteForbidden(error)
          ? DOCUMENT_WRITE_FORBIDDEN_MESSAGE
          : 'No fue posible guardar la identificación.',
      );
    } finally {
      setSavingIdent(false);
    }
  };

  // ── Guardar sección Contacto ─────────────────────────────────────────────────
  const saveContact = async () => {
    setErrorContact(null);
    setSavingContact(true);
    try {
      await onSave({
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        altContactName: contact.altContactName || undefined,
        altContactPhone: contact.altContactPhone || undefined,
      });
      setEditingContact(false);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 422 &&
        error.code === 'SUBSCRIBER_CONTACT_REQUIRED'
      ) {
        setErrorContact('Un suscriptor activo necesita al menos un teléfono o un correo.');
      } else {
        setErrorContact('No fue posible guardar el contacto.');
      }
    } finally {
      setSavingContact(false);
    }
  };

  // ── Guardar sección Dirección ────────────────────────────────────────────────
  const saveAddress = async () => {
    setErrorAddress(null);
    setSavingAddress(true);
    try {
      const parsedCoordinates = parseLatLngPair(addressDraft.coordinates);
      if (parsedCoordinates === null) {
        setErrorAddress('Usa el formato de coordenadas: latitud, longitud. Ej: 4.6097, -74.0817');
        return;
      }

      await onSave({
        address: addressDraft.address || undefined,
        neighborhood: addressDraft.neighborhood || undefined,
        city: addressDraft.municipality || undefined,
        department: addressDraft.department || undefined,
        postalCode: addressDraft.postalCode || undefined,
        latitude: parsedCoordinates?.latitude,
        longitude: parsedCoordinates?.longitude,
      });
      setEditingAddress(false);
    } catch {
      setErrorAddress('No fue posible guardar la dirección.');
    } finally {
      setSavingAddress(false);
    }
  };

  const parsedMapCoordinates = parseLatLngPair(addressDraft.coordinates);
  const municipalityOptions = getMunicipiosByDepartamento(addressDraft.department);
  const departmentOptions =
    DEPARTAMENTOS.some((depto) => depto.value === addressDraft.department) ||
    !addressDraft.department
      ? DEPARTAMENTOS
      : [
          ...DEPARTAMENTOS,
          { value: addressDraft.department, label: addressDraft.department, municipios: [] },
        ];

  // ── Vistas de lectura (lo guardado, no el borrador) ─────────────────────────
  const savedIdent = identFrom(subscriber);
  const savedContact = contactFrom(subscriber);
  const savedAddress = addressFrom(subscriber);
  const savedJuridica = savedIdent.personType === PersonType.JURIDICA;
  // Fecha de alta: la conversión a cliente (en importados, la fecha de registro de UISP).
  const customerSince = subscriber.convertedAt ?? subscriber.activatedAt ?? null;
  const textRow = (label: string, value: string, mono = false) => (
    <PortalFieldRow label={label} empty={!value.trim()} mono={mono}>
      {value}
    </PortalFieldRow>
  );

  const identReadView = (
    <PortalFieldList>
      {textRow('Tipo de persona', optionLabel(PERSON_TYPE_OPTIONS, savedIdent.personType))}
      {savedJuridica ? (
        <>
          {textRow(
            'NIT',
            savedIdent.nit
              ? `${savedIdent.nit}${savedIdent.nitVerificationDigit ? `-${savedIdent.nitVerificationDigit}` : ''}`
              : '',
            true,
          )}
          {textRow('Razón social', savedIdent.businessName)}
          {textRow('Nombre comercial', savedIdent.commercialName)}
          {textRow('Representante legal', subscriber.legalRepresentative?.displayName ?? '')}
        </>
      ) : (
        <>
          {textRow(
            'Tipo de documento',
            savedIdent.documentType
              ? optionLabel(DOCUMENT_TYPE_OPTIONS, savedIdent.documentType)
              : '',
          )}
          {textRow('Número de documento', savedIdent.documentNumber, true)}
          {textRow('Nombre', savedIdent.firstName)}
          {textRow('Apellido', savedIdent.lastName)}
        </>
      )}
      {textRow('Cliente desde', customerSince ? formatBillingDate(customerSince) : '')}
    </PortalFieldList>
  );

  const contactReadView = (
    <PortalFieldList>
      {textRow('Correo principal', savedContact.email)}
      {textRow('Teléfono principal', savedContact.phone, true)}
      {textRow('Contacto alternativo', savedContact.altContactName)}
      {textRow('Teléfono alternativo', savedContact.altContactPhone, true)}
    </PortalFieldList>
  );

  const savedDepartment = DEPARTAMENTOS.find((depto) => depto.value === savedAddress.department);
  const addressReadView = (
    <div className="space-y-4">
      <PortalFieldList>
        {textRow('Dirección', savedAddress.address)}
        {textRow('Barrio o sector', savedAddress.neighborhood)}
        {textRow(
          'Municipio',
          savedAddress.municipality
            ? optionLabel(
                getMunicipiosByDepartamento(savedAddress.department),
                savedAddress.municipality,
              )
            : '',
        )}
        {textRow('Departamento', savedDepartment?.label ?? savedAddress.department)}
        {textRow('Código postal', savedAddress.postalCode, true)}
        {textRow('Coordenadas', savedAddress.coordinates, true)}
      </PortalFieldList>
      <AddressMapPreview coordinates={parseLatLngPair(savedAddress.coordinates)} />
    </div>
  );

  if (subscriber.privacyRestricted) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200"
      >
        Datos bloqueados
      </div>
    );
  }

  if (subscriber.anonymizedAt) {
    const anonymized = privacyDisplayValue(null, { anonymizedAt: subscriber.anonymizedAt });
    const fields = [
      ['Nombre o razón social', anonymized],
      ['Documento', anonymized],
      ['Fecha de nacimiento', anonymized],
      ['Correo principal', anonymized],
      ['Teléfono principal', anonymized],
      ['Contacto alternativo', anonymized],
      ['Teléfono alternativo', anonymized],
      ['Dirección', anonymized],
      ['Barrio o sector', anonymized],
      ['Municipio', anonymized],
      ['Departamento', anonymized],
      ['Código postal', anonymized],
      ['Coordenadas', anonymized],
    ];

    return (
      <section
        aria-labelledby="subscriber-anonymized-data-title"
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[var(--shadow-sm)] dark:border-dark-border dark:bg-dark-surface-2"
      >
        <h2
          id="subscriber-anonymized-data-title"
          className="text-lg font-semibold text-gray-900 dark:text-white"
        >
          Datos del suscriptor
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
              <dd className="mt-1 text-sm text-gray-800 dark:text-gray-200">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cada sección se guarda por separado. Grid 2 columnas: Identificación + Contacto | Dirección */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Columna izquierda: Identificación + Contacto */}
        <div className="space-y-6">
          <SectionCard
            title="Identificación"
            description="Datos base del cliente o razón social."
            saving={savingIdent}
            onSave={saveIdent}
            error={errorIdent}
            dirty={identDirty}
            onDiscard={() => {
              setErrorIdent(null);
              setIdent(identFrom(subscriber));
              setEditingIdent(false);
            }}
            readView={identReadView}
            editing={editingIdent}
            onEdit={() => setEditingIdent(true)}
          >
            <div className="space-y-4">
              {/* Fila 1: tipo persona + documento */}
              {/* En la página a dos columnas (lg) la tarjeta es angosta: dos campos por fila. */}
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
                <Select
                  label="Tipo de persona"
                  value={ident.personType}
                  onChange={(e) => {
                    const nextPersonType = e.target.value as PersonType;
                    setIdent((prev) => ({ ...prev, personType: nextPersonType }));
                  }}
                >
                  {PERSON_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>

                {isJuridica ? (
                  <>
                    <Input
                      label="NIT"
                      value={ident.nit}
                      placeholder="Ej: 9001234567"
                      onChange={(e) => setIdent((prev) => ({ ...prev, nit: e.target.value }))}
                    />
                    <div>
                      <Input
                        label="Dígito de verificación"
                        value={ident.nitVerificationDigit}
                        placeholder="Dígito"
                        inputMode="numeric"
                        maxLength={1}
                        aria-invalid={liveDigitError ? true : undefined}
                        onChange={(e) =>
                          setIdent((prev) => ({ ...prev, nitVerificationDigit: e.target.value }))
                        }
                      />
                      {liveDigitError && (
                        <p role="alert" className="mt-1 text-xs text-rose-600">
                          {liveDigitError}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Select
                      label="Tipo de documento"
                      value={ident.documentType}
                      onChange={(e) =>
                        setIdent((prev) => ({ ...prev, documentType: e.target.value }))
                      }
                    >
                      <option value="">Selecciona</option>
                      {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Número de documento"
                      value={ident.documentNumber}
                      placeholder={documentRestricted ? undefined : 'Número de identificación'}
                      readOnly={documentRestricted}
                      helperText={documentRestricted ? DOCUMENT_RESTRICTED_EDIT_HELP : undefined}
                      onChange={(e) => {
                        if (documentRestricted) return;
                        setIdent((prev) => ({ ...prev, documentNumber: e.target.value }));
                      }}
                    />
                  </>
                )}
              </div>

              {/* Fila 2: nombre / razón social */}
              {isJuridica ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Razón social"
                    value={ident.businessName}
                    placeholder="Nombre legal de la empresa"
                    onChange={(e) =>
                      setIdent((prev) => ({ ...prev, businessName: e.target.value }))
                    }
                  />
                  <Input
                    label="Nombre comercial"
                    value={ident.commercialName}
                    placeholder="Nombre de marca o comercial"
                    onChange={(e) =>
                      setIdent((prev) => ({ ...prev, commercialName: e.target.value }))
                    }
                  />
                  <fieldset className="space-y-3 md:col-span-2">
                    <legend className="text-sm font-semibold text-gray-900 dark:text-white">
                      Representante legal
                    </legend>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {subscriber.legalRepresentative ? (
                        <>
                          Actual:{' '}
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {subscriber.legalRepresentative.displayName}
                          </span>
                          . Para cambiarlo, registra los datos del nuevo representante.
                        </>
                      ) : (
                        'Sin representante legal registrado. Regístralo para activar o contratar.'
                      )}
                    </p>
                    <Input
                      label="Nombre completo del representante legal"
                      value={ident.legalRepresentativeFullName}
                      placeholder="Nombre y apellidos"
                      onChange={(e) =>
                        setIdent((prev) => ({
                          ...prev,
                          legalRepresentativeFullName: e.target.value,
                        }))
                      }
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Select
                        label="Tipo de documento del representante"
                        value={ident.legalRepresentativeDocumentType}
                        onChange={(e) =>
                          setIdent((prev) => ({
                            ...prev,
                            legalRepresentativeDocumentType: e.target.value,
                          }))
                        }
                      >
                        <option value="">Selecciona</option>
                        {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                      <Input
                        label="Número de documento del representante"
                        value={ident.legalRepresentativeDocumentNumber}
                        placeholder="Número de identificación"
                        onChange={(e) =>
                          setIdent((prev) => ({
                            ...prev,
                            legalRepresentativeDocumentNumber: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </fieldset>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Nombre"
                    value={ident.firstName}
                    placeholder="Nombre del cliente"
                    onChange={(e) => setIdent((prev) => ({ ...prev, firstName: e.target.value }))}
                  />
                  <Input
                    label="Apellido"
                    value={ident.lastName}
                    placeholder="Apellido del cliente"
                    onChange={(e) => setIdent((prev) => ({ ...prev, lastName: e.target.value }))}
                  />
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Contacto"
            description="Canales directos para comunicación con el suscriptor."
            saving={savingContact}
            onSave={saveContact}
            error={errorContact}
            dirty={contactDirty}
            onDiscard={() => {
              setErrorContact(null);
              setContact(contactFrom(subscriber));
              setEditingContact(false);
            }}
            readView={contactReadView}
            editing={editingContact}
            onEdit={() => setEditingContact(true)}
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Correo principal"
                  type="email"
                  value={contact.email}
                  placeholder="cliente@empresa.co"
                  onChange={(e) => setContact((prev) => ({ ...prev, email: e.target.value }))}
                />
                <Input
                  label="Teléfono principal"
                  type="tel"
                  value={contact.phone}
                  placeholder="3001234567"
                  onChange={(e) => setContact((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Contacto alternativo"
                  value={contact.altContactName}
                  placeholder="Nombre de contacto alternativo"
                  onChange={(e) =>
                    setContact((prev) => ({ ...prev, altContactName: e.target.value }))
                  }
                />
                <Input
                  label="Teléfono alternativo"
                  type="tel"
                  value={contact.altContactPhone}
                  placeholder="3001234567"
                  onChange={(e) =>
                    setContact((prev) => ({ ...prev, altContactPhone: e.target.value }))
                  }
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Columna derecha: Dirección */}
        <div className="space-y-6">
          <SectionCard
            title="Dirección"
            description="Ubicación del suscriptor para servicio e instalación."
            saving={savingAddress}
            onSave={saveAddress}
            error={errorAddress}
            dirty={addressDirty}
            onDiscard={() => {
              setErrorAddress(null);
              setAddressDraft(addressFrom(subscriber));
              setEditingAddress(false);
            }}
            readView={addressReadView}
            editing={editingAddress}
            onEdit={() => setEditingAddress(true)}
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  label="Departamento"
                  value={addressDraft.department}
                  onChange={(e) => {
                    const department = e.target.value;
                    setAddressDraft((prev) => ({
                      ...prev,
                      department,
                      // El municipio solo se conserva si pertenece al nuevo departamento.
                      municipality: getMunicipiosByDepartamento(department).some(
                        (m) => m.value === prev.municipality,
                      )
                        ? prev.municipality
                        : '',
                    }));
                  }}
                >
                  <option value="">Selecciona un departamento</option>
                  {departmentOptions.map((depto) => (
                    <option key={depto.value} value={depto.value}>
                      {depto.label}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Municipio"
                  value={addressDraft.municipality}
                  disabled={!addressDraft.department}
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, municipality: e.target.value }))
                  }
                >
                  <option value="">Selecciona un municipio</option>
                  {municipalityOptions.map((municipio) => (
                    <option key={municipio.value} value={municipio.value}>
                      {municipio.label}
                    </option>
                  ))}
                </Select>
              </div>

              <Input
                label="Dirección"
                value={addressDraft.address}
                placeholder="Calle, carrera o avenida y número"
                onChange={(e) => setAddressDraft((prev) => ({ ...prev, address: e.target.value }))}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Input
                    label="Barrio o sector"
                    value={addressDraft.neighborhood}
                    placeholder="Barrio, vereda o sector"
                    onChange={(e) =>
                      setAddressDraft((prev) => ({ ...prev, neighborhood: e.target.value }))
                    }
                  />
                </div>
                <Input
                  label="Código postal"
                  value={addressDraft.postalCode}
                  placeholder="Ej: 110111"
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, postalCode: e.target.value }))
                  }
                />
              </div>

              <Input
                label="Coordenadas (latitud, longitud)"
                value={addressDraft.coordinates}
                placeholder="4.6097100, -74.0817500"
                onChange={(e) =>
                  setAddressDraft((prev) => ({ ...prev, coordinates: e.target.value }))
                }
              />

              <AddressMapPreview coordinates={parsedMapCoordinates} />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
