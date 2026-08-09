---
description: "G6.5 merge readiness + ventana 1 staging SEC-P1 (S1). Sin ventana 2, sin prod. A1/A2 ya aprobado por CTO."
name: "SEC-P1 G6.5 + staging ventana 1"
argument-hint: "Fase: g65 | staging-clave | staging-ventana-1 | staging-criterio-6 | consolidar-informe"
agent: "agent"
---

Ejecuta (o orquesta) el **siguiente tramo operativo** de SEC-P1 tras el cierre en código/dev y la aprobación CTO de **A1/A2** (2026-08-06).

**Modo de gobierno:** emitido por AI-EM-ARCH (Orquestador). Este prompt **no** abre más trabajo de código en la iniciativa salvo remediación de un stop criterion.

## Plan congelado (no renegociar)

| Código | Estado |
| --- | --- |
| **S1** | Staging primero → prod después |
| **A1/A2** | **Aprobado CTO** — secret store; clave **distinta** staging ≠ prod |
| **B1** | Soak 3–7 d con **fecha hard** — se fija al go de ventana 1 **prod**, no en este prompt |

## Alcance de este prompt

| Entra | No entra |
| --- | --- |
| G6.5 merge readiness del SHA con fixes SEC-P1 | Ventana 2 (contract) en staging o prod |
| Staging: secretos + ventana 1 (expand) | Producción (ventana 1 o 2) |
| Smoke + criterio 6 + paridad en staging | DROP de schemas `MARKED_FOR_DELETION` (F-1) |
| Actualizar informe vivo con evidencia staging | Limpieza legacy 018/020 en `typeorm_migrations` |
| | Rotación de `PII_HASH_KEY` (runbook cifrado §6bis) |

## Fuentes de verdad

1. `AGENTS.md`
2. Runbook: [`docs/runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md`](../runbooks/RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md) — §0, §1, §2
3. Informe vivo: [`docs/informes/INFORME-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md`](../informes/INFORME-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md)
4. Gate G6.5: [`docs/adrs/ADR-069-Gates-G6.5-Merge-Readiness.md`](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) (**Aprobado**)
5. Prompt hermano (ventanas completas / prod): [`PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md`](./PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md) — usarlo **después** de staging verde

## Gobernanza

1. **Cero PII, secretos ni valores de hash/HMAC** en logs, chats, tickets ni informes — solo conteos, SHA, nombres de migración, exit codes.
2. G6.5 **autoriza merge**, nunca despliegue productivo (ADR-069).
3. Sin `PII_HASH_KEY` el bootstrap Joi **falla** (fail-fast).
4. **Stop:** fallo `[MIGRATOR]`, paridad rota o `022`/`109` aplicadas sin querer → no rearrancar con flota mixta; no declarar staging OK.
5. Escalaciones al CTO: go secretos **prod**, fecha hard B1, go ventana 1/2 prod — **fuera** de este prompt.

## Roles (protocolo multiagente)

| Fase | R | C / I |
| --- | --- | --- |
| G6.5 (CI Linux por SHA) | AI-PLAT-OPS | AI-SR-QA (C), AI-EM-ARCH (I) |
| Staging clave + migraciones | AI-PLAT-OPS | AI-SEC-ENG (C), AI-DATA-ENG (C si peak ≠ ADR-078 (propuesto)) |
| Smoke + criterio 6 | AI-SR-QA | AI-PLAT-OPS (C) |
| G-SEC post-staging (consulta) | AI-SEC-ENG | — |
| Consolidación informe | AI-EM-ARCH / ejecutor docs | — |

## Contratos congelados

- Procedimiento ops: runbook SEC-P1 v1.0 (§0–§2).
- Cableado prod (referencia; staging sigue su stack): `PII_HASH_KEY` en api/worker/migrator; `IWANA_APPLY_PII_CONTRACT` **ausente** en ventana 1.
- No hay contrato de API/UI nuevo en esta fase.

---

## Fases (ejecutar solo la pedida en `argument-hint`)

### Fase `g65`

