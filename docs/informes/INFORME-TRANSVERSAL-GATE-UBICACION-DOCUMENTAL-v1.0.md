# INFORME — Compuerta de ubicación documental (`audit:doc-locations`)

**Versión:** 1.0
**Estado:** Cerrado
**Fecha:** 2026-07-27
**Revisiones:** 2026-07-27 (misma fecha) — §5 deuda resuelta (zona exenta `docs/archive/`), §4 y §9 actualizados al estado final con evidencia fresca; §10 guardia anti-vacío (Addendum v1.1 del prompt origen).
**Ejecutor:** AI-PLAT-OPS (Platform/DevOps Engineer)
**Prompt origen:** [`docs/prompts/PROMPT-TRANSVERSAL-GATE-UBICACION-DOCUMENTAL-v1.0.md`](../prompts/PROMPT-TRANSVERSAL-GATE-UBICACION-DOCUMENTAL-v1.0.md)
**Norma que protege:** `AGENTS.md` → Documentation Rules (tabla TIPO → carpeta, reescrita el 2026-07-27)

---

## 1 · Qué se implementó

| Pieza | Archivo | Detalle |
| --- | --- | --- |
| Validador | `scripts/audit-doc-locations.mjs` | Node puro, sin dependencias, mismo contrato de salida y exit codes que `scripts/audit-adr-citations.mjs`. |
| Script npm | `package.json` | `"audit:doc-locations": "node scripts/audit-doc-locations.mjs"`, junto a `audit:adr-citations`. |
| Paso de CI | `.github/workflows/ci.yml` | Paso «Auditar ubicación documental» añadido al job `adr-citations`, tras «Auditar citas ADR». Gate rojo, sin `continue-on-error`. |

Reglas del validador:

- **BLOQUEANTE (exit 1):** cualquier `*.prompt.md` en cualquier ruta; cualquier `PROMPT-*.md` fuera de `docs/prompts/`; cualquier carpeta `prompts/` cuya ruta relativa no sea exactamente `docs/prompts`.
- **AVISO (nunca bloquea):** `PRD-*` fuera de `docs/prds/`, `HLD-*` fuera de `docs/hlds/`, `ADR-*` fuera de `docs/adrs/`, `INFORME-*` fuera de `docs/informes/`.
- **Exclusiones:** `node_modules/`, `.git/`, `dist/`, `.next/`, `.turbo/`, `coverage/`, `.pnpm-store/` y `docs/prompts/TEMPLATE-*.md`.
- **Zona exenta (2026-07-27, ver §5):** `docs/archive/` — histórico congelado por decisión documental, no documentación viva.

## 2 · Por qué existe este gate (causa raíz)

Durante meses se depositaron prompts de ejecución en `.github/prompts/` en lugar de `docs/prompts/`. La causa no fue descuido sino una norma mal escrita: `AGENTS.md` asignaba `.github/prompts/` bajo una fila genérica «Prompts» y la ruta correcta solo aparecía como «destino sugerido» en una plantilla en revisión. El 2026-07-27 se corrigió la norma y se migraron 33 archivos. Este gate es la pieza que impide la reincidencia: el cumplimiento ya no depende de que nadie se equivoque.

## 3 · Evidencia — prueba de mutación (salida literal)

**Paso 1 — crear el mutante en la raíz del repo (fuera de `docs/prompts/`):**

```
PROMPT-PRUEBA-MUTACION-v1.0.md  (261 bytes, contenido declarando su propósito efímero)
```

**Paso 2 — `node scripts/audit-doc-locations.mjs` → ROJO:**

```
=== BLOQUEANTE ===
PROMPT-PRUEBA-MUTACION-v1.0.md — [BLOQUEANTE][prompt-outside-docs-prompts] PROMPT-*.md fuera de docs/prompts/ — muévelo a docs/prompts/ — es la única carpeta de prompts del repo (AGENTS.md → Documentation Rules)

=== AVISO ===
docs/archive/informes/INFORME-MOD01-FRONTEND-TAILADMIN-v1.0.md — [AVISO][informe-outside-docs-informes] INFORME-*.md fuera de docs/informes/ — su carpeta canónica es docs/informes/ (AGENTS.md → Documentation Rules)

Resumen: BLOQUEANTE: 1 · AVISO: 1 (862 archivos .md escaneados; los AVISO no bloquean)
exit=1
```

