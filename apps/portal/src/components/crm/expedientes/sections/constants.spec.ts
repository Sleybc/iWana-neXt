import type { ExpedienteRecord } from '@/lib/api-client';
import {
  applyIdentificationDerivedDefaults,
  buildDraftValues,
  getSectionCompletionFields,
  canonicalizeExpedientePersonType,
} from './constants';

describe('sections constants', () => {
  it('canonicaliza aliases legacy de personType a valores PERSONA_*', () => {
    expect(canonicalizeExpedientePersonType('NATURAL')).toBe('PERSONA_NATURAL');
    expect(canonicalizeExpedientePersonType('JURIDICA')).toBe('PERSONA_JURIDICA');
    expect(canonicalizeExpedientePersonType('persona juridica')).toBe('PERSONA_JURIDICA');
    expect(canonicalizeExpedientePersonType('')).toBe('');
  });

  it('normaliza personType al construir draft values del expediente', () => {
    const draft = buildDraftValues({ personType: 'NATURAL' } as ExpedienteRecord);

    expect(draft.personType).toBe('PERSONA_NATURAL');
  });

  it('deriva nombres y apellidos desde fullName cuando identificación está vacía', () => {
    const draft = buildDraftValues({
      fullName: 'Ana Maria Perez',
      personType: '',
    } as ExpedienteRecord);

    expect(draft.firstName).toBe('Ana Maria');
    expect(draft.lastName).toBe('Perez');
  });

  it('separa dos palabras como un nombre y un apellido', () => {
    const draft = buildDraftValues({
      fullName: 'Ana Perez',
      personType: 'PERSONA_NATURAL',
    } as ExpedienteRecord);

    expect(draft.firstName).toBe('Ana');
    expect(draft.lastName).toBe('Perez');
  });

  it('para tres palabras puede resolver un nombre y dos apellidos', () => {
    const draft = buildDraftValues({
      fullName: 'Juan Perez Gomez',
      personType: 'PERSONA_NATURAL',
    } as ExpedienteRecord);

    expect(draft.firstName).toBe('Juan');
    expect(draft.lastName).toBe('Perez Gomez');
  });

  it('separa cuatro palabras como dos nombres y dos apellidos', () => {
    const draft = buildDraftValues({
      fullName: 'Juan David Perez Gomez',
      personType: 'PERSONA_NATURAL',
    } as ExpedienteRecord);

    expect(draft.firstName).toBe('Juan David');
    expect(draft.lastName).toBe('Perez Gomez');
  });

  it('deriva razón social desde fullName para persona jurídica sin companyName persistido', () => {
    const draft = buildDraftValues({
      fullName: 'Empresa Demo SAS',
      personType: 'PERSONA_JURIDICA',
    } as ExpedienteRecord);

    expect(draft.companyName).toBe('Empresa Demo SAS');
  });

  it('no sobreescribe valores de identificación ya persistidos', () => {
    const draft = buildDraftValues({
      fullName: 'Empresa Demo SAS',
      personType: 'PERSONA_JURIDICA',
      companyName: 'Comercial Demo SAS',
    } as ExpedienteRecord);

    expect(draft.companyName).toBe('Comercial Demo SAS');
  });

  it('reutiliza la derivación cuando el usuario cambia el tipo de persona en el draft', () => {
    const naturalDraft = applyIdentificationDerivedDefaults({
      fullName: 'Carlos Andres Diaz',
      personType: 'PERSONA_NATURAL',
      firstName: '',
      lastName: '',
      companyName: '',
    });
    const legalDraft = applyIdentificationDerivedDefaults({
      fullName: 'Empresa Demo SAS',
      personType: 'PERSONA_JURIDICA',
      firstName: '',
      lastName: '',
      companyName: '',
    });

    expect(naturalDraft.firstName).toBe('Carlos Andres');
    expect(naturalDraft.lastName).toBe('Diaz');
    expect(legalDraft.companyName).toBe('Empresa Demo SAS');
  });

  it('no cuenta coordenadas dentro de la completitud de Dirección', () => {
    expect(getSectionCompletionFields('location', null)).toEqual([
      'department',
      'municipality',
      'address',
      'postalCode',
      'stratum',
      'neighborhood',
    ]);
  });

  it('sí exige coordenadas dentro de la completitud de Viabilidad técnica', () => {
    expect(getSectionCompletionFields('technical_feasibility', null)).toEqual([
      'feasibility',
      'candidateTechnologies',
      'evaluationSource',
      'technicalConfidence',
      'latitude',
      'longitude',
    ]);
  });
});
