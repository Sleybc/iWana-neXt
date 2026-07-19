# ADR-056: Integridad de la base normativa de diseño

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-19
**Modo activo:** Architect + Orchestrator
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano (2026-07-19)
**Sustituye/enmienda:** [ADR-023](ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) (estado), [ADR-049](ADR-049-Split-Design-Layer-Frontend-Platform.md) §Decisión (definición de Estrella Polar), [Protocolo_Colaboracion_Multiagente_v1.md](../roles/Protocolo_Colaboracion_Multiagente_v1.md) §5.4 y §7.4

---

## Contexto

Una auditoría de la skill `iwana-identity-ui-review` (2026-07-19) destapó cuatro citas normativas defectuosas en la capa de diseño:

| # | Defecto | Evidencia |
| --- | --- | --- |
| 1 | **ADR-023 nunca fue aprobado** — estado "En revisión" desde 2026-03-13, pero citado como autoridad vigente por ADR-049 (aprobado) y por los perfiles DS-OWNER, PROD-UX, FE-PLATFORM y SR-QA, cuyas cadenas de precedencia dicen literalmente "ADRs aprobados (incl. ADR-023)" | `docs/adrs/ADR-023-*.md` cabecera |
| 2 | **ADR-026 citado como fuente de la norma dark** en la spec Firma §1 (×2) y §4/1.2. ADR-026 es "Consolidación del Pipeline CRM de 12 a 8 Estados"; **ningún ADR menciona `dark-surface`** | `grep -ril "dark-surface" docs/adrs/` → vacío |
| 3 | **ADR-049 define la Estrella Polar sin la spec Firma** (ADR-049 es del 2026-07-10; la spec del 2026-07-12). DS-OWNER y PROD-UX parchearon sus cabeceras; FE-PLATFORM y SR-QA no. SR-QA audita "desviación visual frente a Estrella Polar" contra una definición que excluye los 9 elementos de firma | `ADR-049` §Decisión; `Perfil_IA_Sr_Dev_QA_Testing_v1.md` |
| 4 | **La cadena canónica §5.4 no tiene casilla para las fuentes de diseño** (identidad, prototipo, spec Firma, tokens). DS-OWNER y PROD-UX las insertaron en el nivel 4, desplazando el protocolo al 5; FE-PLATFORM siguió la cadena literal. Tres perfiles, tres precedencias | Protocolo §5.4; §6 de los tres perfiles |

### Causa raíz

El protocolo §7.4 exige que los agentes *"citan artefactos reales (ruta de archivo, ADR, sección de PRD)"*. **Los cuatro defectos cumplen esa regla.** ADR-026 y ADR-023 son artefactos reales. La regla exige que la cita **exista**; no exige que **diga lo que se afirma** ni que esté **aprobada**.

No son cuatro incidentes: son cuatro síntomas de una regla con un hueco. Corregirlos por separado deja la ventana abierta.

## Decisión

Se resuelven los cuatro en lote, cerrando además la causa raíz.

### 1. Estado de ADR-023

ADR-023 pasa a **Aprobado** con fecha de esta decisión, sin cambios de contenido. Su contenido lleva cuatro meses operando de facto: es la base del stack frontend (Next.js App Router + Tailwind v4 + shadcn/ui), de las reglas de qué tomar y qué no de TailAdmin, y de un ADR aprobado (049) que descansa sobre él.

Se descarta degradar las citas: obligaría a reescribir cuatro perfiles y ADR-049 para eliminar una dependencia que en la práctica ya es normativa.

### 2. Formalización de la norma dark

Se eleva a norma con ADR la escala dark hoy huérfana, tal como vive en `packages/ui/src/styles/globals.css` L121-124:

- `--color-dark-surface` `#181818` · `-2` `#222222` · `-3` `#2A2A2A` · `-4` `#333333`
- `--color-dark-border` y `--color-dark-border-2`

**Regla:** `dark:bg-gray-{700-950}` queda prohibido en código nuevo; la remediación del código existente sigue el plan de la spec Firma §4 ítem 1.2. La fuente de verdad de los valores son los tokens; este ADR los declara normativos, no los duplica como autoridad paralela.

#### Emparejamiento obligatorio — resuelve la condición de contraste

> **Condición levantada (2026-07-19).** AI-DS-OWNER respondió la consulta bloqueante con veredicto **(b) cumple con salvedades**. Hallazgo de encuadre: *el contraste es propiedad de un par, no de un valor*. **Las cuatro superficies y los dos bordes se congelan sin cambios** — ninguno está mal. El defecto era que la norma nombraba superficies y **nunca decía qué puede posarse encima**, y el código rellenó ese hueco con lo que tenía a mano.

