# Plan de orquestación — MOD11: qué exige la OT para cerrarse

**Versión:** 1.0
**Estado:** **Aprobado y ejecutable (2026-09-14).** G1 cerrado con la aprobación del CTO de ADR-088 y de la spec; contratos de §2 congelados.
**Fecha:** 2026-09-14
**Emitido por:** AI-EM-ARCH

**Spec que ejecuta:** `docs/specs/2026-09-14-mod11-acta-instalacion-design.md` v1.0 (Propuesto)
**ADR que lo sostiene:** ADR-088
**Prompt de ejecución:** `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md`
**Prompt de lanzamiento:** `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-LAUNCH-v1.0.md`
**Plan hermano vigente:** `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.1 — **no se supera**: aquel arregló cómo se muestra el estado de cada requisito; este corrige qué requisitos debe haber.

---

## 1. Qué se está resolviendo

El checklist marcaba «Actividad de instalación → Cumplido» sobre una instalación no culminada. La causa no es el motor: el requisito `ACTIVITY` se satisface **registrando una nota de bitácora**, y su etiqueta prometía un resultado que su regla nunca comprobó.

De las tres condiciones que el CTO define para una instalación culminada, **solo una es representable hoy**. ADR-088 separa los dos hitos —OT cerrada e instalación culminada— para que la OT exija lo que el técnico sí controla, sin crear un ciclo de dependencia con un módulo que no existe.

## 2. Contratos congelados

**Congelados desde la aprobación del CTO del 2026-09-14.**

| Contrato | Ruta y versión | Dueño | Consumidores |
| --- | --- | --- | --- |
| Requisito `MATERIAL` con disposición | `packages/shared/src/contracts/operations/execution-orders.ts` **v1.1 → v1.2** | AI-SR-FULL | B1, B2, B3 |
| `INSTALACION_ESTANDAR` v2 | Spec §4.2, materializada como versión publicada | AI-EM-ARCH (definición) · AI-SR-FULL (publicación) | B2, B3 |

La ampliación del contrato es **aditiva y opcional**, por el mismo procedimiento que la v1.1: campo opcional, sin romper consumidores, historial en el docstring y re-sync notificado (protocolo §3bis regla 1).

## 3. Bloques y secuencia

### 3.1 Grafo

```
        [G1] aprobación del CTO de ADR-088 + spec   ← bloquea todo
                     │
        ┌────────────┴────────────┐
   B4 copy           B1 contrato + evaluador
   prod-ux                sr-backend
        └────────────┬────────────┘
                     │
              B2 plantilla v2 + política de migración
                     sr-backend
                     │
              B3 regresión
                   sr-qa
                     │
                   [G6]
