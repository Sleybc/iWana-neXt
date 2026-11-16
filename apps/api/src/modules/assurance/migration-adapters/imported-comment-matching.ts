/**
 * Emparejamiento determinista entre los comentarios importados de un ticket y su actividad de
 * UISP («Actualizar autores», spec 2026-11-15 «usuarios» §2.7).
 *
 * `ticket_comments` no guarda el id de la actividad de UISP y su `id` es aleatorio, así que el
 * orden de inserción no se puede reconstruir. La promoción guarda el cuerpo tal cual y
 * `created_at = COALESCE(createdAt de UISP, now())`; por eso se empareja:
 *
 * 1. primero los comentarios con fecha en UISP, por cuerpo **e** instante exactos;
 * 2. después los que no traen fecha, solo por cuerpo (su `created_at` fue el de la promoción).
 *
 * Cada fila se usa una sola vez y toda actividad ocupa su fila aunque no tenga equivalencia, para
 * que no se la quite a otra. En un empate (mismo cuerpo e instante) se prefiere la fila que ya
 * tiene el autor esperado y después una que sigue a nombre de quien importó; así repetir no
 * intercambia autores. Dos comentarios idénticos en cuerpo e instante son indistinguibles: da
 * igual cuál lleve cada autor. Un comentario sin pareja (cuerpo suprimido por privacidad o
 * comentario nuevo de iWana) no se toca.
 */
export interface StoredImportedComment {
  id: string;
  body: string;
  createdAt: Date | string;
  authorUserId: string;
}

export interface ExpectedImportedComment {
  body: string;
  createdAt: string | null;
  authorUserId: string | null;
}

export interface MatchedImportedComment {
  id: string;
  target: string;
  current: string;
}

const epoch = (value: Date | string) => (value instanceof Date ? value : new Date(value)).getTime();

export function matchImportedComments(
  stored: readonly StoredImportedComment[],
  expected: readonly ExpectedImportedComment[],
  importerIds: readonly string[],
): MatchedImportedComment[] {
  const importers = new Set(importerIds);
  const rows = [...stored].sort(
    (a, b) => epoch(a.createdAt) - epoch(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const used = new Set<string>();
  const byIndex = new Map<number, MatchedImportedComment>();

  const claim = (index: number, item: ExpectedImportedComment, timed: boolean) => {
    const time = timed ? epoch(item.createdAt!) : null;
    const candidates = rows.filter(
      (row) =>
        !used.has(row.id) &&
        row.body === item.body &&
        (time === null || epoch(row.createdAt) === time),
    );
    const chosen =
      (item.authorUserId !== null
        ? candidates.find((row) => row.authorUserId === item.authorUserId)
        : undefined) ??
      candidates.find((row) => importers.has(row.authorUserId)) ??
      candidates[0];
    if (!chosen) return;
    used.add(chosen.id);
    if (item.authorUserId !== null) {
      byIndex.set(index, {
        id: chosen.id,
        target: item.authorUserId,
        current: chosen.authorUserId,
      });
    }
  };

  expected.forEach((item, index) => {
    if (item.createdAt !== null && !Number.isNaN(Date.parse(item.createdAt)))
      claim(index, item, true);
  });
  expected.forEach((item, index) => {
    if (item.createdAt === null || Number.isNaN(Date.parse(item.createdAt))) {
      claim(index, item, false);
    }
  });
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, match]) => match);
}