Las cuatro reglas siguientes completan la norma. Todas se expresan con **tokens ya existentes**: cero valores nuevos, cero migración de superficies. Ratificadas por DS-OWNER en carril rápido (contrato de tokens, sin alcance funcional).

| # | Regla | Fundamento |
| --- | --- | --- |
| 1 | **Texto sobre dark:** permitido `#F0F0F0` (base) e `iwana-neutral-400` o más claro. **Prohibidos** `iwana-neutral-700` y `gray-500`/`gray-600` en toda superficie; `iwana-neutral-600` prohibido sobre `dark-surface-3` y `-4` | El par base `#F0F0F0` va de 11.09:1 a 15.58:1 — holgura AAA. `neutral-700` cae a 2.51-3.53:1 |
| 2 | **Lima sobre dark — la regla se invierte:** `iwana-secondary-700` es **exclusiva de claro**. En dark el mínimo es **`-400`** (7.75:1 en el peor caso). `-600` prohibido sobre `dark-surface-4`. Formulación: *claro → `-700` o más oscuro; dark → `-400` o más claro* | `-700` sobre dark falla en las **cuatro** superficies (2.66-3.73:1) |
| 3 | **Bordes:** `dark-border`/`dark-border-2` son **divisores decorativos**, nunca el único identificador de un control. Un input o botón cuyo límite dependa del borde usa **`iwana-neutral-600`** (≥3.66:1 en las cuatro) | `dark-border` sobre `surface-3` = **1.06:1**. Falla 1.4.11 |
| 4 | **Semánticos:** `error` e `info` requieren su tono `-400` sobre `dark-surface-3` y `-4` | Base cae a 3.36-3.90:1. `success` y `warning` pasan en las cuatro |

**Nota no bloqueante:** la separación entre superficies adyacentes es 1.11-1.14 — escala perceptualmente muy plana. No es fallo WCAG (la elevación decorativa está exenta), pero conviene revisarlo si la jerarquía visual en dark resulta ilegible.

### 3. Definición canónica de Estrella Polar — tres dominios de autoridad

Se reemplaza la definición de ADR-049 §Decisión. La Estrella Polar **no es una jerarquía lineal**: cada capa manda sobre una pregunta distinta.

| Capa | Artefacto | Manda sobre |
| --- | --- | --- |
| **Código real** | `packages/ui/src/styles/globals.css` → `@iwana/ui` → `portal-ui.tsx` | **Qué existe y con qué valor.** En conflicto sobre un token, mandan los tokens y se documenta la divergencia (spec Firma §8). Nunca se cita un token sin verificarlo aquí |
| **Spec Firma iWana** | `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` | **Qué se debe construir y hacia dónde.** Los 9 elementos de firma, el plan por fases y la síntesis de referentes 2025-2026. Complementa, no reemplaza, al manual de identidad |
| **Base de identidad** | `docs/identity/` + `docs/prototipo/` (incl. `tailadmin/`) | **Qué es la marca.** ADR-023 gobierna qué se toma del prototipo y de TailAdmin |

Esta definición sustituye la de ADR-049 en todo artefacto que la cite. **Los valores de marca se citan por token, nunca por hex duplicado** — regla que ADR-049 §Decisión incumple hoy al escribir `#17163A` y `#A5C330`; queda corregida por esta enmienda.

### 4. Cadena canónica con casilla de diseño

El protocolo §5.4 pasa a:

```
AGENTS.md → CTO/ADRs aprobados → PRD → HLD →
fuentes de diseño (Estrella Polar, según los 3 dominios de §3) →
este protocolo → perfil individual → prompt de ejecución
```

Los perfiles DS-OWNER, PROD-UX, FE-PLATFORM y SR-QA alinean su §6 a esta cadena. Queda resuelta la improvisación: las fuentes de diseño tienen lugar propio y ya no compiten con el protocolo.

### 5. Endurecimiento de §7.4 (causa raíz)

La regla anti-alucinación §7.4 pasa a exigir:

> Los agentes citan artefactos reales **y verificados**: antes de citar, se abre el artefacto y se comprueba que **dice lo que se afirma**. Un ADR solo confiere autoridad si su estado es **Aprobado**. Una cita no verificada no confiere autoridad; ante duda, la afirmación se declara supuesto.

**Gate operativo:** una cita normativa nueva en un artefacto de fase es verificable por el revisor del gate. Una cita que no resiste apertura es defecto bloqueante, no observación.

## Consecuencias

