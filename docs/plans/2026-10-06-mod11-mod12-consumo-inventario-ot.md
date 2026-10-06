# Plan de orquestación — MOD11 ↔ MOD12: el consumo de una OT mueve el inventario

**Versión:** 1.1
**Estado:** **G1 cerrado.** El CTO aprobó la spec v1.1 el 2026-10-06, con sus tres ratificaciones. **G4 está emitido** para los seis bloques. Ola 1 despachable.
**Cambio v1.0 → v1.1 (2026-10-06):** se consolida G1. Nacen los bloques P1 (`plat-ops`) y S2 (`sec-eng`), y se completa la matriz de I1 a I4.
**Fecha:** 2026-10-06
**Emitido por:** AI-EM-ARCH
**Spec:** `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` **v1.1** (Aprobado por el CTO, 2026-10-06)
**Origen:** decisión del CTO del 2026-10-06, registrada en `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 §Registro de bloqueos. La definición se abre en paralelo, el G6 de la consola no se bloquea y **G7 queda condicionado a este plan**.

## 1. Gates

| Gate | Estado |
| --- | --- |
| **G1** | **Revisión cruzada hecha** (F1: no recomendaba aprobar la v1.0; S1: GO condicionado; U1: copy cerrado). Todo quedó resuelto en la v1.1 (§10 de la spec). **CERRADO: el CTO aprobó el 2026-10-06** la excepción D3, el DDL de las migraciones 138 y 139, y la finalidad D12. |
| G2 | No aplica: no hay componente nuevo. El copy del motivo entra por G1. |
| G3 | Lo cubre el dictamen de factibilidad de `sr-backend` en G1. |
| G4 | **Emitido el 2026-10-06:** `PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md`, con los bloques P1, I1, I2, I3, S2 e I4. |

## 2. Secuencia

```
Ola G1 (paralelo, solo lectura): F1 sr-backend · S1 sec-eng · U1 prod-ux
        │
   [CTO aprueba spec + dictámenes] → G4
        │
   P1 plat-ops (secreto HMAC) ─────────────┐
   I1 sr-backend (contrato v1.6 primero) ──┼──> I2 sr-backend (recibo + consumidor MOD12)
                                           └──> I3 fe-platform (motivo y pendiente)
        │
   S2 sec-eng (revisión del código I1+I2) ‖ I4 sr-qa (CA-01 a CA-11)
```

I2 e I3 consumen el contrato v1.6 que congela I1. I1 e I2 tocan módulos distintos (`tasks` y `worker` frente a `inventory`), pero los dos son de `sr-backend`: corren en sesiones separadas y en ese orden.

## 3. Matriz de dispatch

Skills verificadas en disco el 2026-10-06.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **F1** factibilidad | `sr-backend` | `architect-review`, `nestjs-expert`, `bullmq-specialist` | `postgresql` (si D6 o D7 exigen índice) | `database-migration`: es un dictamen, no una migración | Dictamen §F1 del encargo |
| **S1** riesgo | `sec-eng` | `security-auditor`, `backend-security-coder` | — | `testing-patterns`: es un dictamen | Dictamen sobre D8, CA-08 y la regulación |
| **U1** copy | `prod-ux` | `system-vocabulary-review` | — | `ui-ux-pro-max`: la superficie ya está contratada | Tabla de copy cerrada para §4 |
| **I1** MOD11 | `sr-backend` | `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql`, `testing-patterns` | `backend-security-coder` (firma HMAC y DLQ conforme a D11) | `architect-review`: las decisiones ya están tomadas en la spec v1.1 | Typecheck · jest de `tasks` y worker con `Cached: 0` · migración 138 con `down` ejercitado |
| **I2** MOD12 | `sr-backend` | `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql`, `testing-patterns`, `backend-security-coder` | — | `ui-ux-pro-max`: no hay superficie | Typecheck · jest de `inventory` con `Cached: 0` · migración 139 con `down` ejercitado · carrera `23505` probada |
| **I3** consola | `fe-platform` | `frontend-dev-guidelines`, `testing-patterns` | `system-vocabulary-review` (si el copy necesita ajuste) | `core-components`: no hay componente nuevo | `audit-ui.mjs` · jest de `operations/` con `Cached: 0` |
| **I4** QA | `sr-qa` | `e2e-testing-patterns`, `testing-patterns`, `postgresql`, `verification-before-completion` | `playwright-skill` (si CA-03 se verifica en navegador) | — | CA-01 a CA-11 contra Postgres y Redis reales, con inspección de la DLQ |
| **P1** secreto | `plat-ops` | `docker-expert` | — | — | Clave en plantillas `.env.example` y en Compose, sin valor real; rotación documentada |
| **S2** seguridad | `sec-eng` | `security-auditor`, `backend-security-coder` | — | `testing-patterns`: es una auditoría | Dictamen sobre D8, D9, D11 y CA-08 contra el código |

## 4. Bloqueos abiertos

Ninguno. G7 queda condicionado a ADR-074 (propuesto).

## 5. Registro de auditoría

| Fecha | Origen | Hallazgo | Resolución | Registro |
| --- | --- | --- | --- | --- |
| 2026-10-06 | AI-EM-ARCH, auditoría de la ola 1 | **I1: GO.** Contrato v1.6 y Zod verdes. V2 emitido con `subscriberId` solo para instalación, y `CREW` rechazado. Firma HMAC sobre la forma canónica con claves ordenadas, y clave validada (≥ 32 bytes, base64 canónico). V2 y las respuestas quedan fuera de la guarda `aggregateVersion`. Transición condicional `PENDING → …` y anomalía ante resultados contradictorios. DLQ de inventario con diagnóstico permitido y retención de 30 días. D7 con `SKIP LOCKED`, `eventId` nuevo y tope de intentos. El orquestador repitió el worker: **123/123**. **P1: GO.** Producción falla al arrancar sin la clave, hay clave previa para rotar y runbook. **Hallazgo P2 en D7:** una fila con `inventory_request_id` o `actor_user_id` nulos (columnas nulables) hace fallar Zod y revierte el lote completo del tenant en cada ciclo; ningún pendiente de ese tenant se recupera | Remediación **I1-R**, encargo de implementación §I1-R, que corre en la ola 2 en paralelo con I2 e I3 porque usa archivos distintos. Aviso para I2 e I4: en local hay que generar la clave con `openssl rand -base64 32`; sin ella, el worker manda cada solicitud a la DLQ | `INFORME-MOD11-MOD12-INVENTARIO-I1-v1.0.md` · `INFORME-MOD11-MOD12-INVENTARIO-P1-PLAT-OPS-v1.0.md` |

## Lanzamiento

**La fuente vigente es `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-OLA2-LAUNCH-v1.0.md`: ola 2, con I2, I3 e I1-R en paralelo. Si este espejo diverge, prevalece el archivo.** La ola 1 está cerrada en GO.

- Ola 2: I2 e I3, cuando I1 haya congelado el contrato v1.6 en `@iwana/shared`.
- Ola 3: S2 e I4, cuando I2 esté en GO.

Cada ola se lanza con su propio archivo. La ola G1 está cerrada.
