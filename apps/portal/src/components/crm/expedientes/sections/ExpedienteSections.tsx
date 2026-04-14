'use client';

import { useState } from 'react';
import { Button, SectionAccordion } from '@iwana/ui';
import { FolderOpen } from 'lucide-react';
import type { CompletenessResult, ExpedienteRecord, PlanCatalogItem } from '@/lib/api-client';
import {
  SECTIONS,
  calculateDocumentSupportCompletion,
  calculateSectionCompletion,
  getSectionCompletionFields,
  getSectionPayloadFields,
  getSectionRenderFields,
  getIdentificationRelevantFields,
  getCandidateTechnologiesFromDraft,
  EMPTY_VALUE,
} from './constants';
import type { DraftValues, SectionId } from './types';
import { IdentificationSection } from './IdentificationSection';
import { ContactSection } from './ContactSection';
import { LocationSection } from './LocationSection';
import { CommercialInterestSection } from './CommercialInterestSection';
import { TechnicalFeasibilitySection } from './TechnicalFeasibilitySection';
import { LegalConsentSection } from './LegalConsentSection';
import { DocumentSupportSection } from './DocumentSupportSection';

interface ExpedienteSectionsProps {
  expediente: ExpedienteRecord;
  completeness: CompletenessResult | null;
  draftValues: DraftValues;
  onDraftChange: (field: string, value: string) => void;
  onSaveSection: (section: SectionId) => Promise<void>;
  onCandidateTechnologyToggle: (technology: string, checked: boolean) => void;
  lockedSections: Set<SectionId>;
  onUnlockIdentification: () => void;
  savingSection: SectionId | null;
  planCatalog: PlanCatalogItem[];
  actionMessage: string | null;
  actionMessageTone: 'success' | 'error' | 'info';
  onDocumentSupportSaved: () => Promise<void>;
}

