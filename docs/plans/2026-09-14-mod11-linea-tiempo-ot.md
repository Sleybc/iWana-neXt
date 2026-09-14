# Plan de orquestación — MOD11: línea de tiempo de la OT

**Versión:** 1.0
**Estado:** **Aprobado (2026-09-14).** G1 cerrado. **Ejecutable después del tramo de acta de instalación**: ambos tocan el servicio de OT y no admiten dos dueños.
**Fecha:** 2026-09-14
**Emitido por:** AI-EM-ARCH

**Spec que ejecuta:** `docs/specs/2026-09-14-mod11-linea-tiempo-ot-design.md` v1.0 (Propuesto)
**Prompt de ejecución:** `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md`
**Prompt de lanzamiento:** `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-LAUNCH-v1.0.md`
**Planes hermanos:** `2026-09-14-mod11-consola-ot-remediacion.md` v1.1 y `2026-09-14-mod11-acta-instalacion.md` v1.0 — ejes distintos, sin solape de archivos salvo el servicio de OT, que **no se toca a la vez** (§7 R3).

---

## 1. Qué se está resolviendo

El inicio de la ejecución **ya se registra**: `startedAt` existe y se emite en `ExecutionOrderStartedV1`. Lo que falta es el contexto que lo hace interpretable — sin historial de transiciones, `closedAt − startedAt` es tiempo transcurrido, y tres horas bloqueado esperando material cuentan como trabajo.

## 2. Contratos congelados

| Contrato | Ruta y versión | Dueño | Consumidores |
| --- | --- | --- | --- |
| Asiento de transición | Archivo hermano en `packages/shared/src/contracts/operations/` v1 | AI-SR-FULL | B1, B2, B4 |

**El contrato congelado de OT (v1.1) no se modifica**: la línea de tiempo es un recurso propio, no un campo del detalle.

## 3. Bloques y secuencia

```
     [G1] aprobación del CTO de ADR-089 + spec
                     │
        ┌────────────┴────────────┐
   B3 retención           B1 modelo + registro
    sec-eng                  sr-backend
        └────────────┬────────────┘
                     │
              B2 corrección aditiva
                  sr-backend
                     │
              B4 regresión
                   sr-qa
                     │
                   [G6]
```

**Camino crítico:** G1 → B1 → B2 → B4. B3 corre en paralelo con B1: su salida condiciona qué se puede retener, no cómo se registra.

**T2, T3 y T4 no se planifican aquí** (spec §9): sus condiciones de desbloqueo no se han cumplido, y la de T4 es regulatoria.

| # | Bloque | Alcance | Stop/go |
| --- | --- | --- | --- |
| **B1** | Modelo y registro | Entidad de asientos, migración con índice por orden e instante, y registro en **todas** las transiciones: inicio, bloqueo, reanudación, cierre y cancelación | CA-01, CA-02, CA-05 |
| **B2** | Corrección aditiva | Un asiento nunca se edita ni se borra; la corrección es un asiento nuevo que referencia al original | CA-04 |
| **B3** | Finalidad y retención | Tabla de finalidad por campo (ADR-067) y política de retención del **dato personal del trabajador** | CA-07 |
| **B4** | Regresión | Los ocho criterios de aceptación y no regresión sobre `startedAt`/`closedAt` | §6 |

## 4. Matriz de dispatch (agente × skill)

Todas verificadas contra disco con `ls .agents/skills/<nombre>/SKILL.md` (perfil §10.12).

| Bloque | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **B1** | `sr-backend` | `architect-review`, `nestjs-expert`, `database-migration`, `postgresql`, `testing-patterns` | `observability-engineer` (solo si se instrumenta el volumen de la tabla) | `ui-ux-pro-max` — T1 no tiene superficie de UI; `e2e-testing-patterns` — sin flujo de navegador en T1 | `pnpm typecheck` · `down()` ejercitado · jest con `Cached: 0` |
| **B2** | `sr-backend` | `nestjs-expert`, `typescript-expert`, `testing-patterns` | `architect-review` (si la corrección obliga a revisar el modelo de B1) | `database-migration` — B2 no añade DDL si B1 previó el campo de referencia | jest directo con conteo real |
| **B3** | `sec-eng` | `security-auditor`, `backend-security-coder` | `docs-architect` (para redactar la política) | `playwright-skill`, `testing-patterns` — B3 es dictamen, no implementación | Dictamen con finalidad por campo y plazo de retención |
| **B4** | `sr-qa` | `testing-patterns`, `turborepo-caching`, `verification-before-completion` | — | `e2e-testing-patterns` — sin superficie de consulta en T1 | Conteo real por suite, sin `--passWithNoTests` |

