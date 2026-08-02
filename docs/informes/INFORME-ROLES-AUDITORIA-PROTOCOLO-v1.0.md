# Informe de auditoría — Protocolo de Colaboración Multiagente

**Versión:** 1.0
**Estado:** Cerrado — remediación aplicada (protocolo v1.4)
**Fecha:** 2026-08-02
**Modo activo:** Architect + EM
**Alcance auditado:** [`docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`](../roles/Protocolo_Colaboracion_Multiagente_v1.md) en su v1.3
**Documentos de contraste:** `AGENTS.md`, los 9 perfiles de `docs/roles/`, `.github/workflows/ci.yml`, `package.json`, `scripts/audit-adr-citations.mjs`, `scripts/audit-doc-locations.mjs`, `.claude/agents/*.md`, y los ADR-016, ADR-022, ADR-023, ADR-049, ADR-056 y ADR-069 (propuesto)
**Auditoría hermana:** [INFORME-ROLES-AUDITORIA-EM-ARCH-v1.0.md](INFORME-ROLES-AUDITORIA-EM-ARCH-v1.0.md) — este informe cierra un hallazgo que aquella dejó abierto (§6.4 punto 2)
**Informe vivo relacionado:** [INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md](INFORME-ROLES-ECOSISTEMA-MULTIAGENTE-v1.0.md) §7

---

## 1. Método

Verificación por apertura de artefacto (protocolo §7.4). A diferencia de la auditoría del perfil, aquí buena parte de los hallazgos son **comprobables mecánicamente**, porque el protocolo hace afirmaciones sobre el repo: qué carpetas existen, qué comandos verifican un gate, cuántos tracks hay, qué marcadores usa el ecosistema. Se contrastó cada una contra el árbol real, `package.json`, el workflow de CI y un inventario por `grep` de los marcadores en `docs/`, `.claude/` y `.agents/`.

## 2. Veredicto

El protocolo es el documento más maduro del ecosistema: su RACI, su workflow de 7 etapas y su modelo `§3bis` de ejecución paralela son correctos y no se encontró ningún error de diseño en ellos. Lo que falla es **la interfaz entre el protocolo y el repo que gobierna**: declara listas cerradas que no coinciden con el árbol real, gates "verificables" sin decir con qué, y un vocabulario de marcadores que el ecosistema usa 100+ veces y que el protocolo solo define en una cuarta parte.

Es el patrón inverso al del perfil EM-ARCH: allí la base normativa estaba desactualizada; aquí la norma es buena y la **instrumentación** es la que no cierra.

Hallazgos: **2 bloqueantes · 6 altos · 7 medios · 3 bajos**.

## 3. Hallazgos bloqueantes

### B-01 · La enumeración "cerrada" de handoff excluye artefactos de su propia etapa 1

§3, regla *Handoff explícito* (v1.3): *"cada etapa termina con un artefacto nombrado y localizado en `docs/` — `docs/prds/`, `docs/specs/`, `docs/plans/`, `docs/informes/` y **`docs/prompts/`** … La enumeración es **cerrada**."*

La tabla de la misma sección declara que la **etapa 1 produce HLD y ADRs**. Ninguna de las dos carpetas — `docs/hlds/` (24 archivos) y `docs/adrs/` (55) — figura en la enumeración. `docs/` tiene además `quality/`, `runbooks/`, `security/`, `sprints/`, `ideas/` y `archive/`.

Agravante: el gate de CI del propio repo (`scripts/audit-doc-locations.mjs:101-102`) **exige** `HLD-*` en `docs/hlds/` y `ADR-*` en `docs/adrs/`. Leída literalmente, la regla del protocolo prohíbe depositar el HLD donde el gate obliga a depositarlo.

**Remediado:** la enumeración pasa a tabla artefacto → carpeta canónica → etapa → gate automático. Lo cerrado es `docs/`, no la lista de subcarpetas.