**Positivas**
- Los cuatro defectos quedan cerrados con un solo acto de aprobación.
- SR-QA y FE-PLATFORM recuperan puntero normativo a la dirección visual vigente; se cierra la asimetría entre quienes deciden y quienes implementan/verifican.
- La causa raíz queda tapada: el quinto caso se detecta en el gate, no en una auditoría meses después.
- Deja de haber dos artefactos contradictorios vigentes sobre qué es la Estrella Polar.

**Negativas / costo**
- Obliga a editar cuatro perfiles vigentes (§6 de cada uno) y ADR-049. Trabajo documental, sin impacto en código.
- §7.4 endurecido añade fricción de verificación al gate. Es el costo deliberado de la decisión.

**Riesgos**
- Aprobar ADR-023 sin revisión de contenido asume que cuatro meses de uso de facto lo validan. **Mitigación:** su contenido ya fue auditado indirectamente por la spec Firma, que lo toma como base y lo restringe (§5 lista explícita de qué no copiar de TailAdmin).
- Si la consulta de contraste AA sobre `dark-surface-*` falla, el punto 2 se reabre. **Mitigación:** declarado condicionado arriba; no bloquea los otros cuatro puntos.

## Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin impacto — decisión documental |
| **Seguridad** | Sin impacto |
| **Escala** | Sin impacto |
| **Regulación** | Sin impacto. Nota: WCAG 2.2 AA sigue siendo criterio de diseño; el punto 2 queda condicionado a su verificación |

## Alternativas descartadas

| Alternativa | Motivo del descarte |
| --- | --- |
| **A — Parche mínimo:** aprobar ADR-023 y corregir citas una por una | No cierra la causa raíz; el quinto caso reaparece en el próximo sprint |
| **C — Congelar UI y auditar todas las citas del repo primero** | Costo desproporcionado: bloquea Fase 1.2 en curso por un defecto documental que no produce fallos en producción |

## Plan de ejecución

| # | Acción | Responsable | Estado |
| --- | --- | --- | --- |
| 1 | Errata de las 3 citas de ADR-026 en la spec Firma | AI-EM-ARCH | **Hecho** (2026-07-19, nota al pie en la spec) |
| 2 | Orden de bloqueo: prohibido citar ADR-026 como autoridad dark | AI-EM-ARCH | **Hecho** — vigente desde 2026-07-19 |
| 3 | Cambiar estado de ADR-023 a Aprobado | CTO | **Hecho** (2026-07-19) |
| 4 | Enmendar ADR-049 §Decisión con la definición de 3 dominios | AI-EM-ARCH | **Hecho** — nota de enmienda + tabla de dominios; hex de marca eliminados |
| 5 | Alinear §6 de DS-OWNER, PROD-UX, FE-PLATFORM, SR-QA | AI-EM-ARCH | **Hecho** — cadena única de 8 niveles; cabeceras de FE-PLATFORM y SR-QA ahora citan la spec Firma |
| 6 | Actualizar protocolo §5.4 y §7.4 | AI-EM-ARCH | **Hecho** |
| 7 | Consulta bloqueante de contraste AA sobre `dark-surface-*` | AI-DS-OWNER | **Resuelta** (2026-07-19) — veredicto (b): superficies se congelan sin cambios; §2 ampliado con las 4 reglas de emparejamiento. Deuda de código derivada → spec Firma §4 ítem 1.2bis |
| 8 | Añadir "neubrutalismo" a spec Firma §5 (ratificado por DS-OWNER) | AI-EM-ARCH | **Hecho** |

**Estado del ADR:** ejecutado salvo el punto 7, que no bloquea a los demás. SR-QA incorpora además el barrido mecánico `audit-ui.mjs` como evidencia previa de regresión visual (mejora derivada, sin cambio de contrato).

---

## Ampliación 2026-07-19 — el defecto excedía la capa de diseño

La auditoría de verificación encargada a AI-SR-QA tras aprobar este ADR (892 citas revisadas en `docs/prds`, `docs/hlds`, `docs/prompts`, `docs/informes`, `.agents/skills`) demostró que el defecto **no era del Design Layer**: es repo-wide. Hallazgos y remediación autorizada por el CTO el mismo día.

**Causa probable identificada (hipótesis de SR-QA, no confirmada):** desplazamiento de numeración `010 → 026`. El PRD maestro §14.6 tiene un *ADR-010: Design System iWana sobre shadcn/ui* — exactamente lo que se atribuía falsamente a ADR-026. Explica que el error reapareciera de forma independiente en HLD, informe y skill.

