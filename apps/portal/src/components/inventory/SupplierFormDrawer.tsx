'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import {
  DocumentTypeParty,
  PartyContactType,
  PartyType,
  SupplierProfileStatus,
} from '@iwana/shared';
import type {
  CreateSupplierDto,
  SupplierProfileRecord,
  SupplierSummaryRecord,
  UpdateSupplierDto,
} from '@/lib/api-client';
import { purchasingApi } from '@/lib/api-client';
import { PortalAlert, portalTextareaClassName } from '@/components/shared/portal-ui';
import { PortalDiscardChangesDialog } from '@/components/shared/PortalDiscardChangesDialog';
import { useDiscardChangesGuard } from '@/components/shared/use-discard-changes-guard';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import { getSupplierProfileStatusLabel } from './inventory-labels';
import { SupplierSummaryCard } from './SupplierSummaryCard';

type CreateStep = 'identity' | 'commercial';

interface IdentityFormState {
  partyType: PartyType;
  documentType: DocumentTypeParty;
  documentNumber: string;
  displayName: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
}

interface CommercialFormState {
  paymentTermsDays: string;
  currency: string;
  incoterm: string;
  defaultLeadTimeDays: string;
  purchasingContactName: string;
  purchasingContactEmail: string;
  purchasingContactPhone: string;
  notes: string;
}

const DOCUMENT_TYPE_OPTIONS = [
  { value: DocumentTypeParty.NIT, label: 'NIT' },
  { value: DocumentTypeParty.CC, label: 'Cédula de ciudadanía' },
  { value: DocumentTypeParty.CE, label: 'Cédula de extranjería' },
  { value: DocumentTypeParty.PASAPORTE, label: 'Pasaporte' },
  { value: DocumentTypeParty.TI, label: 'Tarjeta de identidad' },
  { value: DocumentTypeParty.RUT, label: 'RUT' },
  { value: DocumentTypeParty.OTHER, label: 'Otro' },
] as const;

const PARTY_TYPE_OPTIONS = [
  { value: PartyType.ORGANIZATION, label: 'Persona jurídica' },
  { value: PartyType.NATURAL, label: 'Persona natural' },
] as const;

function defaultIdentityForm(): IdentityFormState {
  return {
    partyType: PartyType.ORGANIZATION,
    documentType: DocumentTypeParty.NIT,
    documentNumber: '',
    displayName: '',
    legalName: '',
    contactEmail: '',
    contactPhone: '',
  };
}

function defaultCommercialForm(): CommercialFormState {
  return {
    paymentTermsDays: '',
    currency: 'COP',
    incoterm: '',
    defaultLeadTimeDays: '',
    purchasingContactName: '',
    purchasingContactEmail: '',
    purchasingContactPhone: '',
    notes: '',
  };
}

function commercialFormFromSupplier(supplier: SupplierProfileRecord): CommercialFormState {
  return {
    paymentTermsDays: supplier.paymentTermsDays !== null ? String(supplier.paymentTermsDays) : '',
    currency: supplier.currency ?? 'COP',
    incoterm: supplier.incoterm ?? '',
    defaultLeadTimeDays:
      supplier.defaultLeadTimeDays !== null ? String(supplier.defaultLeadTimeDays) : '',
    purchasingContactName: supplier.purchasingContactName ?? '',
    purchasingContactEmail: supplier.purchasingContactEmail ?? '',
    purchasingContactPhone: supplier.purchasingContactPhone ?? '',
    notes: supplier.notes ?? '',
  };
}

function buildCommercialPayload(form: CommercialFormState): UpdateSupplierDto {
  const paymentTermsDays = form.paymentTermsDays.trim();
  const defaultLeadTimeDays = form.defaultLeadTimeDays.trim();

  return {
    paymentTermsDays: paymentTermsDays ? Number.parseInt(paymentTermsDays, 10) : null,
    currency: form.currency.trim().toUpperCase() || null,
    incoterm: form.incoterm.trim() || null,
    defaultLeadTimeDays: defaultLeadTimeDays ? Number.parseInt(defaultLeadTimeDays, 10) : null,
    purchasingContactName: form.purchasingContactName.trim() || null,
    purchasingContactEmail: form.purchasingContactEmail.trim() || null,
    purchasingContactPhone: form.purchasingContactPhone.trim() || null,
    notes: form.notes.trim() || null,
  };
}

