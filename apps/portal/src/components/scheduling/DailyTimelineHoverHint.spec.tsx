import { render, screen } from '@testing-library/react';
import {
  DailyTimelineHoverDetailsContent,
  formatTimelineReferenceLabel,
} from './DailyTimelineHoverHint';

describe('DailyTimelineHoverHint', () => {
  it('oculta referencias vacias o genericas en el detalle', () => {
    expect(formatTimelineReferenceLabel('Sin referencia externa')).toBeNull();
    expect(formatTimelineReferenceLabel('Oportunidad 81392576')).toBe('Oportunidad 81392576');
  });

  it('renderiza detalle estructurado con eyebrow, titulo, hora y referencia', () => {
    render(
      <DailyTimelineHoverDetailsContent
        eyebrow="Programado"
        title="Instalación para Luis Alberto Segura Corredor"
        timeRange="08:00 a. m. - 11:00 a. m."
        referenceLabel="Oportunidad 81392576"
      />,
    );

    expect(screen.getByText('Programado')).toBeInTheDocument();
    expect(screen.getByText('Instalación para Luis Alberto Segura Corredor')).toBeInTheDocument();
    expect(screen.getByText('08:00 a. m. - 11:00 a. m.')).toBeInTheDocument();
    expect(screen.getByText('Oportunidad 81392576')).toBeInTheDocument();
  });
});