```

**Camino crítico:** G1 → B1 → B2 → B3. B4 corre en paralelo con B1 y no depende de nada técnico.

**Tramos 2 y 3 no se planifican aquí**: sus condiciones de desbloqueo (spec §9) no se han cumplido, y planificar contra capacidades inexistentes produce trabajo que caduca.

### 3.2 Bloques

| # | Bloque | Alcance | Artefacto de salida | Stop/go |
| --- | --- | --- | --- | --- |
| **B1** | Contrato y evaluador | Ampliación aditiva del requisito `MATERIAL` con disposición; `evaluateMaterial` la exige cuando se declara; la disposición llega al contexto **en los dos call-sites** (progreso y cierre) | Contrato v1.2 + evaluador + tests unitarios | CA-01, CA-02, CA-03, CA-04 |
| **B2** | Plantilla v2 | Migración que publica `INSTALACION_ESTANDAR` v2 con los requisitos de spec §4.2; requisito de bitácora no requerido; **política de migración** de spec §4.4 | Migración + documento de política | CA-06, CA-07 |
| **B3** | Regresión | Los siete criterios de aceptación + no regresión sobre las suites vigentes | Suite + evidencia con conteo real | §6 |
| **B4** | Copy de requisitos | Etiquetas y razones de los cinco requisitos, que **no prometan lo que la regla no comprueba** (ADR-088 §D4) | Tabla cerrada de copy | Ninguna etiqueta afirma un resultado no verificado |

## 4. Matriz de dispatch (agente × skill)

Todas las skills verificadas contra disco con `ls .agents/skills/<nombre>/SKILL.md` (perfil §10.12).

| Bloque | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **B1** | `sr-backend` | `architect-review`, `nestjs-expert`, `typescript-expert`, `testing-patterns` | `postgresql` (solo si la consulta de consumos necesita proyección nueva) | `database-migration` — B1 no lleva DDL; `security-auditor` — sin ampliación de superficie (ADR-088 §Impacto) | `pnpm typecheck` · jest directo con `Cached: 0` |
| **B2** | `sr-backend` | `database-migration`, `postgresql`, `nestjs-expert` | `docs-architect` (para redactar la política de migración) | `architect-review` — la decisión ya está tomada en ADR-088, no se re-litiga en la migración | Migración aplicada y reversible (`down()` ejercitado) |
| **B3** | `sr-qa` | `testing-patterns`, `turborepo-caching`, `verification-before-completion` | `e2e-testing-patterns` (solo si el criterio CA-05 se verifica en navegador) | `playwright-skill` — no hay superficie de portal nueva en T1 | Conteo real por suite, sin `--passWithNoTests` |
| **B4** | `prod-ux` | `system-vocabulary-review` | `ui-ux-pro-max` (subordinada a los tokens y al contrato de componente, perfil Parte II regla 12) | `iwana-identity-ui-review` — T1 no cambia superficie visual, solo texto de requisitos | Texto en español, sentence case, sin enums crudos |

**`sec-eng` no recibe bloque en T1**: no hay ampliación de superficie. Entra en el tramo 2, cuando el contrato legal traiga datos del suscriptor.

## 5. RACI

| Bloque | R | A | C | I |
| --- | --- | --- | --- | --- |
| B1 | AI-SR-FULL | AI-EM-ARCH | AI-DATA-ENG | AI-FE-PLATFORM |
| B2 | AI-SR-FULL | AI-EM-ARCH | AI-DATA-ENG | AI-PLAT-OPS |
| B3 | AI-SR-QA | AI-EM-ARCH | — | todos |
| B4 | AI-PROD-UX | AI-EM-ARCH | AI-DS-OWNER | AI-FE-PLATFORM |

El aprobador de un gate nunca es el productor. **G1 lo cierra el CTO** al aprobar ADR-088 — no procede review cruzado porque hay ADR (protocolo §3).

## 6. Verificación

- **CA-01 / CA-02** — el endurecimiento rechaza un consumo devuelto a bodega y acepta uno instalado. **Ambos sentidos**: el arreglo ingenuo invierte el defecto en vez de cerrarlo.
- **CA-03** — un requisito `MATERIAL` sin disposición declarada se comporta como hoy: retrocompatible.
- **CA-04** — progreso y cierre dan el mismo resultado. Si la disposición solo llega a uno de los dos contextos, el checklist y el gate discrepan — el defecto que el trabajo previo ya corrigió una vez.
- **CA-05** — en `OTE-20260828-001` el requisito de equipos instalados aparece **pendiente**: no hay ningún consumo registrado en esa orden.
- **CA-06 / CA-07** — bitácora no requerida, y política de migración entregada.
- **Transversal** — conteo real por suite; `pnpm audit:adr-citations` y `pnpm audit:doc-locations` en `BLOQUEANTE: 0`.

## 7. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | La disposición se exige en el predicado pero no se transporta al contexto: el requisito queda **siempre** pendiente y se invierte el defecto | CA-02 y CA-04 lo cubren en los dos call-sites; el prompt de ejecución lo advierte antes de los pasos |
| R2 | Se publica la plantilla v2 sin el endurecimiento, o al revés: el criterio cambia sin que la definición lo acompañe | B1 y B2 son del mismo agente y entran juntos |
| R3 | Las OT vivas quedan con la definición v1 y conviven dos criterios sin que nadie lo sepa | La política de migración es entregable de B2, no una nota |
| R4 | Requisitos `MATERIAL` generalizados multiplican las consultas al catálogo de Inventario en cada `GET` del detalle | Medir antes de publicar la v2 en tenants con volumen (spec §6) |
| R5 | Se añade el contrato legal a la plantilla «ya que estamos» | Fuera de alcance por ADR-088 §D1: produciría OT incerrables |

## 8. Bloqueos abiertos

**Ninguno de gobierno.** G1 quedó cerrado el 2026-09-14 con la aprobación del CTO. Queda una **restricción de secuencia**: este tramo y el de línea de tiempo tocan ambos `execution-orders.service.ts` y **no se despachan en paralelo**.

## 9. Lanzamiento

**El archivo `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-LAUNCH-v1.0.md` es la fuente y prevalece si este espejo diverge.**

Ola 1 — B4 y B1 en paralelo; B2 al cerrar ambos; B3 al cerrar B2. **Lanzable.** No despachar a la vez que el tramo de línea de tiempo.

> Actúa como `prod-ux`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-acta-instalacion.md` y tu encargo `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md` §B4.
> Antes de escribir, lee el `SKILL.md` de: `system-vocabulary-review`.
> Alcance: solo las etiquetas y razones de los cinco requisitos. Fuera de alcance: código, tokens, layout.
> Cierras cuando ninguna etiqueta afirme un resultado que su regla no comprueba.

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-acta-instalacion.md` y tu encargo `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md` §B1.
> Antes de escribir código lee los `SKILL.md` de: `architect-review`, `nestjs-expert`, `typescript-expert`, `testing-patterns`.
> Consumes y amplías `packages/shared/src/contracts/operations/execution-orders.ts` v1.1 → v1.2: solo la ampliación autorizada; cualquier otro cambio es `[BLOQUEO]`.
> Alcance: solo B1. Fuera de alcance: migración de plantilla (B2), portal, contrato legal.
> Cierras cuando CA-01 a CA-04 pasen con conteo real. Reporta entregables con ruta, evidencia y deuda por severidad.
