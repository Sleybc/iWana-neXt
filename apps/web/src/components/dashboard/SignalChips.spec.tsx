import { render, screen } from '@testing-library/react';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { SignalChips, type SignalChipModel } from './SignalChips';

const fourChips: SignalChipModel[] = [
  { id: 's1', label: 'Activas', count: 2, accent: 'primary', href: '/tenants?status=ACTIVE' },
  { id: 's2', label: 'En configuración', count: 1, accent: 'warning' },
  { id: 's3', label: 'Requieren atención', count: 0, accent: 'danger' },
  { id: 's4', label: 'Cambios esta semana', count: 3, accent: 'neutral' },
];

const threeChips = fourChips.slice(0, 3);

function gridOf(name: string) {
  return screen.getByRole('region', { name }).querySelector('.grid');
}

describe('SignalChips', () => {
  it('sin props nuevas conserva eyebrow, aria-label y 4 columnas del home', () => {
    render(<SignalChips chips={fourChips} isLoading={false} />);

    expect(
      screen.getByRole('region', { name: PLATFORM_UI_COPY.dashboard.summaryEyebrow }),
    ).toBeInTheDocument();
    expect(screen.getByText(PLATFORM_UI_COPY.dashboard.summaryEyebrow)).toHaveClass(
      'portal-eyebrow',
    );
    expect(gridOf(PLATFORM_UI_COPY.dashboard.summaryEyebrow)).toHaveClass('xl:grid-cols-4');
    expect(gridOf(PLATFORM_UI_COPY.dashboard.summaryEyebrow)).not.toHaveClass('xl:grid-cols-3');
  });

  it('en carga sin skeletonCount pinta 4 skeletons en 4 columnas', () => {
    const { container } = render(<SignalChips chips={[]} isLoading />);

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(4);
    expect(gridOf(PLATFORM_UI_COPY.dashboard.summaryEyebrow)).toHaveClass('xl:grid-cols-4');
  });

  it('con 3 chips usa xl:grid-cols-3', () => {
    render(
      <SignalChips
        chips={threeChips}
        isLoading={false}
        eyebrow="Directorio"
        ariaLabel="Directorio"
      />,
    );

    expect(gridOf('Directorio')).toHaveClass('xl:grid-cols-3');
    expect(gridOf('Directorio')).not.toHaveClass('xl:grid-cols-4');
    expect(screen.getByText('Directorio')).toHaveClass('portal-eyebrow');
  });

  it('en carga con skeletonCount=3 usa 3 skeletons y xl:grid-cols-3', () => {
    const { container } = render(
      <SignalChips
        chips={[]}
        isLoading
        skeletonCount={3}
        eyebrow="Directorio"
        ariaLabel="Directorio"
      />,
    );

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
    expect(gridOf('Directorio')).toHaveClass('xl:grid-cols-3');
  });
});