**`prod-ux` no recibe bloque en T1**: su decisión sobre `EN_ROUTE` (spec §4.4) pertenece a T2 y **condiciona si ese tramo se hace**.

## 5. RACI

| Bloque | R | A | C | I |
| --- | --- | --- | --- | --- |
| B1 | AI-SR-FULL | AI-EM-ARCH | AI-DATA-ENG, AI-SEC-ENG | AI-PLAT-OPS |
| B2 | AI-SR-FULL | AI-EM-ARCH | AI-SEC-ENG | — |
| B3 | AI-SEC-ENG | AI-EM-ARCH | AI-DATA-ENG | CTO |
| B4 | AI-SR-QA | AI-EM-ARCH | — | todos |

`sec-eng` es **auditor**: si su dictamen exige código, se abre bloque nuevo para el dueño del área (perfil §3.6).

## 6. Verificación

- **CA-01 / CA-02** — toda transición deja asiento, y **varios ciclos** de bloqueo en la misma OT se registran todos. El caso de ciclo múltiple es el que descarta la alternativa de campos sueltos (ADR-089 §A1).
- **CA-03** — tiempo bloqueado y total sin descontar son **ambos** derivables: ninguna política de cómputo queda congelada en el dato.
- **CA-04** — una corrección no borra nada y el original sigue visible.
- **CA-05** — `startedAt` y `closedAt` intactos: ningún consumidor vivo se rompe, incluido el `completion` que el portal ya consume.
- **CA-06** — una OT sin línea de tiempo se distingue de una con historial vacío.
- **CA-07** — política de retención declarada y aprobada por `sec-eng` **antes** de cerrar el tramo.
- **Transversal** — conteo real por suite; `audit:adr-citations` y `audit:doc-locations` en `BLOQUEANTE: 0`.

## 7. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Se persiste una duración «para no calcularla cada vez» y se congela la política de cómputo | ADR-089 §D2; CA-03 verifica que ambas lecturas conviven |
| R2 | La tabla crece sin índice ni retención y arrastra dato personal indefinidamente | Índice en B1, retención en B3 — y B3 es bloqueante del cierre, no un anexo |
| R3 | B1 toca `execution-orders.service.ts`, que los planes hermanos también tocan | **No despachar en paralelo con el tramo de acta de instalación.** Si ambos se aprueban, se secuencian; el reparto de archivos no admite dos dueños |
| R4 | El registro se añade solo en `start()` y `close()`, y los bloqueos quedan fuera | CA-02 lo cubre explícitamente: es donde está el valor del tramo |
| R5 | Se reconstruye historial retroactivo para «no tener huecos» | Prohibido por spec §4.5: inventar transiciones que nadie registró es peor que no tenerlas |

## 8. Bloqueos abiertos

**Ninguno de gobierno.** G1 cerrado el 2026-09-14. Queda la **restricción de secuencia** del riesgo R3: no despachar en paralelo con el tramo de acta de instalación.

## 9. Lanzamiento

**El archivo `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-LAUNCH-v1.0.md` es la fuente y prevalece si este espejo diverge.**

Ola 1 — B3 y B1 en paralelo; B2 al cerrar B1; B4 al cerrar B2. **Lanzable tras cerrar el tramo de acta de instalación.**

> Actúa como `sec-eng`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-linea-tiempo-ot.md` y tu encargo `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` §B3.
> Antes de dictaminar lee los `SKILL.md` de: `security-auditor`, `backend-security-coder`.
> Alcance: finalidad por campo y política de retención del dato personal del trabajador. Eres auditor: no implementas.
> Cierras cuando exista dictamen con plazo de retención y finalidad declarada por campo.

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md` §B1.
> Antes de escribir código lee los `SKILL.md` de: `architect-review`, `nestjs-expert`, `database-migration`, `postgresql`, `testing-patterns`.
> **No modifiques** `packages/shared/src/contracts/operations/execution-orders.ts` v1.1: la línea de tiempo es recurso propio, en archivo hermano.
> Alcance: solo B1. Fuera de alcance: corrección aditiva (B2), `EN_ROUTE` (T2), superficie de consulta (T3).
> Cierras cuando CA-01, CA-02 y CA-05 pasen con conteo real. Reporta rutas, evidencia y deuda por severidad.
