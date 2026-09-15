# Plan de orquestación — MOD11: corregir una OT mal creada

**Versión:** 1.0
**Estado:** Vigente. **G1 cerrado el 2026-09-15**: ADR-090 (Aprobado) y spec aprobada. T0 cerrado en GO y auditado.
**Reordenado el 2026-09-15:** **T2 se adelanta a T1.** El orden original era contención de archivo, no dependencia de fondo; E2 abrió la puerta de despacho y con ella una OT que **nadie puede cancelar** —sin evento de agenda no hay vía de cancelación—, así que §D3 pasa a ser lo urgente. T1 sigue reexpresado para cubrir la OT despachada sin cita.
**Fecha:** 2026-09-14
**Emitido por:** AI-EM-ARCH

**Spec que ejecuta:** `docs/specs/2026-09-14-mod11-correccion-ot-design.md` v1.0
**ADR que lo sostiene:** ADR-090 (Aprobado)
**Prompt de T0:** `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T0-v1.0.md`
**Prompt de lanzamiento:** `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T0-LAUNCH-v1.0.md`

---

## 1. Qué se está resolviendo

El CTO pidió eliminar una OT creada por error. Sus decisiones lo redefinieron: **corregir**, y anular solo cuando corregir no sea posible.

Al explorar apareció que **no existe ninguna vía de corrección** —ni editando la OT ni propagando desde la agenda, cuyos handlers son no-ops— y que el límite que lo impide **ya está causando un fallo de control de acceso**: `assign()` no persiste el técnico, así que el reasignado no puede operar y el anterior conserva el acceso, con la operación devolviendo 200.

## 2. Contratos

**Ninguno nuevo en T0.** T1 amplía el puerto `ExecutionOrderSchedulingPort` con un método de actualización; se congela al aprobarse la spec.

## 3. Tramos

```
   T0  persistencia + assign()        ← despachable YA, sin dependencias
   sr-backend
        │
   [G1] aprobación de ADR-090 (Aprobado) + spec
        │
   T1  propagación agenda → OT        sr-backend
        │
   T2  anulación por error + huecos   sr-backend + prod-ux
        │
   T3  reconciliador con deriva       sr-backend
```

**Camino crítico:** T0 → G1 → T1 → T2 → T3. Los cuatro tocan `execution-orders.service.ts`: **no se paralelizan**.

| Tramo | Alcance | Stop/go |
| --- | --- | --- |
| **T0** | El `UPDATE` escribe los campos que cada comando declara; `assign()` persiste de verdad; test contra base real | CA-01 a CA-03 |
| **T1** | Método de actualización en el puerto, emisión desde MOD09, handlers reales en el worker, guarda de estado y rechazo de tipo de trabajo. **Reexpresado 2026-09-14**: cubre además la OT despachada sin cita, cuya corrección entra por el despacho porque no hay evento del cual propagar | CA-04 a CA-08 |
| **T2** | Anulación distinguible + los cuatro huecos de la cancelación. **Alcanza a la OT despachada sin cita** (hallazgo H3 de la auditoría de E2) y debe entrar en el índice de origen (135) y en la purga de retención (134) | CA-09 a CA-14 |
| **T3** | Reconciliador extendido a ventana, recurso y sitio | CA-15 |

## 4. Matriz de dispatch (agente × skill)

Verificadas contra disco con `ls .agents/skills/<nombre>/SKILL.md` (perfil §10.12).

| Tramo | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **T0** | `sr-backend` | `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns` | `database-migration` (solo si hiciera falta índice; no se prevé DDL) | `architect-review` — es corrección de un defecto, no decisión de diseño; `ui-ux-pro-max` — sin superficie de UI | `pnpm typecheck` · jest con `Cached: 0` · test contra Postgres real |
| **T1** | `sr-backend` | `architect-review`, `nestjs-expert`, `bullmq-specialist`, `typescript-expert`, `testing-patterns` | `postgresql` (si la aplicación del evento necesita proyección nueva) | `database-migration` — la propagación no añade DDL | jest directo con conteo real |
| **T2** | `sr-backend` + `prod-ux` | backend: `nestjs-expert`, `testing-patterns` · UX: `system-vocabulary-review` | `database-migration` (si la distinción exige columna o enum nuevos) | `iwana-identity-ui-review` — T2 entrega copy y motivos, no pantalla | Texto en español, sentence case, sin enums crudos |
| **T3** | `sr-backend` | `nestjs-expert`, `postgresql`, `testing-patterns` | `observability-engineer` (si el conteo de discrepancias se instrumenta) | `playwright-skill` — sin flujo de navegador | jest con conteo real |

