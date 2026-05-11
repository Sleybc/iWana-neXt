import type { ExpedienteRecord } from '@/lib/api-client';
import { buildDraftValues, canonicalizeExpedientePersonType } from './constants';

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
});