| # | Hallazgo | Remediación aplicada |
| --- | --- | --- |
| 9 | **ADR-022 Propuesto con 91 citas** — gobierna la cadencia de fases de todo el programa y cimenta la regla de completitud que autoriza las fases activas de MOD12 | **Aprobado** por el CTO 2026-07-19, sin cambios de contenido |
| 10 | ADR-025 Propuesto (37 citas, modelo Subscriber ya implementado) | **Aprobado**, sin cambios |
| 11 | ADR-042 Propuesto (11 citas, funcionalidad entregada en MOD00) | **Aprobado**, sin cambios; corregido `INFORME-MOD00:77` que lo declaraba Aprobado contradiciendo a `:432/:458/:481` |
| 12 | **Doble numeración de ADR viva** — ADR-001…015 no existen como archivo (son §14.6 del PRD maestro, sin estado); **ADR-016 colisiona** entre `docs/adrs/` (Cierre MOD01) y el PRD (Estrategia Modular). Toda cita `ADR-0NN` con NN ≤ 026 era ambigua por construcción | Resuelto **en las dos fuentes**, no en los ~20 sitios de llamada: nota de espacio de numeración histórico en PRD §14.6; entrada ADR-016 del PRD marcada **Superada por ADR-022**; nota de desambiguación en `ADR-016-Cierre-MOD01-Produccion.md`. Las citas de *"regla de completitud (ADR-016)"* resuelven ahora inequívocamente a **ADR-022** |
| 13 | Riesgo "migración 013 no reversible" — reportado inicialmente como *cita falsa* a ADR-026 | **Corregido el propio hallazgo:** la cita **era correcta**. ADR-026 §Plan de migración contiene el mapeo completo y `013_consolidate_expediente_pipeline.ts` lo referencia en su encabezado. SR-QA clasificó por ausencia de palabras clave sin abrir esa sección, y AI-EM-ARCH lo propagó. **El defecto real era el `throw` incondicional de `down()`**, que incumple el merge gate de `AGENTS.md` sobre migraciones reversibles sin ADR que ampare la excepción. **CTO decidió corregir, no aceptar** → migración reparada por AI-SR-FULL (captura previa + `down()` de tres ramas); ver `INFORME-MOD05-SUBSCRIBERS-FASE-01:196` para el estado y el residual |
| 14 | `scripts/audit-ui.mjs:41` emitía `(ADR-026)` en **cada hallazgo generado** — único sitio que fabricaba citas falsas nuevas | Corregido a `ADR-056 §2`. La remediación previa había tocado prosa y no código |

**Correcciones puntuales adicionales:** `core-components/SKILL.md:24` (ADR-026 → ADR-023), `INFORME-MOD01-SCAFFOLD:171`, `INFORME-SISTEMA-SKILLS:640`.

### Cierre completo — autorizado por el CTO 2026-07-19

| # | Hallazgo | Resolución |
| --- | --- | --- |
| 15 | `HLD-MOD02-ARQUITECTURA:353-355` — tabla de trazabilidad con tres filas falsas | Resuelta entera. `ADR-026 → ADR-023` (shadcn); las otras dos degradadas a `_sin ADR_` porque **no existe autoridad**: verificado que ningún ADR menciona `react-hook-form`, y que las menciones de Zod en ADRs son **validación backend en boundaries HTTP**, decisión distinta del stack de formularios de frontend |
| 16 | Atribuciones sin autoridad identificable | Degradadas a `_sin ADR_` con la razón explícita, no inventadas: `frontend-dev-guidelines/SKILL.md:218` (auth híbrida) y `HLD-MOD01:1014` (ADR-018 no menciona `platform_users`; es "Ciclo de Vida del Tenant") |
| 17 | Cabeceras "ADRs aplicables" de la cadena MOD02 (4 sitios propagados PRD→HLD→PROMPT) | ADR-026 retirado de las cuatro con comentario de trazabilidad. Sin pérdida de autoridad: **ADR-023 ya estaba en las cuatro listas** |
| 18 | `ADR-021` Propuesto con 6 citas | **No se aprueba — se marca Superado.** ADR-049 (Aprobado 2026-07-10) ya declaró vigente el perfil v2 y el v1 de ADR-021 como referencia histórica. Aprobarlo habría resucitado una decisión sucedida |
| 19 | `ADR-043` con estado "Aceptado", fuera del vocabulario canónico | Normalizado a **Aprobado**, sin cambio de contenido ni fecha |

**Vocabulario canónico de estado (§7.4):** `Aprobado` · `En revisión` · `Propuesto` · `Superado`.

**Estado final del índice:** **41 ADRs numerados** (016–056) + `ADR-INV-SKU-COMPUESTO-v1.md`, que no sigue el patrón `ADR-\d{3}` y por tanto **no es citable por número**. Ninguno pendiente: 40 Aprobado + 1 Superado (021).