**Paso 3 — borrar el mutante:**

```
$ rm PROMPT-PRUEBA-MUTACION-v1.0.md && echo "borrado: $(ls PROMPT-PRUEBA-MUTACION-v1.0.md 2>&1)"
borrado: ls: cannot access 'PROMPT-PRUEBA-MUTACION-v1.0.md': No such file or directory
```

**Paso 4 — `node scripts/audit-doc-locations.mjs` → VERDE:**

```
=== AVISO ===
docs/archive/informes/INFORME-MOD01-FRONTEND-TAILADMIN-v1.0.md — [AVISO][informe-outside-docs-informes] INFORME-*.md fuera de docs/informes/ — su carpeta canónica es docs/informes/ (AGENTS.md → Documentation Rules)

Resumen: BLOQUEANTE: 0 · AVISO: 1 (861 archivos .md escaneados; los AVISO no bloquean)
exit=0
```

## 4 · Stop/go final (salida literal, estado tras resolver §5)

`node scripts/audit-doc-locations.mjs` sobre el repo actual:

```
audit-doc-locations: sin hallazgos (856 archivos .md escaneados).
exit=0
```

(Ejecución original del encargo, antes de resolver §5: `BLOQUEANTE: 0 · AVISO: 1`, exit 0 — el AVISO era la deuda de `docs/archive/`, hoy resuelta.)

`node scripts/audit-adr-citations.mjs` (sin tocar, sigue en verde):

```
Resumen: BLOQUEANTE: 0 · AVISO: 108 (52 ADRs indexados; los [revisar] son heurísticos y requieren confirmación manual)
exit=0
```

## 5 · Deuda preexistente detectada — RESUELTA (2026-07-27)

El barrido destapó **un único** incumplimiento de otro tipo documental:

- `docs/archive/informes/INFORME-MOD01-FRONTEND-TAILADMIN-v1.0.md` — `INFORME-*.md` fuera de `docs/informes/`.

**Resolución adoptada: declarar `docs/archive/` zona exenta del barrido**, no reubicar el archivo. Motivo: la ubicación del informe en `docs/archive/informes/` no es descuido sino una decisión documental explícita ya registrada — `INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` (§tabla de disposición) documenta su archivado. Moverlo de vuelta a `docs/informes/` contradiría esa disposición y mezclaría histórico congelado con documentación viva. La regla TIPO → carpeta de `AGENTS.md` gobierna la documentación viva; el archivo es histórico cuya ubicación ya fue decidida.

Implementación: `EXEMPT_DIRS = new Set(['docs/archive'])` en `scripts/audit-doc-locations.mjs`, documentado en la cabecera del script. Verificación tras el cambio (salida literal):

```
$ node scripts/audit-doc-locations.mjs
audit-doc-locations: sin hallazgos (856 archivos .md escaneados).
exit=0

# Re-prueba de mutación (el gate sigue reaccionando al defecto):
$ touch PROMPT-PRUEBA-MUTACION-v1.0.md && node scripts/audit-doc-locations.mjs
=== BLOQUEANTE ===
PROMPT-PRUEBA-MUTACION-v1.0.md — [BLOQUEANTE][prompt-outside-docs-prompts] PROMPT-*.md fuera de docs/prompts/ — muévelo a docs/prompts/ ...
Resumen: BLOQUEANTE: 1 · AVISO: 0 (857 archivos .md escaneados; los AVISO no bloquean)
exit=1
$ rm PROMPT-PRUEBA-MUTACION-v1.0.md && node scripts/audit-doc-locations.mjs
audit-doc-locations: sin hallazgos (856 archivos .md escaneados).
exit=0
```

