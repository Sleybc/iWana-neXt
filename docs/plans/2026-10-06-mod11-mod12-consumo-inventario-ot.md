# Plan de orquestación — MOD11 ↔ MOD12: el consumo de una OT mueve el inventario

**Versión:** 1.0
**Estado:** **G1 abierto.** La spec está en estado Propuesto. Se despacha solo la ola G1 de revisión cruzada; la implementación espera a la aprobación del CTO.
**Fecha:** 2026-10-06
**Emitido por:** AI-EM-ARCH
**Spec:** `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` v1.0 (Propuesto)
**Origen:** decisión del CTO del 2026-10-06, registrada en `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 §Registro de bloqueos. La definición se abre en paralelo, el G6 de la consola no se bloquea y **G7 queda condicionado a este plan**.

## 1. Gates

| Gate | Estado |
| --- | --- |
| **G1** | **Abierto.** El productor es AI-EM-ARCH, así que hace falta revisión cruzada (perfil §3.4): factibilidad de `sr-backend`, riesgo de `sec-eng` y copy de `prod-ux`. Después, aprobación del CTO. |
| G2 | No aplica: no hay componente nuevo. El copy del motivo entra por G1. |
| G3 | Lo cubre el dictamen de factibilidad de `sr-backend` en G1. |
| G4 | Se emite al aprobarse G1, con los prompts I1 a I4. |

## 2. Secuencia

```
Ola G1 (paralelo, solo lectura): F1 sr-backend · S1 sec-eng · U1 prod-ux
        │
   [CTO aprueba spec + dictámenes] → G4
        │
   I1 sr-backend (contrato v1.6 primero) ──┬──> I2 sr-backend (consumidor MOD12)
                                           └──> I3 fe-platform (motivo de rechazo)
        │
   I4 sr-qa (extremo a extremo, CA-01 a CA-09)
```

I2 e I3 consumen el contrato v1.6 que congela I1. I1 e I2 tocan módulos distintos (`tasks` y `worker` frente a `inventory`), pero los dos son de `sr-backend`: corren en sesiones separadas y en ese orden.

## 3. Matriz de dispatch

Skills verificadas en disco el 2026-10-06.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **F1** factibilidad | `sr-backend` | `architect-review`, `nestjs-expert`, `bullmq-specialist` | `postgresql` (si D6 o D7 exigen índice) | `database-migration`: es un dictamen, no una migración | Dictamen §F1 del encargo |
| **S1** riesgo | `sec-eng` | `security-auditor`, `backend-security-coder` | — | `testing-patterns`: es un dictamen | Dictamen sobre D8, CA-08 y la regulación |
| **U1** copy | `prod-ux` | `system-vocabulary-review` | — | `ui-ux-pro-max`: la superficie ya está contratada | Tabla de copy cerrada para §4 |
| I1-I4 | — | *se fijan con G4* | — | — | — |

## 4. Bloqueos abiertos

Ninguno para la ola G1.

## Lanzamiento

**La fuente es `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-G1-LAUNCH-v1.0.md`. Si este espejo diverge, prevalece el archivo.** La ola G1 es de solo lectura, con tres dictámenes en paralelo.
