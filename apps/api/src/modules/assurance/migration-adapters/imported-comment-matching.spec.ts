import { matchImportedComments } from './imported-comment-matching';

/**
 * Emparejamiento determinista de comentarios importados con su actividad de UISP («Actualizar
 * autores», spec «usuarios» §2.7). `ticket_comments` no guarda el id de UISP: se empareja por
 * cuerpo e instante (o solo cuerpo cuando UISP no trae fecha).
 */
const IMPORTER = 'importer';
const ANA = 'ana';
const LUIS = 'luis';
const T1 = '2023-03-01T00:00:00.000Z';
const T2 = '2023-03-02T00:00:00.000Z';

describe('matchImportedComments', () => {
  it('empareja por cuerpo e instante, sin depender del orden de la consulta', () => {
    const stored = [
      { id: 'c2', body: 'Dos', createdAt: new Date(T2), authorUserId: IMPORTER },
      { id: 'c1', body: 'Uno', createdAt: new Date(T1), authorUserId: IMPORTER },
    ];
    const expected = [
      { body: 'Uno', createdAt: T1, authorUserId: ANA },
      { body: 'Dos', createdAt: T2, authorUserId: LUIS },
    ];
    expect(matchImportedComments(stored, expected, [IMPORTER])).toEqual([
      { id: 'c1', target: ANA, current: IMPORTER },
      { id: 'c2', target: LUIS, current: IMPORTER },
    ]);
  });

  it('sin fecha en UISP empareja solo por cuerpo, después de los que sí la traen', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const stored = [
      { id: 'a', body: 'Igual', createdAt: now, authorUserId: IMPORTER },
      { id: 'b', body: 'Igual', createdAt: new Date(T1), authorUserId: IMPORTER },
    ];
    const expected = [
      { body: 'Igual', createdAt: null, authorUserId: LUIS },
      { body: 'Igual', createdAt: T1, authorUserId: ANA },
    ];
    // En el orden de la actividad de UISP.
    expect(matchImportedComments(stored, expected, [IMPORTER])).toEqual([
      { id: 'a', target: LUIS, current: IMPORTER },
      { id: 'b', target: ANA, current: IMPORTER },
    ]);
  });

  it('un comentario sin equivalencia igual ocupa su fila y no se devuelve', () => {
    const stored = [
      { id: 'a', body: 'X', createdAt: new Date(T1), authorUserId: IMPORTER },
      { id: 'b', body: 'X', createdAt: new Date(T1), authorUserId: IMPORTER },
    ];
    const expected = [
      { body: 'X', createdAt: T1, authorUserId: null },
      { body: 'X', createdAt: T1, authorUserId: ANA },
    ];
    expect(matchImportedComments(stored, expected, [IMPORTER])).toEqual([
      { id: 'b', target: ANA, current: IMPORTER },
    ]);
  });

  it('idempotente con empates: prefiere la fila que ya tiene el autor esperado', () => {
    const stored = [
      { id: 'a', body: 'X', createdAt: new Date(T1), authorUserId: LUIS },
      { id: 'b', body: 'X', createdAt: new Date(T1), authorUserId: ANA },
    ];
    const expected = [
      { body: 'X', createdAt: T1, authorUserId: ANA },
      { body: 'X', createdAt: T1, authorUserId: LUIS },
    ];
    expect(matchImportedComments(stored, expected, [IMPORTER])).toEqual([
      { id: 'b', target: ANA, current: ANA },
      { id: 'a', target: LUIS, current: LUIS },
    ]);
  });

  it('un comentario sin pareja (cuerpo borrado o cambiado) no se toca; los ajenos tampoco', () => {
    const stored = [
      { id: 'a', body: '[suprimido]', createdAt: new Date(T1), authorUserId: IMPORTER },
      { id: 'h', body: 'Nuevo en iWana', createdAt: new Date(T2), authorUserId: LUIS },
    ];
    const expected = [{ body: 'Original', createdAt: T1, authorUserId: ANA }];
    expect(matchImportedComments(stored, expected, [IMPORTER])).toEqual([]);
  });
});
