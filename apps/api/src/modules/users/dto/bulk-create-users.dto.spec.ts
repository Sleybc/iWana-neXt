/**
 * Ola E de MOD04 — esquema Zod del alta masiva.
 *
 * La ruta bulk valida por Zod, no por el `ValidationPipe` de class-validator del
 * resto del CRUD (decision H-10). Es un camino de validacion distinto, asi que
 * la frontera de roles (H-01 / ADR-061) tiene que verificarse aqui por separado:
 * que el DTO sincrono la respete no dice nada sobre este.
 *
 * SEGURIDAD: sin PII real.
 */

import { DocumentType, PlatformRole, UserRole } from '@iwana/shared';
import { BulkCreateUsersRequestSchema } from './bulk-create-users.dto';

function loteCon(users: unknown[]): unknown {
  return { users };
}

const ITEM_VALIDO = {
  email: 'tecnico.uno@empresa-demo.test',
  role: UserRole.TECHNICIAN,
};

describe('BulkCreateUsersRequestSchema', () => {
  it('acepta un lote minimo valido', () => {
    const parsed = BulkCreateUsersRequestSchema.safeParse(loteCon([ITEM_VALIDO]));

    expect(parsed.success).toBe(true);
  });

  it('acepta los campos opcionales del alta', () => {
    const parsed = BulkCreateUsersRequestSchema.safeParse(
      loteCon([
        {
          ...ITEM_VALIDO,
          firstName: 'Nombre',
          lastName: 'Apellido',
          phone: '+573001234567',
          jobTitle: 'Tecnico de campo',
          documentType: DocumentType.CC,
          documentNumber: '00000000',
          isOperationalResource: true,
        },
      ]),
    );

    expect(parsed.success).toBe(true);
  });

  describe('frontera de roles (H-01 / ADR-061)', () => {
    it.each([PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT])(
      'INVARIANTE: el rol de plataforma %s no puede colarse por la ruta bulk',
      (role) => {
        const parsed = BulkCreateUsersRequestSchema.safeParse(loteCon([{ ...ITEM_VALIDO, role }]));

        expect(parsed.success).toBe(false);
      },
    );

    it('INVARIANTE: basta una fila con rol de plataforma para rechazar el lote entero', () => {
      const parsed = BulkCreateUsersRequestSchema.safeParse(
        loteCon([
          ITEM_VALIDO,
          { email: 'infiltrado@empresa-demo.test', role: PlatformRole.SYSTEM_ADMIN },
          { email: 'tecnico.tres@empresa-demo.test', role: UserRole.TECHNICIAN },
        ]),
      );

      expect(parsed.success).toBe(false);
    });

    it('un rol inexistente tambien se rechaza', () => {
      const parsed = BulkCreateUsersRequestSchema.safeParse(
        loteCon([{ ...ITEM_VALIDO, role: 'ROL_QUE_NO_EXISTE' }]),
      );

      expect(parsed.success).toBe(false);
    });

    it.each([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.NOC])(
      'el rol de tenant %s si es asignable',
      (role) => {
        const parsed = BulkCreateUsersRequestSchema.safeParse(loteCon([{ ...ITEM_VALIDO, role }]));

        expect(parsed.success).toBe(true);
      },
    );
  });

  describe('limites del lote', () => {
    it('INVARIANTE: un lote vacio se rechaza', () => {
      expect(BulkCreateUsersRequestSchema.safeParse(loteCon([])).success).toBe(false);
    });

    it('acepta exactamente 100 filas', () => {
      const lote = Array.from({ length: 100 }, (_, i) => ({
        email: `tecnico.${i}@empresa-demo.test`,
        role: UserRole.TECHNICIAN,
      }));

      expect(BulkCreateUsersRequestSchema.safeParse(loteCon(lote)).success).toBe(true);
    });

    it('INVARIANTE: 101 filas se rechazan (tope de 100 por lote)', () => {
      const lote = Array.from({ length: 101 }, (_, i) => ({
        email: `tecnico.${i}@empresa-demo.test`,
        role: UserRole.TECHNICIAN,
      }));

      expect(BulkCreateUsersRequestSchema.safeParse(loteCon(lote)).success).toBe(false);
    });
  });

  describe('validacion de campos', () => {
    it('rechaza un email con formato invalido', () => {
      const parsed = BulkCreateUsersRequestSchema.safeParse(
        loteCon([{ ...ITEM_VALIDO, email: 'no-es-un-email' }]),
      );

      expect(parsed.success).toBe(false);
    });

    it('rechaza un telefono fuera del formato E.164', () => {
      const parsed = BulkCreateUsersRequestSchema.safeParse(
        loteCon([{ ...ITEM_VALIDO, phone: '3001234567' }]),
      );

      expect(parsed.success).toBe(false);
    });

    it('rechaza el payload sin la clave users', () => {
      expect(BulkCreateUsersRequestSchema.safeParse({}).success).toBe(false);
    });
  });
});
