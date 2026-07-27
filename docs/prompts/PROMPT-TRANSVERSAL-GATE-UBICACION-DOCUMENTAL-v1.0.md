# PROMPT — Compuerta de ubicación documental (`audit:doc-locations`)

**Version:** 1.1
**Estado:** Aprobado — **entrega v1.0 aceptada con un pendiente** (ver §Addendum v1.1 al final)
**Fecha:** 2026-07-27
**Generado por:** AI-EM-ARCH (modo Architect)
**Archivo destino:** `docs/prompts/PROMPT-TRANSVERSAL-GATE-UBICACION-DOCUMENTAL-v1.0.md`
**Ejecutor previsto:** AI-PLAT-OPS
**Plan que lo gobierna:** fase 3 de `C:\Users\SLEYB\.claude\plans\los-prompt-se-dejan-jaunty-blanket.md`
**Entrada obligatoria:** `AGENTS.md` → Documentation Rules (tabla TIPO → carpeta), reescrita el 2026-07-27
**Skills:** `docs-architect`, `monorepo-architect`

---

## Por qué existe este encargo

Durante meses se depositaron prompts de ejecución en `.github/prompts/` en lugar de `docs/prompts/`. La investigación demostró que **la causa no fue descuido sino una norma mal escrita**: `AGENTS.md:57` —la fuente de mayor precedencia— asignaba `.github/prompts/` bajo una fila titulada genéricamente «Prompts», y la ruta correcta solo aparecía en una plantilla como «destino *sugerido*», en un documento en estado «En revisión».

El 2026-07-27 se corrigió la norma en siete superficies y se migraron 33 archivos. **Falta la única pieza que impide la reincidencia:** hoy el cumplimiento depende de que nadie se equivoque, que es exactamente lo que ya falló.

## Alcance exacto

### 1 · Script `scripts/audit-doc-locations.mjs`

Node puro, **sin dependencias** (igual que `scripts/audit-adr-citations.mjs`, úsalo como referencia de estilo, formato de salida y códigos de severidad).

Debe fallar (exit ≠ 0) cuando:

- Exista cualquier archivo `*.prompt.md` en el repo, en cualquier ruta. Ese sufijo pertenecía a la convención suprimida; ya no debe aparecer.
- Exista cualquier `PROMPT-*.md` fuera de `docs/prompts/`.
- Exista una carpeta `prompts/` fuera de `docs/`.

Extiéndelo a los demás tipos de la tabla de `AGENTS.md` → Documentation Rules si el coste es marginal: `PRD-*` fuera de `docs/prds/`, `HLD-*` fuera de `docs/hlds/`, `ADR-*` fuera de `docs/adrs/`, `INFORME-*` fuera de `docs/informes/`. **Comprueba antes el estado real**: si hoy hay incumplimientos preexistentes de esos otros tipos, repórtalos y **no** los conviertas en bloqueantes sin consultarme — el encargo es cerrar la puerta, no poner la CI en rojo por deuda que nadie ha decidido pagar.

Excluir del barrido: `node_modules/`, `.git/`, `dist/`, `.next/`, `.turbo/`, y `docs/prompts/TEMPLATE-*.md`.

### 2 · Script npm y cableado de CI

- `"audit:doc-locations": "node scripts/audit-doc-locations.mjs"` en el `package.json` raíz, junto a `audit:adr-citations`.
- Añadirlo al job **`adr-citations`** de `.github/workflows/ci.yml` — no al job pesado. Ese job ya existe, es Node puro sin `pnpm install` ni build, y da señal en segundos. Gate rojo, sin `continue-on-error`.
- Considera renombrar el job a algo como «Integridad documental» si va a cubrir dos validadores; si lo haces, actualiza el comentario de cabecera del workflow, que hoy describe solo el de citas.

## Criterio de aceptación — prueba de mutación

**Sin esto no se acepta la entrega.** Es la regla vigente del repo: ningún control se acepta sin demostrar que reacciona al defecto para el que existe.

