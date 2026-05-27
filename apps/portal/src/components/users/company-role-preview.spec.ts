import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { buildCompanyRolePreview } from './company-role-preview';

describe('buildCompanyRolePreview', () => {
  it('should combine baseline permissions and selected company roles for the chosen category', () => {
    const result = buildCompanyRolePreview({
      baseRole: UserRole.TECHNICIAN,
      selectedProfileIds: ['template-tech'],
      profiles: [
        {
          id: 'template-tech',
          name: 'Técnico de campo',
          description: 'Plantilla base de campo',
          baseRoleConstraint: UserRole.TECHNICIAN,
          scopeSiteId: null,
          isSystem: true,
          isActive: true,
          permissions: [
            AccessPermissionKey.WFM_SCHEDULE_READ,
            AccessPermissionKey.WFM_WORK_ORDERS_EXECUTE,
          ],
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
        },
        {
          id: 'profile-noc',
          name: 'Monitoreo operativo',
          description: 'No compatible con tecnico',
          baseRoleConstraint: UserRole.NOC,
          scopeSiteId: null,
          isSystem: true,
          isActive: true,
          permissions: [AccessPermissionKey.SETTINGS_READ],
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
        },
      ],
      compatibilityMatrix: {
        [UserRole.ADMIN]: [],
        [UserRole.NOC]: [],
        [UserRole.SUPPORT]: [],
        [UserRole.SALES]: [],
        [UserRole.TECHNICIAN]: [AccessPermissionKey.SETTINGS_READ],
        [UserRole.ACCOUNTANT]: [],
        [UserRole.HR]: [],
        [UserRole.SUBSCRIBER]: [],
        [UserRole.CONTRACTOR]: [],
        [UserRole.PARTNER]: [],
        [UserRole.AUDITOR]: [],
        [UserRole.INVESTOR]: [],
        [UserRole.SYSTEM_ADMIN]: [],
        [UserRole.IWANA_SUPPORT]: [],
      },
    });

    expect(result.selectedProfiles).toHaveLength(1);
    expect(result.selectedProfiles[0]?.id).toBe('template-tech');
    expect(result.permissionKeys).toEqual([
      AccessPermissionKey.SETTINGS_READ,
      AccessPermissionKey.WFM_SCHEDULE_READ,
      AccessPermissionKey.WFM_WORK_ORDERS_EXECUTE,
    ]);
  });
});