> Corrección: una versión previa de este ADR declaraba "37 ADRs". El conteo salía de un grep que solo cubría dos de los **tres** formatos de estado (ver abajo) y omitía cinco archivos. Detectado por AI-PLAT-OPS al construir el gate.

**Tres formatos de declaración de estado conviven** (no dos, como se creyó al encargar el gate). Un validador que lea menos de los tres produce falsos positivos masivos:

| Formato | Archivos | Tráfico de citas |
| --- | --- | --- |
| `**Estado:** Aprobado` | mayoría | — |
| `status: "Aprobado"` (frontmatter YAML) | ADR-028, 029, 030, 031, 036 | bajo |
| `> **Estado:** Aprobado` (blockquote) | **ADR-016…020** | **~400 citas** (016→109, 019→92, 018→85, 017→60, 020→56) |

El tercero es el crítico: son los cinco ADRs más citados del repo. Un gate construido sobre los dos formatos documentados habría dejado CI en rojo en el primer push.

### Segunda pasada — cobertura cerrada y corrección del método (2026-07-19)

Las ~180 citas declaradas sin cubrir se auditaron con apertura de artefacto. **Cobertura: 100%.**

#### Corrección de método — regla derivada, aplicable a toda auditoría futura

La primera pasada produjo **dos falsos hallazgos** (migración 013 → ADR-026; cache Redis → "sin autoridad"). Diagnóstico de AI-SR-QA:

> Asumí que la sustancia de un ADR vive en **título + §Decisión**, y traté §Consecuencias, §Riesgos y §Plan de migración como apéndices.

En este repo las decisiones operativas se documentan precisamente ahí: el mapeo de la migración estaba en **ADR-026 §Plan de migración**; el cache de tenant, en **ADR-018 §Consecuencias → Cache Redis** (con el TTL de 5 min literal).

**Regla incorporada al método de auditoría:**

> **Negar exige el índice completo del archivo; afirmar solo exige la sección que lo respalda.** Una afirmación de que un ADR *no* cubre X requiere haber recorrido todas sus secciones. Formulable como criterio verificable en el gate de CI.

Corolario operativo, aprendido de dos falsos positivos evitados en la segunda pasada: **una cita de estado obsoleto dentro de una narrativa histórica cerrada no es defecto.** `INFORME-MOD11-*:95` ("ADR-046 Propuesto") es una celda de tabla *Bloqueante/Resolución* cuya celda contigua lo declara resuelto. El criterio es si la frase es **prospectiva** (defecto) o **cronológica cerrada** (correcta).

#### Defectos de la segunda pasada — todos remediados

| # | Sitio | Defecto | Resolución |
| --- | --- | --- | --- |
| N1-N4 | `INFORME-MOD01-SCAFFOLD:167-171` | **Desplazamiento en bloque**: cinco líneas consecutivas escritas contra la numeración histórica del PRD §14.6, nunca remapeadas. La corrección previa de `:171` trató el síntoma visible y **generó un ADR-023 duplicado** en el mismo bloque | Bloque remapeado entero: dos líneas a `_sin ADR vigente_` (PRD §14.6), BullMQ → **ADR-017**, auth híbrida → `_sin ADR_` |
| N5 | `AUDITORIA-PRD-MOD01-GAPS:216` | Gate de DoD **G4-05** apoyado en **dos anclas inexistentes**: ADR-025 (es el modelo Subscriber) y `HLD-MOD01-Frontend-Auth-Zod-Schemas-Spec.md`, **archivo fantasma** (`find docs -iname "*Zod*"` → vacío) | Marcado **no exigible** como incumplimiento normativo; si debe ser vinculante requiere ADR propio |
| — | `PRD-MOD01-*:134` y `:147` (×2 archivos) | ADR-003 (inexistente) citado para JTI blacklist y cache de tenant | Reanclados a **ADR-019 §6** ("JTI Blacklist en Redis") y **ADR-018 §Cache Redis**, ambos verificados literalmente |
| N6 | `INFORME-SISTEMA-SKILLS:619` | **Remediación previa incompleta**: `:640` se corrigió a ADR-056, `:619` quedó con ADR-026 | Corregido |
| N7 | `INFORME-MOD00-*:1524` | Propone crear `ADR-046-Normalizacion-Tokens-Visuales-Settings`; **ADR-046 ya existe** (Bounded Context Tasks, Aprobado) | Marcada como propuesta huérfana con número ocupado: renumerar o cerrar |
| N8 | `INFORME-ROLES-REFACTOR-FRONTEND:361` | Describe ADR-049 como borrador "pendiente de aprobación"; está Aprobado desde 2026-07-10 | Actualizado |
| N9 | `INFORME-ROLES-ECOSISTEMA:54` | Propone actualizar ADR-021, que quedó **Superado** | Marcado resuelto por ADR-049 |
| — | `ADR-023` cuerpo L131-133 | **Contradicción interna causada por esta misma remediación**: la cabecera pasó a Aprobado pero §Estado de aprobacion seguía diciendo `[ESCALACION AL CTO]`. Un lector que abra la sección de estado —el comportamiento que §7.4 exige— obtenía la respuesta contraria | Cuerpo alineado con la cabecera |

