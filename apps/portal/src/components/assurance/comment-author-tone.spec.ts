import { COMMENT_AUTHOR_TONES, buildCommentAuthorTones } from './comment-author-tone';

describe('buildCommentAuthorTones', () => {
  it('da un tono distinto a cada persona, en orden de aparición', () => {
    const tones = buildCommentAuthorTones(['ana', 'luis', 'ana', 'marta']);

    expect(tones.get('ana')).toBe(0);
    expect(tones.get('luis')).toBe(1);
    expect(tones.get('marta')).toBe(2);
  });

  it('la misma persona conserva su tono en todo el hilo', () => {
    const tones = buildCommentAuthorTones(['ana', 'luis', 'ana', 'luis', 'ana']);

    expect(tones.size).toBe(2);
    expect(tones.get('ana')).toBe(0);
  });

  it('con más personas que tonos vuelve a empezar, sin fallar', () => {
    const ids = Array.from({ length: COMMENT_AUTHOR_TONES.length + 2 }, (_, i) => `u${i}`);
    const tones = buildCommentAuthorTones(ids);

    expect(tones.get(`u${COMMENT_AUTHOR_TONES.length}`)).toBe(0);
    expect(tones.get(`u${COMMENT_AUTHOR_TONES.length + 1}`)).toBe(1);
  });

  it('cada tono trae clases para el círculo y para el borde, en claro y oscuro', () => {
    for (const tone of COMMENT_AUTHOR_TONES) {
      expect(tone.mark).toMatch(/bg-.+ text-.+ dark:bg-.+ dark:text-.+/);
      expect(tone.border).toMatch(/border-l-.+ dark:border-l-.+/);
    }
  });
});
