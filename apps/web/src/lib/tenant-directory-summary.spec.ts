import { describeTenantDirectorySummary } from './tenant-directory-summary';

const emptyCounts = {
  active: 0,
  provisioning: 0,
  failed: 0,
  suspended: 0,
  inactive: 0,
  markedForDeletion: 0,
};

describe('describeTenantDirectorySummary', () => {
  it('describe un directorio en calma', () => {
    expect(describeTenantDirectorySummary({ ...emptyCounts, active: 8 }, 8)).toBe(
      '8 empresas operan con normalidad.',
    );
  });

  it('une configuración y revisión', () => {
    expect(
      describeTenantDirectorySummary(
        {
          ...emptyCounts,
          active: 2,
          provisioning: 1,
          failed: 1,
          suspended: 1,
          markedForDeletion: 1,
        },
        6,
      ),
    ).toBe('2 empresas operan con normalidad. 1 sigue en configuración y 3 requieren revisión.');
  });

  it('usa el empty cuando no hay empresas', () => {
    expect(describeTenantDirectorySummary(emptyCounts, 0)).toBe('Aún no hay empresas registradas.');
  });
});