**Patrón P6 — desplazamiento en bloque.** Los defectos de numeración no son puntuales: aparecen en bloques contiguos escritos contra el registro histórico del PRD §14.6 y nunca remapeados. Se corrigen **como bloque**; parchear una línea suelta genera duplicados. Ocurrió en `HLD-MOD02:353-355` y en `INFORME-MOD01-SCAFFOLD:167-171`.

**Lección de gobernanza:** tres de los defectos de esta segunda pasada (N6, el bloque de SCAFFOLD y la contradicción de ADR-023) fueron **causados o dejados a medias por la remediación del mismo día**. Una corrección parcial de una cita es tan defectuosa como la cita original, y más peligrosa porque aparenta estar cerrada.

### Cierre derivado — reversibilidad de migraciones tenant (2026-07-19)

El hallazgo 13 destapó que **dos de las 74 migraciones tenant tenían `down()` que lanzaba incondicionalmente**, incumpliendo el merge gate de `AGENTS.md` sin ADR que amparara la excepción. El CTO decidió **corregir, no aceptar**. Ambas reparadas por AI-SR-FULL; ninguna migración tenant queda hoy con `down()` que lance sin condición.

| Migración | Naturaleza | Solución |
| --- | --- | --- |
| `013_consolidate_expediente_pipeline` | `up()` **transforma datos** (12→8 estados) y la información original se pierde | Captura previa de `expediente_records` **y** `status_changes` en tabla de respaldo del schema; `down()` de tres ramas: restaura / completa limpio si no hay nada que revertir / falla solo ante transformación sin captura |
| `000_initial_tenant_schema` | `up()` **crea estructura vacía** (6 tablas, 17 índices, RLS + política + REVOKE sobre `audit_logs`) | `down()` elimina en orden inverso, sin `CASCADE` (una dependencia futura debe fallar ruidosamente, no arrastrar objetos ajenos). Guarda: rechaza si hay filas, salvo `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` |

**Doctrina establecida — qué significa "reversible" cuando `up()` crea estructura vacía.** EM-ARCH planteó que una guarda por datos podría volver la migración *efectivamente* irreversible y por tanto no cumplir el gate. AI-SR-FULL lo refutó, y su argumento queda como criterio:

> `up()` crea tablas **vacías**. Revertir `up()` es, con exactitud, volver a un schema sin esas tablas vacías. Si a estas alturas contienen filas, esas filas no las creó `up()` — las creó la operación del tenant. Borrarlas no es revertir la migración: es destruir el tenant. La guarda **no obstaculiza** la reversibilidad, **la enuncia con precisión**: `down()` revierte `up()` exactamente, y se niega a destruir además lo que `up()` nunca hizo.

El gate exige revertir la creación de estructura; nunca pidió aniquilar un tenant poblado. Que en la práctica todo tenant provisionado tenga filas (admin sembrado) y exija el flag es el resultado buscado: es exactamente cuándo alguien debe declarar su intención por escrito.

**Contexto de riesgo verificado:** hoy **ningún camino cableado invoca `down()` de una migración tenant** — `runner.ts` es solo-up y `migration:revert` apunta a `dist/migrations/public/*.js`. El disparo accidental es prospectivo. `provisioning rollback` (`TenantProvisioningProcessor.rollbackProvisioning`) y `TenantSchemaPurgeProcessor` operan a granularidad de *schema* sobre tenants fallidos o dados de baja (ADR-033): son ortogonales a estos `down()`, no compiten.

**Residual declarado — no verificado:**

1. **Sin PostgreSQL real** en el entorno de corrección. Los tests ejercitan la **lógica de ramificación** y las sentencias emitidas, **no** la semántica SQL contra un motor. Un `DROP TABLE` que fallara por una dependencia no anticipada no se detectaría.
2. **Ciclo `up()` → `down()` → `up()` end-to-end** sobre un schema real: sin verificar.
3. **La ausencia de FKs se apoya en grep** sobre las 74 migraciones, no en `pg_constraint` de una base viva.
4. **Schemas donde la 013 ya corrió con la versión antigua** siguen sin respaldo y no tienen arreglo desde una migración.

### Cierre de residuales — 2026-07-19 (sistema fuera de producción)

