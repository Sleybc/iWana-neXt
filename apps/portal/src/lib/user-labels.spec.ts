import { DocumentType, UserRole } from '@iwana/shared';
import {
  getPortalDocumentTypeLabel,
  PORTAL_DOCUMENT_TYPE_LABELS,
  resolveUserRoleFromCsv,
} from './user-labels';

describe('getPortalDocumentTypeLabel', () => {
  it('devuelve etiquetas humanas para cada DocumentType (sin enum crudo)', () => {
    expect(getPortalDocumentTypeLabel(DocumentType.CC)).toBe('Cédula de ciudadanía');
    expect(getPortalDocumentTypeLabel(DocumentType.CE)).toBe('Cédula de extranjería');
    expect(getPortalDocumentTypeLabel(DocumentType.PASAPORTE)).toBe('Pasaporte');
    expect(getPortalDocumentTypeLabel(DocumentType.PEP)).toBe('PEP');
    expect(getPortalDocumentTypeLabel(DocumentType.PTP)).toBe('PTP');
    expect(getPortalDocumentTypeLabel(DocumentType.NIT_PERSONA)).toBe('NIT persona');
  });

  it('no expone NIT_PERSONA como texto visible del mapa', () => {
    expect(PORTAL_DOCUMENT_TYPE_LABELS[DocumentType.NIT_PERSONA]).not.toBe('NIT_PERSONA');
    expect(getPortalDocumentTypeLabel(DocumentType.NIT_PERSONA)).not.toMatch(/NIT_PERSONA/);
  });
});

describe('resolveUserRoleFromCsv', () => {
  it('acepta enum y etiqueta amigable', () => {
    expect(resolveUserRoleFromCsv('ADMIN')).toBe(UserRole.ADMIN);
    expect(resolveUserRoleFromCsv('Administrador')).toBe(UserRole.ADMIN);
    expect(resolveUserRoleFromCsv('Monitoreo operativo')).toBe(UserRole.NOC);
    expect(resolveUserRoleFromCsv('admin')).toBe(UserRole.ADMIN);
  });

  it('devuelve null para valores desconocidos o vacíos', () => {
    expect(resolveUserRoleFromCsv('')).toBeNull();
    expect(resolveUserRoleFromCsv('Rol inventado')).toBeNull();
  });
});
