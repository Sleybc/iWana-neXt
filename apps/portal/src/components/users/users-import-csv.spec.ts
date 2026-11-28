import { DocumentType, UserRole, UserStatus } from '@iwana/shared';
import type { InternalUserExportRow } from '@/lib/api-client';
import { resolveDocumentTypeFromCsv } from '@/lib/user-labels';
import { buildUsersExportCsv } from './users-export';
import { parseUsersImportCsv } from './users-import-csv';

const exported: InternalUserExportRow = {
  id: 'u-1',
  email: 'persona@empresa.test',
  role: UserRole.TECHNICIAN,
  status: UserStatus.ACTIVE,
  tenantId: 'tenant-1',
  mfaEnabled: false,
  mfaRequired: false,
  isOperationalResource: true,
  emailVerified: false,
  passwordResetRequired: true,
  lastLoginAt: null,
  createdAt: '2026-01-01T05:00:00.000Z',
  updatedAt: '2026-01-02T05:00:00.000Z',
  deletedAt: null,
  firstName: 'Ana María',
  lastName: 'Pérez, Ruiz',
  phone: '+573001234567',
  jobTitle: 'Técnica',
  documentType: DocumentType.CC,
  documentNumber: '000000001',
  avatarUrl: null,
  isPrincipalAdmin: false,
  companyRoles: ['Técnico'],
};

describe('parseUsersImportCsv', () => {
  it('lee el archivo de «Exportar» tal cual: BOM, encabezados en español y teléfono protegido', () => {
    const csv = buildUsersExportCsv([exported]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`"'+573001234567"`);

    const result = parseUsersImportCsv(csv, 100);

    expect(result).toEqual({
      ok: true,
      rows: [
        {
          rowIndex: 2,
          email: 'persona@empresa.test',
          role: 'Técnico de campo',
          firstName: 'Ana María',
          lastName: 'Pérez, Ruiz',
          phone: '+573001234567',
          jobTitle: 'Técnica',
          documentType: 'Cédula de ciudadanía',
          documentNumber: '000000001',
        },
      ],
    });
  });

  it('sigue leyendo la plantilla con claves técnicas, aunque Excel le agregue BOM', () => {
    const csv =
      '﻿email,role,firstName,lastName,phone,jobTitle,documentType,documentNumber\n' +
      'a@b.test,Administrador,Ana,Pérez,+573001234567,Analista,CC,123\n';

    const result = parseUsersImportCsv(csv, 100);

    expect(result.ok && result.rows[0]).toMatchObject({
      email: 'a@b.test',
      role: 'Administrador',
      firstName: 'Ana',
      documentType: 'CC',
    });
  });

  it('reconoce los encabezados sin tildes ni mayúsculas exactas', () => {
    const csv = 'CORREO,rol,Numero de documento\na@b.test,Ventas,9\n';

    const result = parseUsersImportCsv(csv, 100);

    expect(result.ok && result.rows[0]).toMatchObject({ email: 'a@b.test', documentNumber: '9' });
  });

  it('solo quita el apóstrofo que pone la exportación delante de una fórmula', () => {
    const csv = "email,role,lastName\na@b.test,Ventas,'Ovalle\n";

    const result = parseUsersImportCsv(csv, 100);

    expect(result.ok && result.rows[0]?.lastName).toBe("'Ovalle");
  });

  it('sin columnas de correo y rol nombra las dos variantes', () => {
    const result = parseUsersImportCsv('Nombres,Apellidos\nAna,Pérez\n', 100);

    expect(result).toEqual({
      ok: false,
      error:
        'El archivo debe tener al menos las columnas "email" y "role" de la plantilla, o "Correo" y "Rol" del archivo exportado.',
    });
  });

  it('respeta el tope de filas', () => {
    const csv = 'email,role\na@b.test,Ventas\nc@d.test,Ventas\n';

    const result = parseUsersImportCsv(csv, 1);

    expect(result.ok).toBe(false);
  });
});

describe('resolveDocumentTypeFromCsv', () => {
  it.each([
    ['CC', DocumentType.CC],
    ['cc', DocumentType.CC],
    ['Cédula de ciudadanía', DocumentType.CC],
    ['cédula de extranjería', DocumentType.CE],
    ['Pasaporte', DocumentType.PASAPORTE],
  ])('%s → %s', (value, expected) => {
    expect(resolveDocumentTypeFromCsv(value)).toBe(expected);
  });

  it('rechaza un tipo desconocido', () => {
    expect(resolveDocumentTypeFromCsv('Licencia')).toBeNull();
  });
});