function buildCreatePayload(
  identity: IdentityFormState,
  commercial: CommercialFormState,
): CreateSupplierDto {
  const contacts = [
    identity.contactEmail.trim()
      ? {
          type: PartyContactType.EMAIL,
          value: identity.contactEmail.trim(),
          isPrimary: true,
        }
      : null,
    identity.contactPhone.trim()
      ? {
          type: PartyContactType.PHONE,
          value: identity.contactPhone.trim(),
          isPrimary: !identity.contactEmail.trim(),
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    partyType: identity.partyType,
    documentType: identity.documentType,
    documentNumber: identity.documentNumber.trim(),
    displayName: identity.displayName.trim(),
    legalName: identity.legalName.trim() || null,
    ...(contacts.length > 0 ? { contacts } : {}),
    ...buildCommercialPayload(commercial),
  };
}

function mapPartyToSummary(supplier: SupplierProfileRecord): SupplierSummaryRecord | null {
  if (!supplier.party) {
    return null;
  }

  return {
    partyRefId: supplier.party.partyRefId,
    displayName: supplier.party.displayName,
    primaryContact: supplier.party.primaryContact,
    phone: supplier.party.phone,
    email: supplier.party.email,
    city: supplier.party.city,
    status: supplier.party.status,
  };
}

interface SupplierFormDrawerProps {
  open: boolean;
  supplier: SupplierProfileRecord | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (payload: CreateSupplierDto) => Promise<void>;
  onUpdate: (partyRefId: string, payload: UpdateSupplierDto) => Promise<void>;
  onSetStatus: (partyRefId: string, status: SupplierProfileStatus) => Promise<void>;
}

export function SupplierFormDrawer({
  open,
  supplier,
  isSubmitting,
  error,
  onClose,
  onCreate,
  onUpdate,
  onSetStatus,
}: SupplierFormDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const isEditing = supplier !== null;

  const [createStep, setCreateStep] = useState<CreateStep>('identity');
  const [identityForm, setIdentityForm] = useState<IdentityFormState>(defaultIdentityForm());
  const [commercialForm, setCommercialForm] =
    useState<CommercialFormState>(defaultCommercialForm());
  const [baselineCommercialForm, setBaselineCommercialForm] = useState<CommercialFormState | null>(
    null,
  );
  const [identityLocked, setIdentityLocked] = useState(false);
  const [identityReuseNotice, setIdentityReuseNotice] = useState<string | null>(null);
  const [reusedPartySummary, setReusedPartySummary] = useState<SupplierSummaryRecord | null>(null);
  const [reusedHasProfile, setReusedHasProfile] = useState(false);
  const [isSearchingDocument, setIsSearchingDocument] = useState(false);
  const [documentSearchError, setDocumentSearchError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBaselineCommercialForm(null);
      return;
    }

    setValidationError(null);
    setDocumentSearchError(null);
    setIdentityReuseNotice(null);
    setReusedPartySummary(null);
    setReusedHasProfile(false);
    setIdentityLocked(false);
    setCreateStep('identity');

    if (supplier) {
      const initialCommercial = commercialFormFromSupplier(supplier);
      setCommercialForm(initialCommercial);
      setBaselineCommercialForm(initialCommercial);
      setIdentityForm(defaultIdentityForm());
      return;
    }

    const initialIdentity = defaultIdentityForm();
    const initialCommercial = defaultCommercialForm();
    setIdentityForm(initialIdentity);
    setCommercialForm(initialCommercial);
    setBaselineCommercialForm(null);
  }, [open, supplier]);

  const isDirty = isEditing
    ? baselineCommercialForm !== null &&
      JSON.stringify(commercialForm) !== JSON.stringify(baselineCommercialForm)
    : identityForm.documentNumber.trim().length > 0 ||
      identityForm.displayName.trim().length > 0 ||
      commercialForm.notes.trim().length > 0;

  const { discardOpen, requestClose, confirmDiscard, cancelDiscard } = useDiscardChangesGuard({
    open,
    isDirty,
    onClose,
  });

  usePortalSideDrawerA11y(open && !discardOpen, drawerRef, requestClose);

  const partySummary = useMemo(() => (supplier ? mapPartyToSummary(supplier) : null), [supplier]);

  function updateIdentity<K extends keyof IdentityFormState>(key: K, value: IdentityFormState[K]) {
    setIdentityForm((current) => ({ ...current, [key]: value }));
  }

  function updateCommercial<K extends keyof CommercialFormState>(
    key: K,
    value: CommercialFormState[K],
  ) {
    setCommercialForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSearchDocument() {
    const documentNumber = identityForm.documentNumber.trim();

    if (!documentNumber) {
      setDocumentSearchError('Ingresa el número de documento para buscar.');
      return;
    }

    setIsSearchingDocument(true);
    setDocumentSearchError(null);
    setIdentityReuseNotice(null);
    setReusedPartySummary(null);
    setReusedHasProfile(false);

    try {
      // Busqueda EXACTA por (tipo, numero) de documento: el backend deduplica identidad
      // por (documentType, documentNumber). Al hallar el tercero sincronizamos su identidad
      // real (no se envia partyRefId; el enlace lo resuelve el backend por documento).
      const result = await purchasingApi.lookupSupplierByDocument({
        documentType: identityForm.documentType,
        documentNumber,
      });

      if (result.match) {
        const { match } = result;
        setIdentityForm((current) => ({
          ...current,
          documentType: match.documentType,
          partyType: match.partyType,
          displayName: match.displayName,
          legalName: match.legalName ?? '',
        }));
        setReusedPartySummary({
          partyRefId: match.summary.partyRefId,
          displayName: match.summary.displayName,
          primaryContact: match.summary.primaryContact,
          phone: match.summary.phone,
          email: match.summary.email,
          city: match.summary.city,
          status: match.summary.status,
        });
        setReusedHasProfile(result.hasSupplierProfile);
        setIdentityLocked(true);

        if (result.hasSupplierProfile) {
          setIdentityReuseNotice(
            'Este tercero ya tiene un perfil de proveedor. No es posible crear otro; edítalo desde el listado de proveedores.',
          );
        } else {
          setIdentityReuseNotice(
            'Se reutilizará la identidad de este tercero (verifica la ficha). Su documento y razón social no se modifican desde Compras; solo se agregará el rol de proveedor y el perfil comercial.',
          );
        }
      } else {
        setIdentityLocked(false);
        setIdentityReuseNotice(null);
        setReusedPartySummary(null);
        setDocumentSearchError(
          'No encontramos un tercero con este documento. Completa la identidad para crear uno nuevo.',
        );
      }
    } catch {
      setDocumentSearchError('No fue posible buscar el documento. Intenta nuevamente.');
    } finally {
      setIsSearchingDocument(false);
    }
  }

  function validateIdentityStep(): boolean {
    if (reusedHasProfile) {
      setValidationError(
        'Este tercero ya tiene un perfil de proveedor. Edítalo desde el listado en lugar de crear uno nuevo.',
      );
      return false;
    }

    if (!identityForm.documentNumber.trim()) {
      setValidationError('Completa el número de documento.');
      return false;
    }

    if (!identityForm.displayName.trim()) {
      setValidationError('Completa el nombre del proveedor.');
      return false;
    }

    setValidationError(null);
    return true;
  }

  function handleContinueToCommercial() {
    if (!validateIdentityStep()) {
      return;
    }

    setCreateStep('commercial');
  }

  async function handleSubmit() {
    if (isEditing && supplier) {
      await onUpdate(supplier.partyRefId, buildCommercialPayload(commercialForm));
      return;
    }

    if (createStep === 'identity') {
      handleContinueToCommercial();
      return;
    }

    if (!validateIdentityStep()) {
      setCreateStep('identity');
      return;
    }

    await onCreate(buildCreatePayload(identityForm, commercialForm));
  }

  async function handleSetStatus(status: SupplierProfileStatus) {
    if (!supplier) {
      return;
    }

    await onSetStatus(supplier.partyRefId, status);
  }

  if (!open) {
    return null;
  }

  const title = isEditing ? 'Editar proveedor' : 'Nuevo proveedor';

  return (
    <div className="fixed inset-0 z-[1200] bg-black/45">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        aria-label="Cerrar proveedor"
        onClick={requestClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-labelledby="supplier-form-drawer-title"
        aria-describedby="supplier-form-drawer-description"
        aria-modal="true"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 z-[1201] flex w-full max-w-2xl flex-col border-l border-gray-200 bg-white shadow-2xl outline-none dark:border-dark-border dark:bg-dark-surface-2"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 dark:border-dark-border">
          <div className="min-w-0">
            <p className="portal-eyebrow">Proveedores</p>
            <h2
              id="supplier-form-drawer-title"
              className="mt-1 text-xl font-semibold text-gray-900 dark:text-white"
            >
              {title}
            </h2>
            <p
              id="supplier-form-drawer-description"
              className="mt-2 text-sm text-gray-500 dark:text-gray-400"
            >
              {isEditing
                ? 'Actualiza condiciones comerciales y contacto de compras.'
                : 'Registra la identidad del tercero y su perfil comercial de compras.'}
            </p>
            {isEditing && supplier ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="neutral">{supplier.supplierCode}</Badge>
                <Badge variant="primary">{getSupplierProfileStatusLabel(supplier.status)}</Badge>
              </div>
            ) : null}
          </div>
          <Button type="button" variant="secondary" onClick={requestClose} disabled={isSubmitting}>
            Cerrar
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {error ? (
              <PortalAlert variant="error" title="No fue posible guardar" description={error} />
            ) : null}
            {validationError ? (
              <PortalAlert
                variant="warning"
                title="Revisa el formulario"
                description={validationError}
              />
            ) : null}

            {isEditing ? (
              <>
                <SupplierSummaryCard summary={partySummary} />
                {renderCommercialFields()}
                {renderStatusActions()}
              </>
            ) : (
              <>
                {!isEditing && createStep === 'identity' ? renderIdentityStep() : null}
                {!isEditing && createStep === 'commercial' ? (
                  <>
                    {identityReuseNotice ? (
                      <PortalAlert
                        variant="info"
                        title="Identidad reutilizada"
                        description={identityReuseNotice}
                      />
                    ) : null}
                    {reusedPartySummary ? (
                      <SupplierSummaryCard summary={reusedPartySummary} />
                    ) : null}
                    {renderCommercialFields()}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-4 dark:border-dark-border">
          {!isEditing && createStep === 'commercial' ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setCreateStep('identity')}
            >
              Volver a identidad
            </Button>
          ) : (
            <span />
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={requestClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            {!isEditing && createStep === 'identity' ? (
              <Button type="button" onClick={handleContinueToCommercial} disabled={isSubmitting}>
                Continuar
              </Button>
            ) : (
              <Button type="button" loading={isSubmitting} onClick={() => void handleSubmit()}>
                {isEditing ? 'Guardar cambios' : 'Crear proveedor'}
              </Button>
            )}
          </div>
        </div>
      </aside>

      <PortalDiscardChangesDialog
        open={discardOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </div>
  );

  function renderIdentityStep() {
    const identityDisabled = identityLocked || isSubmitting;

    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Paso 1 · Identidad</p>

        {identityReuseNotice ? (
          <PortalAlert
            variant={reusedHasProfile ? 'warning' : 'info'}
            title="Tercero existente"
            description={identityReuseNotice}
          />
        ) : null}

        {reusedPartySummary ? <SupplierSummaryCard summary={reusedPartySummary} /> : null}

        {documentSearchError ? (
          <PortalAlert variant="warning" title="Búsqueda" description={documentSearchError} />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo de documento"
            value={identityForm.documentType}
            disabled={identityDisabled}
            onChange={(event) =>
              updateIdentity('documentType', event.target.value as DocumentTypeParty)
            }
          >
            {DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Input
            label="Número de documento"
            value={identityForm.documentNumber}
            disabled={identityDisabled}
            onChange={(event) => updateIdentity('documentNumber', event.target.value)}
          />
        </div>

        <Button
          type="button"
          variant="secondary"
          loading={isSearchingDocument}
          disabled={identityDisabled}
          onClick={() => void handleSearchDocument()}
        >
          Buscar documento
        </Button>

        <Select
          label="Tipo de tercero"
          value={identityForm.partyType}
          disabled={identityDisabled}
          onChange={(event) => updateIdentity('partyType', event.target.value as PartyType)}
        >
          {PARTY_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Input
          label="Nombre"
          value={identityForm.displayName}
          disabled={identityDisabled}
          onChange={(event) => updateIdentity('displayName', event.target.value)}
        />

        <Input
          label="Razón social"
          value={identityForm.legalName}
          disabled={identityDisabled}
          onChange={(event) => updateIdentity('legalName', event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Correo de contacto"
            type="email"
            value={identityForm.contactEmail}
            disabled={identityDisabled}
            onChange={(event) => updateIdentity('contactEmail', event.target.value)}
          />
          <Input
            label="Teléfono de contacto"
            value={identityForm.contactPhone}
            disabled={identityDisabled}
            onChange={(event) => updateIdentity('contactPhone', event.target.value)}
          />
        </div>
      </div>
    );
  }

  function renderCommercialFields() {
    return (
      <div className="space-y-4">
        {!isEditing ? (
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Paso 2 · Perfil comercial
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Plazo de pago (días)"
            inputMode="numeric"
            value={commercialForm.paymentTermsDays}
            disabled={isSubmitting}
            onChange={(event) => updateCommercial('paymentTermsDays', event.target.value)}
          />
          <Input
            label="Moneda"
            value={commercialForm.currency}
            maxLength={3}
            disabled={isSubmitting}
            onChange={(event) => updateCommercial('currency', event.target.value.toUpperCase())}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Incoterm"
            value={commercialForm.incoterm}
            disabled={isSubmitting}
            onChange={(event) => updateCommercial('incoterm', event.target.value)}
          />
          <Input
            label="Tiempo de entrega (días)"
            inputMode="numeric"
            value={commercialForm.defaultLeadTimeDays}
            disabled={isSubmitting}
            onChange={(event) => updateCommercial('defaultLeadTimeDays', event.target.value)}
          />
        </div>

        <Input
          label="Contacto de compras"
          value={commercialForm.purchasingContactName}
          disabled={isSubmitting}
          onChange={(event) => updateCommercial('purchasingContactName', event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Correo de compras"
            type="email"
            value={commercialForm.purchasingContactEmail}
            disabled={isSubmitting}
            onChange={(event) => updateCommercial('purchasingContactEmail', event.target.value)}
          />
          <Input
            label="Teléfono de compras"
            value={commercialForm.purchasingContactPhone}
            disabled={isSubmitting}
            onChange={(event) => updateCommercial('purchasingContactPhone', event.target.value)}
          />
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Notas</span>
          <textarea
            className={portalTextareaClassName}
            rows={4}
            value={commercialForm.notes}
            disabled={isSubmitting}
            onChange={(event) => updateCommercial('notes', event.target.value)}
          />
        </label>
      </div>
    );
  }

  function renderStatusActions() {
    if (!supplier) {
      return null;
    }

    return (
      <div className="space-y-3 rounded-2xl border border-gray-100 p-4 dark:border-dark-border">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Estado del proveedor</p>
        <div className="flex flex-wrap gap-2">
          {supplier.status !== SupplierProfileStatus.ACTIVE ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={isSubmitting}
              onClick={() => void handleSetStatus(SupplierProfileStatus.ACTIVE)}
            >
              Activar
            </Button>
          ) : null}
          {supplier.status !== SupplierProfileStatus.INACTIVE ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={isSubmitting}
              onClick={() => void handleSetStatus(SupplierProfileStatus.INACTIVE)}
            >
              Inactivar
            </Button>
          ) : null}
          {supplier.status !== SupplierProfileStatus.BLOCKED ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              loading={isSubmitting}
              onClick={() => void handleSetStatus(SupplierProfileStatus.BLOCKED)}
            >
              Bloquear
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
}
