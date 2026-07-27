import { render, screen } from '@testing-library/react';
import type { CompletenessResult, ExpedienteRecord } from '@/lib/api-client';
import { ExpedienteSections } from './ExpedienteSections';

jest.mock('./IdentificationSection', () => ({
  IdentificationSection: () => <div>Mock identificación</div>,
}));

jest.mock('./ContactSection', () => ({
  ContactSection: () => <div>Mock contacto</div>,
}));

jest.mock('./LocationSection', () => ({
  LocationSection: () => <div>Mock ubicación</div>,
}));

jest.mock('./CommercialInterestSection', () => ({
  CommercialInterestSection: () => <div>Mock interés comercial</div>,
}));

jest.mock('./TechnicalFeasibilitySection', () => ({
  TechnicalFeasibilitySection: () => <div>Mock viabilidad técnica</div>,
}));

jest.mock('./LegalConsentSection', () => ({
  LegalConsentSection: () => <div>Mock cumplimiento legal</div>,
}));

jest.mock('./DocumentSupportSection', () => ({
  DocumentSupportSection: () => <div>Mock soportes documentales</div>,
}));

describe('ExpedienteSections', () => {
  const expediente = {
    id: 'expediente-1',
    documentSupports: {},
  } as unknown as ExpedienteRecord;

  const completeness: CompletenessResult = {
    commercial: 50,
    legal: 100,
    technical: 100,
    operational: 30,
    overall: 60,
    sectionCompleteness: [
      {
        key: 'identification',
        label: 'Identificación',
        percentage: 0,
        completedFields: 0,
        totalFields: 4,
        missingFields: [],
      },
      {
        key: 'contact',
        label: 'Contacto',
        percentage: 60,
        completedFields: 3,
        totalFields: 5,
        missingFields: [],
      },
      {
        key: 'address',
        label: 'Dirección',
        percentage: 100,
        completedFields: 5,
        totalFields: 5,
        missingFields: [],
      },
      {
        key: 'customerInterest',
        label: 'Interés del cliente',
        percentage: 50,
        completedFields: 2,
        totalFields: 4,
        missingFields: [],
      },
      {
        key: 'technicalFeasibility',
        label: 'Viabilidad técnica',
        percentage: 100,
        completedFields: 5,
        totalFields: 5,
        missingFields: [],
      },
      {
        key: 'legalCompliance',
        label: 'Cumplimiento legal',
        percentage: 100,
        completedFields: 3,
        totalFields: 3,
        missingFields: [],
      },
      {
        key: 'documentSupport',
        label: 'Soportes documentales',
        percentage: 0,
        completedFields: 0,
        totalFields: 2,
        missingFields: [],
      },
    ],
  };

  it('should mostrar prioridad visual por sección según el avance', () => {
    render(
      <ExpedienteSections
        expediente={expediente}
        completeness={completeness}
        draftValues={{}}
        onDraftChange={jest.fn()}
        onSaveSection={jest.fn(async () => undefined)}
        onCandidateTechnologyToggle={jest.fn()}
        lockedSections={new Set()}
        onUnlockIdentification={jest.fn()}
        savingSection={null}
        actionMessage={null}
        actionMessageTone="info"
        onDocumentSupportSaved={jest.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText('Crítica')).toBeInTheDocument();
    expect(screen.getByText('Atención')).toBeInTheDocument();
    expect(screen.getAllByText('Completa').length).toBeGreaterThan(0);
  });
});
