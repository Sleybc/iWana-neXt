import { UserRole, UserStatus } from '@iwana/shared';
import type { InternalUserExportRow } from '@/lib/api-client';
import { buildUsersExportCsv, buildUsersExportFilename } from './users-export';

const baseUser: InternalUserExportRow = {
  id: 'u-1',
  email: 'persona@empresa.test',
  role: UserRole.SUPPORT,
  status: UserStatus.ACTIVE,
  tenantId: 'tenant-1',
  mfaEnabled: true,
  mfaRequired: false,
  isOperationalResource: true,
  emailVerified: true,
  passwordResetRequired: false,
  lastLoginAt: '2026-11-20T15:30:00.000Z',
  createdAt: '2026-01-01T05:00:00.000Z',
  updatedAt: '2026-01-02T05:00:00.000Z',
  deletedAt: null,
  firstName: 'Ana',
  lastName: 'Pérez',
  phone: '3000000000',
  jobTitle: 'Coordinadora',
  documentType: 'CC',
  documentNumber: '000000001',
  avatarUrl: null,
  isPrincipalAdmin: false,
  companyRoles: ['Coordinación', 'Soporte nivel 2'],
};

function parseLines(csv: string): string[] {
  return csv.replace(/^﻿/, '').trimEnd().split('\r\n');
}

describe('buildUsersExportCsv', () => {
  it('arranca con BOM UTF-8 y encabezados en español', () => {
    const csv = buildUsersExportCsv([]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header] = parseLines(csv);
    expect(header).toContain('"Nombres","Apellidos","Correo","Teléfono"');
    expect(header).toContain('"Roles de empresa"');
    expect(header).toContain('"Número de documento"');
  });

  it('escribe todos los datos con etiquetas legibles', () => {
    const [, row] = parseLines(buildUsersExportCsv([baseUser]));
    expect(row).toBe(
      [
        'Ana',
        'Pérez',
        'persona@empresa.test',
        '3000000000',
        'Coordinadora',
        'Cédula de ciudadanía',
        '000000001',
        'Soporte inicial',
        'Coordinación; Soporte nivel 2',
        'Activo',
        'No',
        'Sí',
        'Sí',
        'No',
        'Sí',
        'No',
        '20/11/2026, 10:30',
        '01/01/2026, 00:00',
        '02/01/2026, 00:00',
        '',
        'u-1',
      ]
        .map((cell) => `"${cell}"`)
        .join(','),
    );
  });

  it('deja vacíos los datos opcionales ausentes', () => {
    const [, row] = parseLines(
      buildUsersExportCsv([
        {
          ...baseUser,
          phone: null,
          documentType: null,
          documentNumber: null,
          lastLoginAt: null,
          isPrincipalAdmin: undefined,
          companyRoles: [],
        },
      ]),
    );
    expect(row).toContain('"persona@empresa.test","","Coordinadora","",""');
  });

  it('neutraliza fórmulas y escapa comillas', () => {
    const [, row] = parseLines(
      buildUsersExportCsv([
        { ...baseUser, firstName: '=HYPERLINK("http://x")', lastName: '+57', jobTitle: '@cmd' },
      ]),
    );
    expect(row).toContain(`"'=HYPERLINK(""http://x"")","'+57"`);
    expect(row).toContain(`"'@cmd"`);
  });

  it('neutraliza fórmulas con espacios delante y valores que empiezan por salto de línea', () => {
    const [, row] = parseLines(
      buildUsersExportCsv([{ ...baseUser, firstName: '  =1+1', lastName: 'x', jobTitle: 'Cargo' }]),
    );
    expect(row).toContain(`"'  =1+1"`);
    expect(buildUsersExportCsv([{ ...baseUser, phone: '\n=1' }])).toContain(`"'\n=1"`);
  });
});

describe('buildUsersExportFilename', () => {
  it('usa la fecha de Bogotá', () => {
    expect(buildUsersExportFilename(new Date('2026-11-28T03:00:00.000Z'))).toBe(
      'usuarios-2026-11-27.csv',
    );
  });
});