**`sec-eng` no recibe tramo**, pero **T0 le concierne**: el defecto es de control de acceso. Si al corregirlo aparece cualquier otra ruta donde el acceso se decida sobre datos no persistidos, es hallazgo para AI-EM-ARCH y dictamen, no decisión del ejecutor.

## 5. RACI

| Tramo | R | A | C | I |
| --- | --- | --- | --- | --- |
| T0 | AI-SR-FULL | AI-EM-ARCH | AI-SEC-ENG | AI-SR-QA |
| T1 | AI-SR-FULL | AI-EM-ARCH | AI-DATA-ENG | AI-FE-PLATFORM |
| T2 | AI-SR-FULL / AI-PROD-UX | AI-EM-ARCH | AI-DS-OWNER | AI-FE-PLATFORM |
| T3 | AI-SR-FULL | AI-EM-ARCH | AI-PLAT-OPS | — |

## 6. Verificación

- **CA-01 / CA-02** — el criterio real no es que `assign()` devuelva 200, sino que **el técnico reasignado pueda iniciar la OT**. Verificar contra base, no contra la respuesta: hoy la respuesta miente.
- **CA-03** — ampliar el `UPDATE` no habilita mutaciones no intencionadas de otros comandos.
- **CA-06** — la propagación es idempotente: reaplicar el mismo evento no cambia el resultado.
- **CA-07** — con la OT en ejecución el rechazo es **visible en la agenda**; un rechazo silencioso deja al editor creyendo que corrigió.
- **CA-11 / CA-12** — cerradas la puerta trasera y la reescritura de una OT terminal.
- **Transversal** — conteo real por suite; `tasks` no baja de 617; ambas auditorías en `BLOQUEANTE: 0`.

## 7. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Ampliar el `UPDATE` deja pasar mutaciones no intencionadas | CA-03; cada comando declara qué persiste |
| R2 | T1 se implementa en un solo lado de la frontera y nadie lo nota | Ambos lados en el mismo tramo; el criterio se verifica de extremo a extremo |
| R3 | Se abre un `PATCH` sobre la OT «porque es más rápido» | ADR-090 (Aprobado) §D1 lo prohíbe: sería un segundo dueño del dato |
| R4 | Se corrige una OT en ejecución y el técnico trabaja contra datos que cambiaron | CA-07 |
| R5 | T0 se arregla solo para `assign()` y el resto de campos sigue sin poder persistirse | CA-03 exige el criterio general, no el parche puntual |
| R6 | Se aprovecha para introducir borrado «solo para OT sin actividad» | ADR-090 (Aprobado) §A1: una OT tiene consecuencias desde su creación |

## 8. Bloqueos abiertos

**Ninguno.** T0 cerrado el 2026-09-15; G1 cerrado con la aprobación de ADR-090 (Aprobado).

**Orden vigente:** H1 **cerrado en GO el 2026-09-15** → **T2 lanzado** (`docs/prompts/PROMPT-MOD11-CORRECCION-OT-T2-LAUNCH-v1.0.md`) → E3 → T1 → T3 → E4. Todos tocan `execution-orders.service.ts`: se ejecutan de uno en uno.
**Además, T1 no se lanza antes de E1 de `docs/plans/2026-09-14-mod11-origen-ot.md`**: hasta que el esquema admita OT sin cita, el segundo caso que T1 debe cubrir no existe y su diseño quedaría a medias.

## 9. Lanzamiento

**El archivo `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T0-LAUNCH-v1.0.md` es la fuente y prevalece si este espejo diverge.**

Solo T0. Los tramos siguientes se lanzan con su propio archivo cuando G1 cierre.

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-correccion-ot.md` y tu encargo `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T0-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de: `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns`.
> El criterio no es que `assign()` devuelva 200 —hoy ya lo devuelve y miente—, sino que el técnico reasignado **pueda iniciar la OT** y el anterior no.
> Alcance: solo T0. Fuera de alcance: propagación desde agenda, anulación, reconciliador.
> Cierras cuando CA-01 a CA-03 pasen con conteo real y verificación contra base.