### B-02 · Regla de completitud atribuida a ADR-016

§3, última regla (v1.3): *"Regla de completitud (ADR-016)"*. `ADR-016-Cierre-MOD01-Produccion.md` es el cierre de MOD01; su cabecera lleva la nota de desambiguación de ADR-056: la autoridad de la regla es **ADR-022** (Aprobado 2026-07-19).

Es el mismo defecto corregido en el perfil AI-EM-ARCH, y **el protocolo es su origen**: los perfiles lo copiaron de aquí.

**Remediado:** reanclado a ADR-022, con nota.

## 4. Hallazgos altos

| # | Hallazgo | Evidencia | Remediación |
| --- | --- | --- | --- |
| A-01 | **§4 no coincide con los *Gates Before Merge* de `AGENTS.md`.** Al protocolo le faltaban **lint y typecheck**, que `AGENTS.md` sí exige. `AGENTS.md` tiene precedencia 1: un agente que leyera solo el protocolo podía dar G5 por cumplido sin correr ninguno de los dos | `AGENTS.md` §*Gates Before Merge* (7 ítems) vs protocolo §4 v1.3 (9 ítems); la intersección omite lint/typecheck | §4 reescrita como superconjunto declarado de `AGENTS.md`, con la regla de precedencia explícita |
| A-02 | **Gates "verificables por cualquier agente" sin comando.** §4 declaraba la verificabilidad y no mapeaba un solo gate a un comando, pese a que el repo tiene 6 (`lint`, `typecheck`, `test`, `audit:adr-citations`, `audit:doc-locations`, `sync:agents:check`) y CI corre los seis | `package.json` scripts; `.github/workflows/ci.yml` jobs `adr-citations` y `ci` | Tabla de 13 gates, cada uno con su verificación |
| A-03 | **Vocabulario de marcadores fragmentado y sin fuente única.** El protocolo define el formato de **uno** de los cuatro (`[CONSULTA]`, §6.2); `[BLOQUEO]` se menciona sin formato, y `[DESEMPATE]` y `[ESCALACION AL CTO]` estaban definidos **solo en el perfil de EM-ARCH Parte II** — contra el §Alcance, que declara al protocolo *"fuente única … los perfiles no la duplican"* | Inventario en `docs/` + `.claude/` + `.agents/`: `[ESCALACION AL CTO]` **41** · `[ESCALACIÓN AL CTO]` 7 · `[ESCALACIÓN DE SEGURIDAD]` 8 · `[ESCALACIÓN]` 3 · `[BLOQUEO]` **31** · `[BLOQUEO TÉCNICO]` 6 · `[BLOQUEO PENDIENTE DE ENTORNO]` 1 · `[DESEMPATE]` 16 | Nueva **§6.3 Vocabulario de marcadores** con tabla, formatos y regla de variantes |
| A-04 | **Cadencia anclada al sprint.** §8 hacía del informe de sprint la fuente primaria de los KPIs; el programa entrega por fase y módulo (2 informes de sprint frente a 30 de cierre). Además, tras la v2.2 del perfil EM-ARCH quedaban en conflicto — y por §9 **prevalece el protocolo**, así que el defecto era de este documento | `docs/informes/`: 2 `*SPRINT*`, 30 de cierre, 256 totales | §8 reordenada: fase (primaria) → módulo (corte de gobierno) → sprint (agregado a solicitud del CTO) |
| A-05 | **Deriva sin bump.** Cabecera en `Versión: 1.3 / Fecha: 2026-07-18`, con una modificación fechada **2026-07-27** registrada dentro de §3bis regla 4 | Línea 149 de la v1.3; `git log` del archivo | v1.4 con changelog; §9 incorpora la obligación de bump |
| A-06 | **Dos definiciones internas de Estrella Polar.** La fila de la RACI decía *"prototipo ADR-023 + spec Firma iWana"* (dos dominios) mientras §5.4 ya traía los **tres dominios** de ADR-056 §3. El auditor de fidelidad (SR-QA) lee la fila de la RACI, no la nota de §5 | Protocolo §2 fila *Fidelidad a la Estrella Polar* vs §5.4 | Fila alineada a los tres dominios |