Autorización del CTO: *"el sistema no está en producción, puedes eliminar lo necesario para que no queden residuos"*.

#### Falso positivo eliminado — `down()` ya no falla nunca

`tenant_iwana` (único schema tenant del entorno, verificado contra la base real antes de que el daemon de Docker se cayera) tiene la 013 aplicada **sin tabla de respaldo** (versión antigua), **1 fila** en `expediente_records` y **0 filas en estados eliminados**. La lógica anterior lo habría rechazado alegando "transformación sin captura" cuando lo ocurrido fue que la 013 corrió como no-op y el dato llegó después.

**Análisis que resuelve el caso:** tras un `up()` exitoso quedan cero filas en estados eliminados **por definición**. Ningún dato de la base distingue *"transformó filas"* de *"no había filas que transformar"* — el único discriminante posible era la tabla de respaldo. La versión anterior contaba el **total** de filas del pipeline y fallaba si era > 0, lo que producía el falso positivo en **todo tenant provisionado tras la consolidación**.

Diseño resultante, sin rama de fallo:

| Estado | `down()` |
| --- | --- |
| Respaldo con filas | Restaura los valores originales y elimina la tabla |
| Sin tabla de respaldo | Retorna limpio — la ausencia significa siempre "nada que revertir" |

Además `up()` **elimina la tabla de respaldo si quedó vacía**, que es el caso normal: no deja residuo en el schema, y su ausencia pasa a ser la señal correcta para `down()`. Tests: 20 en verde (los 3 que afirmaban el `throw` fueron sustituidos por 5 del comportamiento nuevo).

#### Hallazgo crítico — los tests estaban validando código obsoleto

Al eliminar la rama de fallo, los tests que la afirmaban **seguían pasando**. Causa:

```
packages/database/src/migrations/tenant/013_consolidate_expediente_pipeline.js   ← compilado stale
packages/database/src/migrations/tenant/013_consolidate_expediente_pipeline.ts   ← el fuente editado
```

Los specs importan sin extensión y los tres `jest.config.js` declaraban `moduleFileExtensions: ['js', 'json', 'ts']` — **`js` antes que `ts`**. Jest resolvía al artefacto compilado y **los tests validaban una versión anterior del código**, en silencio y con `--no-cache`.

Agravante: `.gitignore` ya tenía desde antes una sección *"Artefactos de compilacion que no deben contaminar src/"* (líneas 67-74) que los ignoraba. **Ignorarlos los hizo invisibles a `git status` sin desactivarlos en la resolución de módulos** — la mitigación existente ocultaba el problema en lugar de resolverlo.

Correcciones aplicadas:

1. **8 artefactos eliminados** de `packages/*/src` (4 de `013_consolidate_expediente_pipeline`, 4 de `supplier-profile.entity`). Ninguno estaba trackeado.
2. **`moduleFileExtensions` invertido a `['ts', 'js', 'json']`** en `apps/api`, `apps/worker` y `packages/shared`, con la razón documentada en el config. Un `.js` stale ya no puede eclipsar al fuente.

Verificación tras ambos cambios: `apps/api` **1628 tests / 161 suites**, `apps/worker` 33, `packages/shared` 4, `@iwana/db typecheck` limpio. Esta es la primera medición fiable de la suite desde que existían los artefactos.

**Lección:** las tres cifras de cobertura reportadas antes de este hallazgo se midieron contra código parcialmente obsoleto. No eran falsas de mala fe — eran *no verificables*, que es el mismo defecto que ADR-056 persigue en la documentación, manifestado en la cadena de build.

#### Residuales 1-3: **CERRADOS** contra PostgreSQL real

Verificación ejecutada el 2026-07-19 con `iwana_postgres_dev` sano, sobre **schemas desechables** (`tenant_migtest_*`), eliminados al terminar. `tenant_iwana` **no se tocó** — confirmado tras la ejecución: 1 fila intacta, sin tabla de respaldo, sin schemas huérfanos.

Método: las **clases reales** de las migraciones 000, 001 y 013 se compilaron desde `src/` y se ejecutaron contra un adaptador `pg` que implementa la superficie `queryRunner.query()`. No se transcribió SQL — se verificó el código que corre en producción.

**Migración 013 — 11/11 PASS (exit 0)**