No existe ningún `*.prompt.md`, ningún `PROMPT-*.md` fuera de `docs/prompts/` y ninguna carpeta `prompts/` adicional: el barrido confirma el estado verificado por el orquestador.

## 6 · Decisión: no renombrar el job de CI

El prompt origen sugería *considerar* renombrar el job `adr-citations` a algo como «Integridad documental» al cubrir dos validadores. **No se hizo**: el id del job (`adr-citations`) y su display name (`Integridad de citas ADR`) pueden estar referenciados en las reglas de branch protection del repositorio, y romper esa referencia dejaría los PRs sin check obligatorio o bloqueados. Renombrar es un cambio de plataforma que excede este encargo.

Se actualizó en su lugar el comentario sobre el job (`.github/workflows/ci.yml`, líneas 17–24) para que describa que el job cubre dos validadores documentales, con nota explícita del motivo de conservar el nombre. La cabecera del workflow no se tocó: nunca describió el job `adr-citations`, así que no quedó desactualizada.

**[ESCALACIÓN AL CTO]** si se desea el rename del job a «Integridad documental»: requiere verificar/actualizar branch protection en el mismo cambio.

## 7 · Desviaciones del encargo

- **Cabecera del workflow sin cambios.** El encargo la dejaba condicionada («si procede, de forma mínima»); al no renombrarse el job y no describir la cabecera ese job, no procedía.
- **Soporte `--json` añadido** al validador por paridad de contrato con `audit-adr-citations.mjs` (coste marginal, mismo flag).
- Ninguna otra. No se modificó `scripts/audit-adr-citations.mjs`; no se ejecutó ninguna mutación git.

## 8 · Restricciones duras — cumplimiento

- Sin `git add` / `git commit` / `git stash` / `git checkout` ni mutación git alguna.
- `scripts/audit-adr-citations.mjs` intacto (verificado: solo lectura).
- Deuda preexistente de PRD/HLD/ADR/INFORME reportada como AVISO, nunca bloqueante.

## 9 · Repaso final (2026-07-27, post-resolución de §5)

Repaso completo del entregable tras resolver la deuda de §5. Evidencia fresca, ejecutada y capturada en esta sesión:

**Inventario del entregable:**

| Pieza | Archivo | Estado verificado |
| --- | --- | --- |
| Validador | `scripts/audit-doc-locations.mjs` | `node --check` OK; zona exenta `docs/archive/` documentada en cabecera y en `EXEMPT_DIRS`. |
| Script npm | `package.json` líneas 22–23 | `audit:adr-citations` y `audit:doc-locations` adyacentes. |
| Paso de CI | `.github/workflows/ci.yml` líneas 17–42 | Job `adr-citations` con pasos «Auditar citas ADR» y «Auditar ubicación documental»; comentario describe ambos validadores y la razón de conservar id/nombre. Sin parseador YAML disponible en local (ni `js-yaml` ni `pyyaml`); validación visual línea a línea — la indentación replica la de los pasos preexistentes. |

**Sintaxis y wiring npm:**

```
$ node --check scripts/audit-doc-locations.mjs && echo "sintaxis OK"
sintaxis OK

$ pnpm audit:doc-locations
> iwana-next@0.1.0 audit:doc-locations C:\appiw
> node scripts/audit-doc-locations.mjs
audit-doc-locations: sin hallazgos (856 archivos .md escaneados).
exit=0
```

**Gate vecino intacto:**

```
$ node scripts/audit-adr-citations.mjs
Resumen: BLOQUEANTE: 0 · AVISO: 108 (52 ADRs indexados; ...)
exit=0
```

**Re-prueba de mutación completa (regla del repo: ningún control se acepta sin demostrar que reacciona al defecto):**

