'use client';

import { useEffect, useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, FormStatus, Input, Select } from '@iwana/ui';
import { DocumentType, isRutResponsibilitiesRequired, PersonType } from '@iwana/shared';
import type { UpdateSubscriberPayload } from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import { PortalPanel } from '@/components/shared/portal-ui';
import { DOCUMENT_TYPE_OPTIONS, PERSON_TYPE_OPTIONS } from './subscriber-ui';
import { validateNitVerificationDigit } from './subscriber-fiscal';
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
 */
export function SectionCard({
  title,
  description,
  saving,
  onSave,
  error,
  dirty,
  onDiscard,
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
  children: React.ReactNode;
}) {
  return (
    <PortalPanel as="section" labelled title={title} description={description}>
      {children}

      <div className="mt-3">
        <FormStatus status={error ? 'error' : 'idle'} message={error ?? undefined} />
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {dirty && onDiscard ? (
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
    </PortalPanel>
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

export function SubscriberSections({ subscriber, onSave }: SubscriberSectionsProps) {
  // ── Estado sección Identificación ────────────────────────────────────────────
  const [ident, setIdent] = useState<{
    personType: PersonType;
    documentType: string;
    documentNumber: string;
    firstName: string;
    lastName: string;
    nit: string;
    nitVerificationDigit: string;
    businessName: string;
    commercialName: string;
    legalRepresentativeFullName: string;
    legalRepresentativeDocumentType: string;
    legalRepresentativeDocumentNumber: string;
  }>({
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
  });
  const [savingIdent, setSavingIdent] = useState(false);
  const [errorIdent, setErrorIdent] = useState<string | null>(null);

  // ── Estado sección Contacto ──────────────────────────────────────────────────
  const [contact, setContact] = useState({
    email: subscriber.email ?? '',
    phone: subscriber.phone ?? '',
    altContactName: subscriber.altContactName ?? '',
    altContactPhone: subscriber.altContactPhone ?? '',
  });
  const [savingContact, setSavingContact] = useState(false);
  const [errorContact, setErrorContact] = useState<string | null>(null);

  // ── Estado sección Dirección ─────────────────────────────────────────────────
  const [addressDraft, setAddressDraft] = useState({
    address: subscriber.address ?? '',
    neighborhood: subscriber.neighborhood ?? '',
    municipality: normalizeMunicipalityValue(subscriber.department ?? '', subscriber.city),
    department: subscriber.department ?? '',
    postalCode: subscriber.postalCode ?? '',
    coordinates:
      subscriber.latitude != null && subscriber.longitude != null
        ? `${subscriber.latitude}, ${subscriber.longitude}`
        : '',
  });
  const [savingAddress, setSavingAddress] = useState(false);
  const [errorAddress, setErrorAddress] = useState<string | null>(null);

  // Re-sincronizar cuando el suscriptor se recarga desde el servidor
  useEffect(() => {
    setIdent({
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
    });
    setContact({
      email: subscriber.email ?? '',
      phone: subscriber.phone ?? '',
      altContactName: subscriber.altContactName ?? '',
      altContactPhone: subscriber.altContactPhone ?? '',
    });
    setAddressDraft({
      address: subscriber.address ?? '',
      neighborhood: subscriber.neighborhood ?? '',
      municipality: normalizeMunicipalityValue(subscriber.department ?? '', subscriber.city),
      department: subscriber.department ?? '',
      postalCode: subscriber.postalCode ?? '',
      coordinates:
        subscriber.latitude != null && subscriber.longitude != null
          ? `${subscriber.latitude}, ${subscriber.longitude}`
          : '',
    });
  }, [subscriber]);

  const isJuridica = ident.personType === PersonType.JURIDICA;
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
        partial.documentNumber = ident.documentNumber || undefined;
        partial.firstName = ident.firstName || undefined;
        partial.lastName = ident.lastName || undefined;
      }

      await onSave(partial);
    } catch {
      setErrorIdent('No fue posible guardar la identificación.');
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
    } catch {
      setErrorAddress('No fue posible guardar la dirección.');
    } finally {
      setSavingAddress(false);
    }
  };

  const parsedMapCoordinates = parseLatLngPair(addressDraft.coordinates);
  const municipalityOptions = getMunicipiosByDepartamento(addressDraft.department);

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
      {/* Encabezado de secciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-gray-50 bg-white px-6 py-5 shadow-[var(--shadow-sm)] dark:border-dark-border dark:bg-dark-surface-2">
        <div>
          <h2 className="text-lg font-bold text-iwana-primary dark:text-white">
            Datos del suscriptor
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Actualiza cada bloque de forma independiente.
          </p>
        </div>
      </div>

      {/* Grid 2 columnas: Identificación | Contacto + Dirección */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Columna izquierda: Identificación + Contacto */}
        <div className="space-y-6">
          <SectionCard
            title="Identificación"
            description="Datos base del titular o razón social."
            saving={savingIdent}
            onSave={saveIdent}
            error={errorIdent}
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
                      placeholder="Número de identificación"
                      onChange={(e) =>
                        setIdent((prev) => ({ ...prev, documentNumber: e.target.value }))
                      }
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
                    placeholder="Nombre del titular"
                    onChange={(e) => setIdent((prev) => ({ ...prev, firstName: e.target.value }))}
                  />
                  <Input
                    label="Apellido"
                    value={ident.lastName}
                    placeholder="Apellido del titular"
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
                  label="Teléfono"
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
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Departamento"
                  value={addressDraft.department}
                  placeholder="Departamento"
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, department: e.target.value }))
                  }
                />
                <Select
                  label="Municipio"
                  value={addressDraft.municipality}
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

              <div className="grid gap-4 md:grid-cols-12">
                <div className="md:col-span-5">
                  <Input
                    label="Barrio / Sector"
                    value={addressDraft.neighborhood}
                    placeholder="Sector o barrio"
                    onChange={(e) =>
                      setAddressDraft((prev) => ({ ...prev, neighborhood: e.target.value }))
                    }
                  />
                </div>
                <div className="md:col-span-4">
                  <Input
                    label="Dirección"
                    value={addressDraft.address}
                    placeholder="Calle / Carrera / Avenida..."
                    onChange={(e) =>
                      setAddressDraft((prev) => ({ ...prev, address: e.target.value }))
                    }
                  />
                </div>
                <div className="md:col-span-3">
                  <Input
                    label="Código postal"
                    value={addressDraft.postalCode}
                    placeholder="Ej: 110111"
                    onChange={(e) =>
                      setAddressDraft((prev) => ({ ...prev, postalCode: e.target.value }))
                    }
                  />
                </div>
              </div>

              <Input
                label="Coordenadas (Lat, Lng)"
                value={addressDraft.coordinates}
                placeholder="4.6097100, -74.0817500"
                onChange={(e) =>
                  setAddressDraft((prev) => ({ ...prev, coordinates: e.target.value }))
                }
              />

              <div className="rounded-xl border border-gray-100 p-3 dark:border-dark-border">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Vista del mapa
                </p>
                {parsedMapCoordinates && parsedMapCoordinates !== null ? (
                  <div className="space-y-2">
                    <div className="h-56 overflow-hidden rounded-lg border border-gray-200 dark:border-dark-border">
                      <LocationPreviewMap
                        latitude={parsedMapCoordinates.latitude}
                        longitude={parsedMapCoordinates.longitude}
                      />
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
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