## 5. Hallazgos medios y bajos

| # | Sev. | Hallazgo | Remediación |
| --- | --- | --- | --- |
| M-01 | Media | **La caché de Turborepo puede falsear el gate 4.** `pnpm test` en verde puede no haber ejecutado nada: una suite restaurada de caché reporta éxito. El gate de cobertura era, en la práctica, no verificable | Nota operativa en §4: el reporte de fase adjunta el resumen de Turbo con **`Cached: 0`** o la corrida `--force`; sin eso, la cobertura se reporta *no verificada* |
| M-02 | Media | **`pnpm audit:doc-locations` no citado.** Es el gate automático de la regla de handoff §3 y §3bis.4 — la única regla del protocolo con enforcement mecánico que el protocolo ignoraba, mientras sí citaba `audit:adr-citations` en §7.4 | Incorporado a la tabla §3 y al gate 12 de §4 |
| M-03 | Media | **Punto muerto en §6.2 regla 3.** *"Si el consultado no responde … entra a la §5 vía EM-ARCH"* es circular cuando el consultado **es** EM-ARCH — que es el caso más frecuente, porque su columna concentra las consultas bloqueantes de alcance y boundary | Nueva regla 6 en §6.2: supuesto registrado + entregable marcado como condicionado + decisión pendiente del CTO en el informe de fase |
| M-04 | Media | **`§3bis` decía "cuatro tracks"** y su tabla lista **cinco** (UX, Design-system, Frontend, Backend, QA) | Corregido a cinco |
| M-05 | Media | **`A*` y `A` en la misma fila.** *Infraestructura, CI/CD, backups/DR y observabilidad de plataforma* es la única de 16 filas donde coexisten, justo donde el lector necesita la nota al pie para saber quién responde en un incidente. La regla declarada es "Accountable máximo uno" | Nota de notación en §2: `A*` es autoridad de excepción y nunca cuenta como el Accountable operativo; la nota al pie nombra explícitamente a EM-ARCH y PLAT-OPS en esa fila |
| M-06 | Media | **§3bis regla 1 decía "se versiona y notifica"** sin definir cómo se versiona un contrato ni dónde se notifica — el mecanismo central del modelo paralelo quedaba a interpretación | Procedimiento de tres pasos en §3bis regla 1 (bump del artefacto, adenda al prompt citando ruta y versión, tracks nombrados) |
| M-07 | Media | **La capa de subagentes no existía en el protocolo.** `.claude/agents/*.md` (8 ejecutores + generados a `.opencode/` y `.codex/`) es cómo los perfiles se operacionalizan, y solo `AGENTS.md` lo declaraba | Bloque *Operacionalización* en la cabecera |
| X-01 | Baja | **RACI sin filas** para documentación (`docs/`, 500+ artefactos y un merge gate propio), deuda técnica (EM-ARCH la gestiona por §3.3 sin fila) y observabilidad **de aplicación** — solo existe la "de plataforma" | **No remediado** — ver §6 |
| X-02 | Baja | **Sin *definition of ready*.** Las 7 etapas tienen gate de salida; ninguna tiene condición de entrada. Un track puede arrancar contra una spec incompleta y el gate solo lo detecta al final | **No remediado** — ver §6 |
| X-03 | Baja | **ADR-069 (propuesto)** introduce G6.5 entre G6 y G7; el workflow §3 tiene siete gates | **No remediado a propósito** — ver §6 |

## 6. Residuales y decisiones para el CTO

