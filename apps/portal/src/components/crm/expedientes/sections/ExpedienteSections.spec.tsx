import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CompletenessResult, ExpedienteRecord } from '@/lib/api-client';
import { ExpedienteSections } from './ExpedienteSections';

const mockCommercialInterestMount = jest.fn();

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
  CommercialInterestSection: () => {
    const React = require('react') as typeof import('react');
    React.useEffect(() => {
      mockCommercialInterestMount();
    }, []);
    return <div>Mock interés comercial</div>;
  },
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

  beforeEach(() => {
    mockCommercialInterestMount.mockClear();
  });

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

    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('En progreso')).toBeInTheDocument();
    expect(screen.getAllByText('Completa').length).toBeGreaterThan(0);
  });

  it('usa tokens iWana en el shell y en el guardado de las secciones', () => {
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

    const sectionShell = screen.getByText('Mock identificación').closest('div.rounded-2xl');
    const saveButton = screen.getAllByRole('button', { name: 'Guardar cambios' })[0];

    expect(sectionShell).not.toBeNull();
    expect(sectionShell).toHaveClass('border-gray-200');
    expect(sectionShell).toHaveClass('shadow-iwana-soft');
    expect(saveButton).toHaveClass('bg-iwana-primary');
    expect(saveButton).not.toHaveClass('rounded-xl');
  });

  it('conserva montada la sección de interés al cerrarla y reabrirla', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Interés del cliente 50%/ }));
    await waitFor(() => expect(mockCommercialInterestMount).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Contraer sección Interés del cliente' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Interés del cliente 50%/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Interés del cliente 50%/ }));

    expect(mockCommercialInterestMount).toHaveBeenCalledTimes(1);
  });
});