1. Crea un `PROMPT-PRUEBA-MUTACION-v1.0.md` fuera de `docs/prompts/`.
2. Ejecuta el script → **debe salir rojo**, nombrando el archivo y la carpeta esperada.
3. Bórralo.
4. Ejecuta el script → **verde**.

Adjunta la salida literal de los cuatro pasos.

## Restricciones

- El árbol tiene ~485 archivos modificados de trabajo previo: **no hagas `git add`, `git commit`, `git stash` ni `git checkout`.**
- No modifiques `scripts/audit-adr-citations.mjs`: es un validador distinto con su propio ámbito.
- Mensajes de error en español, accionables: qué archivo, qué carpeta le corresponde y por qué.
- No conviertas en bloqueante ninguna deuda preexistente sin consultarlo primero.

## Entregables

1. `scripts/audit-doc-locations.mjs` + script npm.
2. El paso de CI.
3. La prueba de mutación con su salida literal.
4. Si el barrido destapa incumplimientos preexistentes de otros tipos documentales: la lista, **sin** convertirlos en gate rojo.

## Stop/go

- `node scripts/audit-doc-locations.mjs` en verde sobre el repo actual.
- `node scripts/audit-adr-citations.mjs` sigue en `BLOQUEANTE: 0` y exit 0.
- Prueba de mutación adjunta. Sin ella, la entrega se devuelve.

---

## Addendum v1.1 — pendiente tras el review de segunda capa (AI-EM-ARCH, 2026-07-27)

**La entrega v1.0 se acepta.** Verifiqué por ejecución propia las tres reglas con su prueba de mutación (`PROMPT-*.md` fuera de sitio, sufijo `.prompt.md`, carpeta `prompts/` ajena), y las tres mueren con su defecto y vuelven a verde al restaurarlo. La deuda preexistente se trató como pedía el encargo: reportada y resuelta por exención justificada, sin convertirse en gate rojo. Las dos citas del script (`docs/archive/informes/INFORME-MOD01-FRONTEND-TAILADMIN-v1.0.md` y el informe de normalización) resisten apertura.

**Queda un defecto: el gate puede pasar en verde sin haber comprobado nada.**

```
$ cd <directorio vacío> && node C:/appiw/scripts/audit-doc-locations.mjs
audit-doc-locations: sin hallazgos (0 archivos .md escaneados).
exit=0
```

`filesScanned` se **reporta** pero no se **asserta**. Si `walk()` deja de recorrer —una entrada mal puesta en `SKIP_DIRS`, un cambio de rutas, una invocación desde otro directorio de trabajo—, el validador imprime «sin hallazgos» y devuelve 0 sin haber mirado un solo archivo. Hoy en CI se ejecuta desde la raíz del checkout y funciona; el problema es que **nada lo garantiza**.

Es el hallazgo A-2 del programa ADR-065 reproducido dentro de la propia compuerta creada para impedir reincidencias: *un control que no puede fallar por la razón para la que existe*. El repo ya tiene el patrón resuelto dos veces y ambos sirven de referencia:

- `apps/portal/src/components/shared/aria-busy-contrast.structure.spec.ts` → `expect(busyTagsFound).toBeGreaterThan(0)`, con el comentario «si esto falla, la expresión dejó de ver las regiones busy y la regla principal estaría pasando en falso».
- El paso de integración de `089` en `ci.yml` → rojo si la suite se omite, en vez de conformarse con el exit code.

**Encargo (AI-PLAT-OPS):** añadir una guardia anti-vacío. Si `filesScanned` es 0 —o cae por debajo de un mínimo razonable que justifiques—, salida **roja** con mensaje explícito de que el barrido no encontró documentación y por tanto no ha verificado nada. Documentar el porqué en la cabecera, como el resto del script.

**Criterio de aceptación:** ejecutar el validador desde un directorio vacío y adjuntar la salida en **rojo**; y confirmar que desde la raíz del repo sigue en verde. Sin las dos salidas literales, la guardia no se acepta — es la misma regla que gobierna todo lo demás.