```
== Paso 1: crear mutante ==
-rw-r--r-- 1 iS 197121 99 Jul 27 07:45 PROMPT-PRUEBA-MUTACION-v1.0.md
== Paso 2: ejecutar gate (debe salir ROJO) ==
=== BLOQUEANTE ===
PROMPT-PRUEBA-MUTACION-v1.0.md — [BLOQUEANTE][prompt-outside-docs-prompts] PROMPT-*.md fuera de docs/prompts/ — muévelo a docs/prompts/ — es la única carpeta de prompts del repo (AGENTS.md → Documentation Rules)

Resumen: BLOQUEANTE: 1 · AVISO: 0 (857 archivos .md escaneados; los AVISO no bloquean)
exit=1
== Paso 3: borrar mutante ==
ls: cannot access 'PROMPT-PRUEBA-MUTACION-v1.0.md': No such file or directory
== Paso 4: ejecutar gate (debe salir VERDE) ==
audit-doc-locations: sin hallazgos (856 archivos .md escaneados).
exit=0
```

**Estado final:** cero hallazgos (bloqueantes y avisos), los dos validadores en verde, CI cableado, deuda documental cerrada. Pendiente conocido y escalado en §6: rename opcional del job de CI (requiere branch protection).

## 10 · Addendum v1.1 — guardia anti-vacío (2026-07-27)

**Defecto detectado en el review de segunda capa (AI-EM-ARCH):** el gate pasaba en verde habiendo escaneado 0 archivos — `filesScanned` se reportaba pero no se assertaba. Si `walk()` dejaba de recorrer (entrada mal puesta en `SKIP_DIRS`, cambio de rutas, invocación desde otro cwd), el validador decía «sin hallazgos» y devolvía 0 sin haber mirado nada: el hallazgo A-2 de ADR-065 reproducido dentro de la propia compuerta (*un control que no puede fallar por la razón para la que existe*). Encargo registrado como Addendum v1.1 en el prompt origen.

**Guardia implementada (AI-PLAT-OPS):** si `filesScanned === 0`, el script imprime un error explícito por stderr y sale con **exit 2** (distinguible del exit 1 de hallazgos bloqueantes), documentado en la cabecera del script junto a los precedentes del patrón (`expect(busyTagsFound).toBeGreaterThan(0)` en `aria-busy-contrast.structure.spec.ts` y el paso de integración 089 de `ci.yml`, rojo si la suite se omite). Criterio del mínimo: 0 archivos — no un umbral superior: el repo tiene ~860 `.md` y cualquier umbral arbitrario mayor sería frágil sin añadir seguridad; el defecto a cubrir es el barrido que no miró nada, no el tamaño del repo.

**Evidencia literal de aceptación:**

```
== 1 · desde directorio vacío (debe salir ROJO) ==
$ mkdir -p tmp/empty-cwd && cd tmp/empty-cwd && node ../../scripts/audit-doc-locations.mjs
audit-doc-locations: ERROR — el barrido no encontró ningún archivo .md. Verifica que el script se ejecute desde la raíz del repositorio (el directorio de trabajo actual no contiene documentación).
exit=2
(directorio de prueba eliminado)

== 2 · desde la raíz del repo (debe salir VERDE) ==
$ node scripts/audit-doc-locations.mjs
audit-doc-locations: sin hallazgos (862 archivos .md escaneados).
exit=0

== 3 · re-prueba de mutación (la guardia no rompió el camino rojo normal) ==
$ (mutante PROMPT-PRUEBA-MUTACION-v1.0.md en raíz)
Resumen: BLOQUEANTE: 1 · AVISO: 0 (863 archivos .md escaneados; los AVISO no bloquean)
exit=1
$ (mutante borrado)
audit-doc-locations: sin hallazgos (862 archivos .md escaneados).
exit=0

== 4 · gate vecino intacto ==
$ node scripts/audit-adr-citations.mjs
Resumen: BLOQUEANTE: 0 · AVISO: 104 (52 ADRs indexados; ...)
exit=0
```

**Nota de ejecución:** el subagente AI-PLAT-OPS implementó la guardia y su documentación de cabecera, y quedó interrumpido por un corte de servicio antes de la evidencia y esta sección; la ejecución de los criterios de aceptación y la redacción de este §10 las completó el orquestador, verificando el código heredado línea a línea antes de firmarlo.
