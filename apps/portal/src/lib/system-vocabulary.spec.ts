// apps/portal/src/lib/system-vocabulary.spec.ts
import { UserRole } from '@iwana/shared';
import { getAccessProfileDisplayName, getSystemTemplateProfileName } from './system-vocabulary';

describe('system-vocabulary', () => {
  describe('CA-ACV2-02: SYSTEM_TEMPLATE_PROFILE_NAMES extiende a 9 tipos de usuario', () => {
    it('resuelve los nombres humanos de las 3 categorías nuevas', () => {
      expect(getSystemTemplateProfileName(UserRole.SALES)).toBe('Ventas');
      expect(getSystemTemplateProfileName(UserRole.ACCOUNTANT)).toBe('Contabilidad');
      expect(getSystemTemplateProfileName(UserRole.HR)).toBe('Talento humano');
    });

    it('conserva los nombres de las 6 categorías existentes', () => {
      expect(getSystemTemplateProfileName(UserRole.ADMIN)).toBe('Administrador general');
      expect(getSystemTemplateProfileName(UserRole.NOC)).toBe('Monitoreo operativo');
      expect(getSystemTemplateProfileName(UserRole.SUPPORT)).toBe('Soporte inicial');
      expect(getSystemTemplateProfileName(UserRole.TECHNICIAN)).toBe('Técnico de campo');
      expect(getSystemTemplateProfileName(UserRole.CONTRACTOR)).toBe('Contratista');
      expect(getSystemTemplateProfileName(UserRole.AUDITOR)).toBe('Auditor');
    });

    it('un perfil system sin entrada en el mapa cae a profile.name', () => {
      expect(
        getAccessProfileDisplayName({
          name: 'Nombre en base de datos',
          isSystem: true,
          baseRoleConstraint: UserRole.INVESTOR,
        }),
      ).toBe('Nombre en base de datos');

      expect(
        getAccessProfileDisplayName({
          name: 'Otro nombre',
          isSystem: true,
          baseRoleConstraint: null,
        }),
      ).toBe('Otro nombre');
    });

    it('un perfil personalizado siempre muestra su nombre propio', () => {
      expect(
        getAccessProfileDisplayName({
          name: 'Perfil de bodega',
          isSystem: false,
          baseRoleConstraint: UserRole.NOC,
        }),
      ).toBe('Perfil de bodega');
    });
  });
});