1. **ADR-069 (propuesto) — gate G6.5.** No se incorpora a §3 mientras no esté `Aprobado`: sería la infracción de §7.4 que este protocolo define. Al aprobarse, el workflow pasa de 7 a 8 gates y requieren actualización §3, §4 y §8 del protocolo, más §7 y §11 del perfil EM-ARCH (**v1.5** y **v2.3** respectivamente).
2. **Filas de RACI faltantes** (X-01). Recomiendo añadir tres: *Documentación y trazabilidad* (A: EM-ARCH · R: el productor del artefacto de cada etapa), *Deuda técnica* (A: EM-ARCH · R: el R del área que la genera) y *Observabilidad de aplicación* (A: EM-ARCH · R: SR-FULL/FE-PLAT por superficie). Es un cambio de RACI → por §9 requiere aprobación de EM-ARCH y registro, no ADR. No lo apliqué porque asignar Responsible es decisión de estructura, no corrección de defecto.
3. **Definition of ready por etapa** (X-02). El equivalente de entrada a los gates de salida: qué debe existir para que una etapa pueda arrancar. Alto valor y bajo costo, pero es diseño nuevo, no remediación.
4. **`.cursor/` sin versionar** — heredado de la auditoría hermana (§6.4 punto 4 del informe vivo), sigue abierto.

## 7. Verificación de la remediación

| Verificación | Resultado |
| --- | --- |
| `node scripts/audit-adr-citations.mjs` | `BLOQUEANTE: 0` — sin regresión frente a la línea base |
| `node scripts/audit-doc-locations.mjs` | Sin bloqueantes nuevos |
| Gates de §4 ⊇ *Gates Before Merge* de `AGENTS.md` | Conforme — los 7 de `AGENTS.md` están entre los 13 |
| Comandos citados en §4 existen en `package.json` | Los 6 verificados (`lint`, `typecheck`, `test`, `audit:adr-citations`, `audit:doc-locations`, `sync:agents:check`) |
| Carpetas citadas en la tabla de handoff §3 existen | Las 7 verificadas |
| Filas de RACI con más de un Accountable operativo | 0 |
| Cadencia §8 del protocolo == instrumentación §7/§11 del perfil EM-ARCH v2.2 | Conforme — conflicto cerrado |
| Impacto en código, migraciones o build | Ninguno — entrega 100% documental |

## 8. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin impacto — cambio documental |
| **Seguridad** | Indirecto positivo: el gate 7 (PII) y el 11 (citas) pasan a tener verificación nombrada; `[ESCALACIÓN DE SEGURIDAD]` queda articulado con `[ESCALACION AL CTO]` en vez de competir con él |
| **Escala** | Sin impacto |
| **Regulación** | Sin impacto |
| **Autoridad** | **No se mueve autoridad hacia ni desde el CTO** → no requiere ADR (§9). Sí toca gates y notación de RACI → requiere aprobación de EM-ARCH y registro en el informe vivo: ejecutado |

---

## 9. Lección de gobernanza

Los dos bloqueantes tienen la misma forma: **una regla del protocolo que contradice al repo que el protocolo gobierna**, no a otra regla. B-01 declaraba cerrada una lista de carpetas que el árbol real desmiente y que el gate de CI contradice; B-02 nombraba un ADR que no dice lo que se le atribuye. Ninguno de los dos se detecta releyendo el documento: solo aparecen al abrir el repo.

> **Regla derivada:** toda afirmación del protocolo sobre el estado del repo —carpetas, comandos, conteos, marcadores, número de tracks— es una **cita verificable**, y le aplica §7.4 igual que a una cita de ADR. Una lista "cerrada" que nadie contrastó contra `ls` es del mismo género que un ADR citado sin abrir.

Corolario práctico y ya aplicado: **cada gate ahora nombra su comando**. Una regla cuya verificación es ejecutable no puede divergir del repo en silencio — o el comando existe y corre, o falla y se ve. Es el patrón que ADR-056 estableció para las citas (`pnpm audit:adr-citations`) extendido al resto de la norma; en este repo, la diferencia entre una regla viva y una decorativa ha sido siempre si alguien podía correrla.