| Verificación | Resultado |
| --- | --- |
| `001.up()` y `013.up()` ejecutan contra el motor sin error | PASS |
| `up()` consolida: cero filas en estados eliminados | PASS |
| `up()` captura el respaldo (6 filas: 5 expedientes + 1 status_change) | PASS |
| `down()` ejecuta sin error | PASS |
| **`down()` restaura `expediente_records` con los valores originales exactos** | PASS |
| **`down()` restaura `status_changes` con los valores originales exactos** | PASS |
| `down()` elimina la tabla de respaldo tras restaurar | PASS |
| **Ciclo `up()` → `down()` → `up()` completo y consistente** | PASS |
| `up()` sin datos no deja tabla de respaldo (sin residuo) | PASS |
| `down()` sin respaldo retorna limpio (falso positivo eliminado) | PASS |

**Migración 000 — 10/10 PASS (exit 0)**

Crea las 6 tablas · `audit_logs` con RLS habilitada · `down()` sin error sobre tablas vacías y sin flag · elimina las 6 tablas · **no elimina el schema** (eso es del provisioning) · ciclo `up()→down()→up()` completo · **guarda: rechaza con datos y sin flag, sin borrar nada** · **escape hatch: con `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` procede**.

**Residual 3 — FKs contra `pg_constraint` de base viva:** consulta sobre `tenant_iwana` filtrando `contype='f'` contra las 6 tablas de la 000 → **`SIN_FK`**, exit 0. Confirma la conclusión previa de SR-FULL obtenida por grep: el orden inverso de drop basta y `CASCADE` es innecesario.

> **Nota de método — el mismo defecto, en shell.** Dos comandos de verificación de esta sesión produjeron falsa confianza: uno terminaba en `echo "(vacio = ninguna FK)"` incondicional y lo imprimió aunque `psql` había fallado con el daemon caído; otro leía `$?` después de un `| tail`, midiendo el exit de `tail` y no del script. Ambos **parecían verificaciones exitosas**. Es el patrón de ADR-026 expresado en la cadena de herramientas: una afirmación con forma de evidencia que no la respalda. Las verificaciones definitivas de arriba capturan el exit real del proceso.

**Seguimiento para PLAT-OPS:** cuando se cablee un runner de revert tenant, debe exponer el requisito de `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` de forma visible en su ayuda.

### Prevención — gate de CI activo (2026-07-19)

`pnpm audit:adr-citations` (`scripts/audit-adr-citations.mjs`, Node puro sin dependencias nuevas) valida cada `ADR-\d{3}` en `docs/**` y `.agents/skills/**`. Job `adr-citations` en `.github/workflows/ci.yml`, **bloqueante**. Estado: `BLOQUEANTE: 0 · AVISO: 106`, determinista en ejecuciones consecutivas.

| Check | Tipo | Severidad |
| --- | --- | --- |
| (a) Existe el archivo del ADR | Determinista | Bloqueante |
| (b) Estado `Aprobado`, salvo marcador de cita histórica | Determinista | Bloqueante |
| (c) Correspondencia entre atribución inline y contenido | Heurístico | Aviso |
| Espacio histórico ADR-001…015 (PRD §14.6) | Determinista | Aviso deliberado — 104 casos |

**Convención de cita histórica** (protocolo §7.4): un ADR no aprobado citado **sin** marcador `(superado)` / `(propuesto)` / `(en revisión)` bloquea. Formas aceptadas: marcador adyacente, dentro del mismo paréntesis (`(ADR-021, superado)` — añadida por PLAT-OPS porque la prosa real la exige), o tras enlace markdown. El marcador se liga a *su* cita, no a la lista: verificado con fixture que en `ADR-021, ADR-022 (superado)` el marcador **no** cubre a ADR-021.

**Trampa de diseño detectada y corregida:** la primera versión del validador contaba las citas dentro de comentarios HTML — los mismos con que se documenta cada retiro. Efecto perverso: **documentar bien una remediación volvía a disparar el bloqueante recién cerrado**, incentivando remediar en silencio. Los comentarios se eliminan antes de buscar citas.

**Valor demostrado del check heurístico (c):** encontró `ADR-032` atribuyendo a *"ADR-031 §D6 (cutover checklist)"* algo que §D6 no dice —§D6 es "Territoriales manuales por tenant en v1"— y un artefacto, el "cutover checklist", que no existe en ADR-031. Corresponde a **§D8**. **La auditoría manual de 892 citas no lo marcó.** Justifica mantener (c) pese a sus falsos positivos.

## Referencias

- `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` — nota al pie `[^adr026]`
- `packages/ui/src/styles/globals.css` L121-124 — tokens dark
- `.agents/skills/iwana-identity-ui-review/references/prototype-map.md` — definición operativa de los 3 dominios
- `.agents/skills/iwana-identity-ui-review/references/trends-2026.md` — cabecera con la regla de contenido y el caso ADR-026
- Dictamen AI-DS-OWNER 2026-07-19 (carril rápido) — clasificación de 21 tendencias, hallazgos de ancla
