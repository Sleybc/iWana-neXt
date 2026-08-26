import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DailyTimelineHoverDetailsContent,
  DailyTimelineHoverHint,
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

  it('muestra el detalle al pasar el mouse por un boton hijo', async () => {
    const user = userEvent.setup();

    render(
      <DailyTimelineHoverHint
        details={{
          eyebrow: 'Borrador',
          title: 'Instalación fibra',
          timeRange: '09:00 a. m. - 11:00 a. m.',
          referenceLabel: 'Cliente Norte',
        }}
      >
        <span>Cuerpo</span>
        <button type="button">Confirmar agenda</button>
      </DailyTimelineHoverHint>,
    );

    await user.hover(screen.getByRole('button', { name: 'Confirmar agenda' }));

    expect(screen.getByRole('tooltip')).toHaveTextContent('Cliente Norte');
  });
});
