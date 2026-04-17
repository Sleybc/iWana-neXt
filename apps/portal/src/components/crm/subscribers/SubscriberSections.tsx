'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';
import { MapPin, Phone, UserRound } from 'lucide-react';
import { PersonType } from '@iwana/shared';
import type { UpdateSubscriberPayload } from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import { DOCUMENT_TYPE_OPTIONS, PERSON_TYPE_OPTIONS } from './subscriber-ui';
import { VatTreatmentBanner } from './VatTreatmentBanner';

interface SubscriberSectionsProps {
  subscriber: SubscriberRecord;
  onSave: (partial: Partial<UpdateSubscriberPayload>) => Promise<void>;
}

// Tarjeta de sección con el mismo patrón visual que ExpedienteSections.renderSectionCard
function SectionCard({
  icon: Icon,
  title,
  description,
  completion,
  saving,
  onSave,
  error,
  children,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  description: string;
  completion: number;
  saving: boolean;
  onSave: () => void;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-gray-100 bg-white shadow-[var(--shadow-iwana-soft)] dark:border-dark-border dark:bg-dark-surface-2">
      {/* Cabecera: icono + título + descripción + badge % */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-dark-border">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-iwana-secondary/10 text-iwana-secondary-700 dark:bg-iwana-secondary/20 dark:text-iwana-secondary-300">
          <Icon className="h-5 w-5" aria-hidden={true} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-gray-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <span className="text-xs font-semibold tabular-nums text-iwana-secondary-700 dark:text-iwana-secondary-400">
          {completion}%
        </span>
      </div>

      {/* Contenido */}
      <div className="px-5 py-5">
        {children}

        {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            loading={saving}
            onClick={onSave}
            className="rounded-xl bg-iwana-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-iwana-primary/90 disabled:opacity-50"
          >
            {saving ? 'Guardando sección...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Calcula el porcentaje de campos requeridos completados (0–100) */
function pct(values: (string | undefined | null)[]): number {
  const filled = values.filter((v) => Boolean(v?.trim())).length;
  return Math.round((filled / values.length) * 100);
}

function parseCoordinate(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    legalRepresentativeId: string;
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
    legalRepresentativeId: subscriber.legalRepresentativeId ?? '',
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
    municipality: subscriber.city ?? '',
    department: subscriber.department ?? '',
    postalCode: subscriber.postalCode ?? '',
    latitude: subscriber.latitude !== null ? String(subscriber.latitude) : '',
    longitude: subscriber.longitude !== null ? String(subscriber.longitude) : '',
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
      legalRepresentativeId: subscriber.legalRepresentativeId ?? '',
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
      municipality: subscriber.city ?? '',
      department: subscriber.department ?? '',
      postalCode: subscriber.postalCode ?? '',
      latitude: subscriber.latitude !== null ? String(subscriber.latitude) : '',
      longitude: subscriber.longitude !== null ? String(subscriber.longitude) : '',
    });
  }, [subscriber]);

  // ── Cálculo de completitud ───────────────────────────────────────────────────
  const isJuridica = ident.personType === PersonType.JURIDICA;

  const identRequired = isJuridica
    ? [ident.personType, ident.nit, ident.businessName]
    : [ident.personType, ident.documentNumber, ident.firstName, ident.lastName];
  const identCompletion = pct(identRequired);

  const contactCompletion = pct([contact.email, contact.phone]);
  const addressCompletion = pct([
    addressDraft.department,
    addressDraft.municipality,
    addressDraft.address,
  ]);

  // ── Guardar sección Identificación ──────────────────────────────────────────
  const saveIdent = async () => {
    setErrorIdent(null);
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
        partial.legalRepresentativeId = ident.legalRepresentativeId || undefined;
      } else {
        partial.documentType =
          (ident.documentType as import('@iwana/shared').DocumentType) || undefined;
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
    } catch {
      setErrorContact('No fue posible guardar el contacto.');
    } finally {
      setSavingContact(false);
    }
  };

  // ── Guardar sección Dirección ────────────────────────────────────────────────
  const saveAddress = async () => {
    setErrorAddress(null);
    setSavingAddress(true);
    try {
      await onSave({
        address: addressDraft.address || undefined,
        neighborhood: addressDraft.neighborhood || undefined,
        city: addressDraft.municipality || undefined,
        department: addressDraft.department || undefined,
        postalCode: addressDraft.postalCode || undefined,
        latitude: parseCoordinate(addressDraft.latitude),
        longitude: parseCoordinate(addressDraft.longitude),
      });
    } catch {
      setErrorAddress('No fue posible guardar la dirección.');
    } finally {
      setSavingAddress(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado de secciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-gray-50 bg-white px-6 py-5 shadow-[var(--shadow-iwana-soft)] dark:border-dark-border dark:bg-dark-surface-2">
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
        {/* Columna izquierda: Identificación */}
        <SectionCard
          icon={UserRound}
          title="Identificación"
          description="Datos base del titular o razón social."
          completion={identCompletion}
          saving={savingIdent}
          onSave={saveIdent}
          error={errorIdent}
        >
          <div className="space-y-4">
            {/* Fila 1: tipo persona + documento */}
            <div className="grid gap-4 md:grid-cols-3">
              <Select
                label="Tipo de persona"
                value={ident.personType}
                onChange={(e) =>
                  setIdent((prev) => ({ ...prev, personType: e.target.value as PersonType }))
                }
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
                  <Input
                    label="Dígito de verificación"
                    value={ident.nitVerificationDigit}
                    placeholder="Dígito"
                    onChange={(e) =>
                      setIdent((prev) => ({ ...prev, nitVerificationDigit: e.target.value }))
                    }
                  />
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
                  onChange={(e) => setIdent((prev) => ({ ...prev, businessName: e.target.value }))}
                />
                <Input
                  label="Nombre comercial"
                  value={ident.commercialName}
                  placeholder="Nombre de marca o comercial"
                  onChange={(e) =>
                    setIdent((prev) => ({ ...prev, commercialName: e.target.value }))
                  }
                />
                <div className="md:col-span-2">
                  <Input
                    label="Representante legal"
                    value={ident.legalRepresentativeId}
                    placeholder="Nombre del representante legal"
                    onChange={(e) =>
                      setIdent((prev) => ({ ...prev, legalRepresentativeId: e.target.value }))
                    }
                  />
                </div>
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

            {/* Banner régimen fiscal (lectura) */}
            {subscriber.vatTreatment && (
              <VatTreatmentBanner
                vatTreatment={subscriber.vatTreatment}
                taxRegime={subscriber.taxRegime}
              />
            )}
          </div>
        </SectionCard>

        {/* Columna derecha: Contacto + Dirección */}
        <div className="space-y-6">
          <SectionCard
            icon={Phone}
            title="Contacto"
            description="Canales directos para comunicación con el suscriptor."
            completion={contactCompletion}
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
          </SectionCard>

          <SectionCard
            icon={MapPin}
            title="Dirección"
            description="Ubicación del suscriptor para servicio e instalación."
            completion={addressCompletion}
            saving={savingAddress}
            onSave={saveAddress}
            error={errorAddress}
          >
            <div className="space-y-4">
              <Input
                label="Dirección"
                value={addressDraft.address}
                placeholder="Calle / Carrera / Avenida..."
                onChange={(e) => setAddressDraft((prev) => ({ ...prev, address: e.target.value }))}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Barrio / Sector"
                  value={addressDraft.neighborhood}
                  placeholder="Sector o barrio"
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, neighborhood: e.target.value }))
                  }
                />
                <Input
                  label="Municipio"
                  value={addressDraft.municipality}
                  placeholder="Municipio"
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, municipality: e.target.value }))
                  }
                />
                <Input
                  label="Departamento"
                  value={addressDraft.department}
                  placeholder="Departamento"
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, department: e.target.value }))
                  }
                />
                <Input
                  label="Código postal"
                  value={addressDraft.postalCode}
                  placeholder="Ej: 110111"
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, postalCode: e.target.value }))
                  }
                />
                <Input
                  label="Latitud"
                  value={addressDraft.latitude}
                  placeholder="4.6097100"
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, latitude: e.target.value }))
                  }
                />
                <Input
                  label="Longitud"
                  value={addressDraft.longitude}
                  placeholder="-74.0817500"
                  onChange={(e) =>
                    setAddressDraft((prev) => ({ ...prev, longitude: e.target.value }))
                  }
                />
              </div>

              <div className="rounded-xl border border-gray-100 p-3 dark:border-dark-border">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Vista del mapa
                </p>
                {parseCoordinate(addressDraft.latitude) !== undefined &&
                parseCoordinate(addressDraft.longitude) !== undefined ? (
                  <iframe
                    title="Vista de ubicación del suscriptor"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${(parseCoordinate(addressDraft.longitude) ?? 0) - 0.01}%2C${(parseCoordinate(addressDraft.latitude) ?? 0) - 0.01}%2C${(parseCoordinate(addressDraft.longitude) ?? 0) + 0.01}%2C${(parseCoordinate(addressDraft.latitude) ?? 0) + 0.01}&layer=mapnik&marker=${parseCoordinate(addressDraft.latitude)}%2C${parseCoordinate(addressDraft.longitude)}`}
                    className="h-56 w-full rounded-lg border border-gray-200 dark:border-dark-border"
                    loading="lazy"
                  />
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Ingresa latitud y longitud para visualizar el mapa.
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
