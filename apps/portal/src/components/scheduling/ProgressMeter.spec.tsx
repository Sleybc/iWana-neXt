import { render, screen } from '@testing-library/react';
import { ProgressMeter } from '@iwana/ui';

describe('ProgressMeter', () => {
  describe('label prop', () => {
    it('usa el label personalizado cuando se provee', () => {
      render(<ProgressMeter value={75} label="Avance de requisitos" />);

      expect(screen.getByText('Avance de requisitos')).toBeInTheDocument();
      expect(screen.queryByText('Progreso')).not.toBeInTheDocument();
    });

    it('muestra el label por defecto "Progreso" cuando no se provee', () => {
      render(<ProgressMeter value={50} />);

      expect(screen.getByText('Progreso')).toBeInTheDocument();
    });
  });

  describe('ariaLabel prop', () => {
    it('usa el ariaLabel personalizado en el elemento <progress> cuando se provee', () => {
      render(
        <ProgressMeter
          value={60}
          label="Requisitos de instalación"
          ariaLabel="Avance de requisitos de instalación"
        />,
      );

      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('aria-label', 'Avance de requisitos de instalación');
    });

    it('construye un ariaLabel a partir del label cuando no se provee ariaLabel', () => {
      render(<ProgressMeter value={30} label="Instalación de fibra" />);

      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('aria-label', 'Instalación de fibra: 30%');
    });

    it('usa "Progreso: N%" como fallback cuando no hay label ni ariaLabel', () => {
      render(<ProgressMeter value={42} />);

      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('aria-label', 'Progreso: 42%');
    });
  });

  describe('value clamping', () => {
    it('fija valor a 100 cuando el value excede 100', () => {
      render(<ProgressMeter value={150} label="Sobrecarga" />);

      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('value', '100');
    });

    it('fija valor a 0 cuando el value es negativo', () => {
      render(<ProgressMeter value={-20} label="Error de medición" />);

      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('value', '0');
    });
  });

  describe('dimensions opcionales', () => {
    it('renderiza badges de dimensión cuando dimensions está presente', () => {
      render(
        <ProgressMeter
          value={80}
          label="Instalación"
          dimensions={[
            { label: 'Cableado', value: 100 },
            { label: 'Configuración', value: 50 },
          ]}
        />,
      );

      expect(screen.getByText('Cableado: 100%')).toBeInTheDocument();
      expect(screen.getByText('Configuración: 50%')).toBeInTheDocument();
    });

    it('no renderiza la sección de dimensiones cuando dimensions no se provee', () => {
      render(<ProgressMeter value={90} label="Avance" />);

      // No dimension badges — solo el porcentaje grande de la barra
      expect(screen.queryByText('Cableado: 100%')).not.toBeInTheDocument();
      expect(screen.queryByText('Configuración: 50%')).not.toBeInTheDocument();
      // El porcentaje principal todavía debe estar presente
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
  });
});
