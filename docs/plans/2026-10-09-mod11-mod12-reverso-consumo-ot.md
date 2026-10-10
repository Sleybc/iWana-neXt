# Plan de orquestación — MOD11 ↔ MOD12: reverso de un consumo de inventario de OT

**Versión:** 1.0
**Estado:** **G1 abierto.** La spec está Propuesta; se despacha solo la ola de revisión cruzada.
**Fecha:** 2026-10-09
**Emitido por:** AI-EM-ARCH
**Spec:** `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` v1.0 (Propuesto)
**Origen:** deuda §8.1 de la spec de consumo v1.1. Condiciona G7 (`docs/plans/2026-10-09-mod11-mod12-deuda-g7.md`). Decisiones de producto P1 a P4 del CTO, del 2026-10-09.
**Norma aplicable:** un test integrado por motivo de rechazo en todo encargo MOD11↔MOD12 (CTO, 2026-10-08).

## 1. Gates

| Gate | Estado |
| --- | --- |
| **G1** | **Abierto.** El productor es AI-EM-ARCH, así que hace falta revisión cruzada: F1 `sr-backend`, S1 `sec-eng` y U1 `prod-ux`. Después, la aprobación del CTO. |
| G2 | El copy entra por U1. El diálogo de la consola reutiliza las primitivas existentes; si V3 necesita un componente nuevo, se consulta a `ds-owner`. |
| G4 | Se emite al aprobarse G1, con V1 a V5. |

## 2. Secuencia

```
Ola G1 (paralelo, solo lectura): F1 sr-backend · S1 sec-eng · U1 prod-ux
   → CTO aprueba → G4
   V1 sr-backend (contrato v1.7 primero) ──┬──> V2 sr-backend (MOD12)
                                           └──> V3 fe-platform (consola)
   → V5 sec-eng ‖ V4 sr-qa (RA-01 a RA-11, integrados)
```

## 3. Matriz de dispatch (ola G1)

Skills verificadas en disco el 2026-10-09.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **F1** | `sr-backend` | `architect-review`, `nestjs-expert`, `bullmq-specialist`, `postgresql` | — | `database-migration`: es un dictamen | Dictamen §F1 del encargo |
| **S1** | `sec-eng` | `security-auditor`, `backend-security-coder` | — | `testing-patterns`: es un dictamen | Dictamen §S1 del encargo |
| **U1** | `prod-ux` | `system-vocabulary-review` | `ui-ux-pro-max`, subordinada, para el diálogo | — | Tabla de copy cerrada |

## 4. Bloqueos abiertos

Ninguno para la ola G1.

## 5. Registro

| Fecha | Origen | Hecho | Registro |
| --- | --- | --- | --- |
| 2026-10-09 | CTO | P1: solo supervisor. P2: también después del cierre, con acto explícito. P3: el equipo vuelve a la custodia y se cierra el comodato. P4: movimiento contrario con rastro | Spec v1.0, encabezado |

## Lanzamiento

**La fuente es `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-G1-LAUNCH-v1.0.md`. Si este espejo diverge, prevalece el archivo.**
