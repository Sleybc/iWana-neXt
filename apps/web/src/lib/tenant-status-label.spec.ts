import { PLATFORM_UI_COPY } from './platform-ui-copy';
import { labelForTenantStatus, variantForTenantStatus } from './tenant-status-label';

describe('labelForTenantStatus', () => {
  it('lee el plural desde PLATFORM_UI_COPY.dashboard.status*', () => {
    expect(labelForTenantStatus('ACTIVE', { form: 'plural' })).toBe(
      PLATFORM_UI_COPY.dashboard.statusActive,
    );
    expect(labelForTenantStatus('PROVISIONING', { form: 'plural' })).toBe(
      PLATFORM_UI_COPY.dashboard.statusProvisioning,
    );
    expect(labelForTenantStatus('PROVISIONING_FAILED', { form: 'plural' })).toBe(
      PLATFORM_UI_COPY.dashboard.statusFailed,
    );
    expect(labelForTenantStatus('SUSPENDED', { form: 'plural' })).toBe(
      PLATFORM_UI_COPY.dashboard.statusSuspended,
    );
    expect(labelForTenantStatus('INACTIVE', { form: 'plural' })).toBe(
      PLATFORM_UI_COPY.dashboard.statusInactive,
    );
    expect(labelForTenantStatus('MARKED_FOR_DELETION', { form: 'plural' })).toBe(
      PLATFORM_UI_COPY.dashboard.statusMarkedForDeletion,
    );
  });

  it('usa singular femenino en el badge de fila', () => {
    expect(labelForTenantStatus('ACTIVE', { form: 'singular' })).toBe('Activa');
    expect(labelForTenantStatus('PROVISIONING', { form: 'singular' })).toBe('En configuración');
    expect(labelForTenantStatus('PROVISIONING_FAILED', { form: 'singular' })).toBe('Con error');
    expect(labelForTenantStatus('SUSPENDED', { form: 'singular' })).toBe('Suspendida');
    expect(labelForTenantStatus('INACTIVE', { form: 'singular' })).toBe('Inactiva');
    expect(labelForTenantStatus('MARKED_FOR_DELETION', { form: 'singular' })).toBe(
      'En eliminación',
    );
  });

  it('no expone copy legado de estado', () => {
    const labels = [
      labelForTenantStatus('ACTIVE', { form: 'singular' }),
      labelForTenantStatus('ACTIVE', { form: 'plural' }),
      labelForTenantStatus('PROVISIONING', { form: 'singular' }),
      labelForTenantStatus('PROVISIONING_FAILED', { form: 'singular' }),
    ];

    expect(labels.join(' ')).not.toMatch(/\bActivo\b/);
    expect(labels.join(' ')).not.toContain('Configurando');
    expect(labels.join(' ')).not.toContain('Configuración fallida');
    expect(labels.join(' ')).not.toContain('En puesta en marcha');
  });
});

describe('variantForTenantStatus', () => {
  it('mapea severidad del contrato DS-E-BADGE', () => {
    expect(variantForTenantStatus('ACTIVE')).toBe('success');
    expect(variantForTenantStatus('PROVISIONING')).toBe('warning');
    expect(variantForTenantStatus('PROVISIONING_FAILED')).toBe('error');
    expect(variantForTenantStatus('SUSPENDED')).toBe('warning');
    expect(variantForTenantStatus('INACTIVE')).toBe('neutral');
    expect(variantForTenantStatus('MARKED_FOR_DELETION')).toBe('error');
  });
});