export function ExpedienteSections({
  expediente,
  completeness,
  draftValues,
  onDraftChange,
  onSaveSection,
  onCandidateTechnologyToggle,
  lockedSections,
  onUnlockIdentification,
  savingSection,
  planCatalog,
  actionMessage,
  actionMessageTone,
  onDocumentSupportSaved,
}: ExpedienteSectionsProps) {
  const [leftAccordionOpenIds, setLeftAccordionOpenIds] = useState<Set<string>>(new Set());

  const effectivePersonType = draftValues.personType || null;

  const sectionCompletionById = SECTIONS.reduce<Record<string, number>>((accumulator, section) => {
    const completionFields = getSectionCompletionFields(
      section.id as SectionId,
      effectivePersonType,
    );
    accumulator[section.id] = calculateSectionCompletion(completionFields, draftValues);
    return accumulator;
  }, {});

  const documentSupportCompletion = calculateDocumentSupportCompletion(
    effectivePersonType,
    expediente.documentSupports,
  );

  const completedSections = [...SECTIONS.map((section) => section.id), 'document_support'].filter(
    (sectionId) =>
      (sectionId === 'document_support'
        ? documentSupportCompletion
        : sectionCompletionById[sectionId] ?? 0) >= 100,
  ).length;

  const totalSections = SECTIONS.length + 1;

  const completedCoreSections = SECTIONS.filter(
    (s) => (sectionCompletionById[s.id] ?? 0) >= 100,
  ).length;

  const renderSectionContent = (sectionId: SectionId) => {
    switch (sectionId) {
      case 'identification':
        return (
          <IdentificationSection
            draftValues={draftValues}
            onChange={onDraftChange}
            saving={savingSection === 'identification'}
            onSave={() => onSaveSection('identification')}
          />
        );
      case 'contact':
        return (
          <ContactSection
            draftValues={draftValues}
            onChange={onDraftChange}
            saving={savingSection === 'contact'}
            onSave={() => onSaveSection('contact')}
          />
        );
      case 'location':
        return (
          <LocationSection
            draftValues={draftValues}
            onChange={onDraftChange}
            saving={savingSection === 'location'}
            onSave={() => onSaveSection('location')}
          />
        );
      case 'commercial_interest':
        return (
          <CommercialInterestSection
            draftValues={draftValues}
            onChange={onDraftChange}
            saving={savingSection === 'commercial_interest'}
            onSave={() => onSaveSection('commercial_interest')}
            planCatalog={planCatalog}
          />
        );
      case 'technical_feasibility':
        return (
          <TechnicalFeasibilitySection
            draftValues={draftValues}
            onChange={onDraftChange}
            onCandidateTechnologyToggle={onCandidateTechnologyToggle}
            saving={savingSection === 'technical_feasibility'}
            onSave={() => onSaveSection('technical_feasibility')}
          />
        );
      case 'legal_consent':
        return (
          <LegalConsentSection
            draftValues={draftValues}
            onChange={onDraftChange}
            saving={savingSection === 'legal_consent'}
            onSave={() => onSaveSection('legal_consent')}
          />
        );
      default:
        return null;
    }
  };

  const buildSectionItem = (sectionId: SectionId) => {
    const section = SECTIONS.find((s) => s.id === sectionId)!;
    const Icon = section.icon;
    const sectionContent = renderSectionContent(sectionId);

    const progressValue = sectionCompletionById[section.id];
    const completionPct = progressValue != null ? progressValue : 0;

    return {
      id: section.id,
      label: section.label,
      description: section.description,
      icon: <Icon className="h-5 w-5" />,
      progress: completionPct,
      children: (
        <>
          {sectionContent}
          {sectionId !== 'identification' || !lockedSections.has('identification') ? (
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                loading={savingSection === sectionId}
                onClick={() => onSaveSection(sectionId)}
                className="rounded-xl bg-iwana-primary text-white px-5 py-2 text-sm font-semibold hover:bg-iwana-primary/90 transition-colors shadow-sm"
              >
                {savingSection === sectionId ? 'Guardando sección...' : 'Guardar cambios'}
              </Button>
            </div>
          ) : null}
        </>
      ),
    };
  };

  const leftAccordionItems = [
    ...['commercial_interest', 'legal_consent'].map((id) => buildSectionItem(id as SectionId)),
    {
      id: 'document_support',
      label: 'Soportes documentales',
      description: 'Evidencias requeridas para validar y cerrar el expediente.',
      icon: <FolderOpen className="h-5 w-5" />,
      progress: documentSupportCompletion,
      children: (
        <DocumentSupportSection
          expedienteId={expediente.id}
          personType={effectivePersonType}
          onSaved={onDocumentSupportSaved}
        />
      ),
    },
  ];

  const renderSectionCard = (sectionId: SectionId) => {
    const section = SECTIONS.find((s) => s.id === sectionId)!;
    const Icon = section.icon;
    const completionPct = sectionCompletionById[section.id] ?? 0;
    const sectionContent = renderSectionContent(sectionId);
    const showSaveButton = true;

    return (
      <div key={sectionId} className="rounded-[20px] border border-gray-100 bg-white shadow-[var(--shadow-iwana-soft)] dark:border-dark-border dark:bg-dark-surface-2">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-dark-border">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iwana-secondary/10 text-iwana-secondary-700 dark:bg-iwana-secondary/20 dark:text-iwana-secondary-300">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-gray-900 dark:text-white">{section.label}</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {section.description}
            </p>
          </div>
          <span className="text-xs font-semibold tabular-nums text-iwana-secondary-700 dark:text-iwana-secondary-400">
            {completionPct}%
          </span>
        </div>
        <div className="px-5 py-5">
          {sectionContent}
          {showSaveButton && (
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                loading={savingSection === sectionId}
                onClick={() => onSaveSection(sectionId)}
                className="rounded-xl bg-iwana-primary text-white px-5 py-2 text-sm font-semibold hover:bg-iwana-primary/90 transition-colors shadow-sm"
              >
                {savingSection === sectionId ? 'Guardando sección...' : 'Guardar cambios'}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {actionMessage && (
        <div
          role="status"
          aria-live="polite"
          className={
            actionMessageTone === 'success'
              ? 'rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-iwana-soft dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
              : actionMessageTone === 'error'
                ? 'rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
                : 'rounded-[20px] border border-iwana-primary/15 bg-iwana-primary/5 px-4 py-3 text-sm text-iwana-primary shadow-iwana-soft dark:border-iwana-primary-300/20 dark:bg-iwana-primary-400/10 dark:text-iwana-primary-200'
          }
        >
          {actionMessage}
        </div>
      )}

      {/* Cabecera de progreso */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-[20px] border border-gray-50 px-6 py-5 shadow-[var(--shadow-iwana-soft)] dark:bg-dark-surface-2 dark:border-dark-border">
        <div>
          <h2 className="text-lg font-bold text-iwana-primary dark:text-white">
            Secciones de la oportunidad
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Completa cada bloque según avance el caso, incluyendo soportes documentales.
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Progreso
          </span>
          <p className="text-lg font-bold text-iwana-secondary-700 dark:text-iwana-secondary">
            {completedSections} de {totalSections} completadas
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Núcleo: {completedCoreSections} de {SECTIONS.length} + documental
          </p>
        </div>
      </div>

      {/* Grid 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna izquierda: Identificación + Contacto + acordeón comercial/legal */}
        <div className="space-y-4">
          {renderSectionCard('identification')}
          {renderSectionCard('contact')}
          <SectionAccordion
            variant="card"
            items={leftAccordionItems}
            openIds={leftAccordionOpenIds}
            onOpenIdsChange={(ids) => setLeftAccordionOpenIds(new Set(ids))}
          />
        </div>

        {/* Columna derecha: Dirección + Viabilidad técnica como tarjetas */}
        <div className="space-y-4">
          {renderSectionCard('location')}
          {renderSectionCard('technical_feasibility')}
        </div>
      </div>
    </div>
  );
}
