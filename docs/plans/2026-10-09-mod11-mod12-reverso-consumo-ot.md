# Plan de orquestación — MOD11 ↔ MOD12: reverso de un consumo de inventario de OT

**Versión:** 1.1
**Estado:** **G1 cerrado (CTO, 2026-10-10). G4 emitido.** Ola 1 despachable.
**Cambio v1.0 → v1.1 (2026-10-10):** se consolida G1, el CTO aprueba la spec v1.1 y se emite G4 con la matriz de V1 a V5.
**Fecha:** 2026-10-09
**Emitido por:** AI-EM-ARCH
**Spec:** `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` **v1.1** (Aprobado por el CTO, 2026-10-10)
**Origen:** deuda §8.1 de la spec de consumo v1.1. Condiciona G7 (`docs/plans/2026-10-09-mod11-mod12-deuda-g7.md`). Decisiones de producto P1 a P4 del CTO, del 2026-10-09.
**Norma aplicable:** un test integrado por motivo de rechazo en todo encargo MOD11↔MOD12 (CTO, 2026-10-08).

## 1. Gates

| Gate | Estado |
| --- | --- |
| **G1** | **CERRADO.** Revisión cruzada hecha (F1 GO, S1 GO condicionado, U1 GO) y consolidada en la v1.1; el CTO la aprobó el 2026-10-10. |
| G2 | El copy entra por U1. El diálogo de la consola reutiliza las primitivas existentes; si V3 necesita un componente nuevo, se consulta a `ds-owner`. |
| G4 | **Emitido el 2026-10-10:** `PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md`, con V1 a V5 y U2. |

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

## 3b. Matriz de dispatch de la implementación

Skills verificadas en disco el 2026-10-10.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **V1** MOD11 | `sr-backend` | `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql`, `testing-patterns`, `backend-security-coder` | `iwana-matriz-motivos` (lista de motivos) | `architect-review`: la spec está aprobada | Typecheck **global** (cambia firmas públicas) · jest de `tasks` y worker con `Cached: 0` · migración 140 con `down` ejercitado |
| **U2** copy | `prod-ux` | `system-vocabulary-review` | — | `ui-ux-pro-max`: la superficie ya está contratada | Ratificación de los dos ajustes de la spec §9 |
| **V2** MOD12 | `sr-backend` | `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql`, `testing-patterns`, `backend-security-coder` | `iwana-matriz-motivos` | — | Typecheck global · jest de `inventory` con `Cached: 0` · migración 141 con `down` · carrera real · **4/4 integrados por motivo** |
| **V3** consola | `fe-platform` | `frontend-dev-guidelines`, `testing-patterns`, `wcag-audit-patterns` | `iwana-identity-ui-review` (gate visual) | `core-components`: el diálogo usa las primitivas existentes | `audit-ui.mjs` · jest de `operations/` con `Cached: 0` |
| **V4** QA | `sr-qa` | `e2e-testing-patterns`, `testing-patterns`, `postgresql`, `verification-before-completion`, `iwana-matriz-motivos` | `playwright-skill` (RA-04 y la UI) | — | RA-01 a RA-14 contra Postgres y Redis reales |
| **V5** seguridad | `sec-eng` | `security-auditor`, `backend-security-coder` | — | `testing-patterns`: es una auditoría | Dictamen sobre R5 (cada punto de extensión), R9 y RA-13 |

## 4. Bloqueos abiertos

Ninguno.

## 5. Registro

| Fecha | Origen | Hecho | Registro |
| --- | --- | --- | --- |
| 2026-10-09 | CTO | P1: solo supervisor. P2: también después del cierre, con acto explícito. P3: el equipo vuelve a la custodia y se cierra el comodato. P4: movimiento contrario con rastro | Spec v1.0, encabezado |
| 2026-10-10 | AI-EM-ARCH, consolidación de G1 | **F1: GO de factibilidad**, con dos consultas (enlace movimiento original/contrario y comodato ausente). **S1: GO condicionado** (el motivo se queda en MOD11, las garantías del pipeline se extienden de forma explícita, y una consulta sobre `safeTextField`). **U1: GO de copy.** La spec pasa a v1.1: índice parcial en R3, puntos de extensión en R5, operación de ledger y enlace en R6, `REVERSAL_LOAN_MISMATCH` en R7, los dos caminos del evaluador en R8, R9 y R10 nuevos, y 14 criterios RA. Queda registrada como deuda el `reason` en el evento de la anulación (ADR-090) | Spec v1.1 §9 · informes G1 F1, S1 y U1 |

## Lanzamiento

**La fuente vigente es `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-OLA1-LAUNCH-v1.0.md`: ola 1, con V1 y U2 en paralelo. Si este espejo diverge, prevalece el archivo.** La ola G1 está cerrada.

- Ola 2: V2 y V3, cuando V1 haya congelado el contrato v1.7.
- Ola 3: V4 y V5, cuando V2 esté en GO.