1. Identificar el **SHA** que incluye: paridad por código, N-1 provisioning, env truthy, compose `PII_HASH_KEY`, runbook §4.2 1–10, filtro de diferidas.
2. Asegurar que ese SHA está en la rama candidata a merge (PR o push que dispare CI).
3. Esperar corrida **Linux** de GitHub Actions sobre **ese** SHA (ADR-069): jobs relevantes verdes (lint/typecheck/test; E2E si el workflow del repo lo exige para ese path).
4. Archivar evidencia **sanitizada**: número de run, SHA, plataforma, duración, conteos pass/fail — **sin** tokens, payloads ni secretos.
5. Registrar en el informe vivo: **G6.5 GO | SHA | run # | fecha** (o NO-GO con causa).
6. **Stop:** CI roja o evidencia de otro SHA → no merge; no pasar a staging.

**Criterio stop/go:** G6.5 GO → merge permitido. G6.5 NO-GO → remediar y repetir.

### Fase `staging-clave`

1. Generar `openssl rand -hex 32` **fuera** del repo.
2. Guardar en secret store de **staging** (nunca la de prod; A1/A2).
3. Inyectar en procesos que migran y en API/worker **antes** del arranque.
4. Verificar presencia (booleano / len) **sin** imprimir el valor.
5. Smoke: el proceso **arranca** (Joi no aborta).

**Stop:** clave ausente, placeholder, o sospecha de reutilización staging↔prod → escalar; no migrar.

### Fase `staging-ventana-1`

1. Preflight runbook §2.1: emails vacíos = 0; opcional `reltuples`/`relpages` si el volumen ≠ perfil mínimo ADR-078 (propuesto) (si peak ≥ ~100k → stop y consultar EM-ARCH).
2. Parada de API/web/portal/worker en staging.
3. Migrar **sin** contract:
   - Host: `pnpm db:migrate:all`
   - Si staging usa compose producción: vía `migrator` **sin** `-e IWANA_APPLY_PII_CONTRACT` (runbook §2.2).
4. Exigir en `[MIGRATOR]`:
   - Todos los ACTIVE `Done`
   - `Paridad de migraciones OK: N tenant(s) ACTIVE con M migraciones idénticas (alineadas con M del código)`
   - Anuncio de diferidas `022` y `109` **si aún no constan aplicadas**
5. **Stop:** fallo de tenant, paridad rota, o `022`/`109` aplicadas sin flag → no rearrancar; remediar.
6. Arranque + smoke §2.2 paso 7 (health, login plataforma, login tenant, búsqueda documento/email/teléfono).

### Fase `staging-criterio-6`

1. Ejecutar SQL criterio 6 del informe (new_value ∪ old_value; solo escalares string/number ≠ `[REDACTADO]`) **por schema ACTIVE**.
2. `pending` debe ser **0**. No volcar payloads.
3. Opcional consulta SEC-ENG: G-SEC staging (sin ampliar alcance).

**Stop:** `pending > 0` → no declarar ventana 1 staging cerrada.

### Fase `consolidar-informe`

1. Actualizar el informe vivo SEC-P1:
   - G6.5 (SHA, run, GO/NO-GO)
   - Staging ventana 1: fecha, paridad (N/M), criterio 6 = 0, smoke OK
   - Confirmar: **sin** ventana 2 en staging en este tramo (salvo go explícito CTO distinto — no es el default)
2. Dejar explícito el **siguiente** paso: go CTO prod (secretos + fecha hard B1) vía [`PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md`](./PROMPT-OPERATIVO-SEC-P1-CIERRE-VENTANAS-v1.0.md).

---

## Anti-patrones

- Declarar G6.5 con evidencia de otro SHA o de un push futuro.
- Pegar `PII_HASH_KEY` en el chat/informe.
- Copiar la clave de staging a prod.
- Arrancar con flota mixta.
- Aplicar `IWANA_APPLY_PII_CONTRACT=true` “para adelantar” la ventana 2.
- Tratar schemas `MARKED_FOR_DELETION` como verificados.
- Abrir prod sin staging verde documentado.

## Criterio de éxito de este prompt

1. G6.5 GO registrado (SHA + run sanitizado).
2. Staging con `PII_HASH_KEY` propia y ventana 1 aplicada.
3. Paridad OK (alineada con el código) + criterio 6 = 0 + smoke OK.
4. Informe vivo actualizado; siguiente acción = go CTO hacia prod (no auto-arranque).

## Entregables

| Artefacto | Owner |
| --- | --- |
| Evidencia G6.5 sanitizada (en informe) | PLAT-OPS |
| Evidencia staging ventana 1 (paridad, criterio 6, smoke) | PLAT-OPS + SR-QA |
| Informe vivo actualizado | EM-ARCH / ejecutor docs |
| Lista de escalaciones CTO (si aplica) | EM-ARCH |
