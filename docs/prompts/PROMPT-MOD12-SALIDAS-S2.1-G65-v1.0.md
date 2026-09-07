# PROMPT DE EJECUCIÓN — MOD12 S2.1 · Higiene y validación G6.5 (CI por SHA)

**Versión:** 1.0
**Fecha:** 2026-09-06
**Módulo:** Transversal plataforma (cierra S2)
**Fase:** S2.1-G6.5
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Agente destinatario:** **AI-PLAT-OPS** · **Dueños invitados:** scheduling+AI-SR-QA (P1), plataforma/MOD09-11 (P2)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*
**Gate normativo:** [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) *(Aprobado)* — corrida Linux por SHA + artefacto resumen sanitizado; autoriza merge, nunca despliegue
**Run de referencia:** `33978689453` sobre `e2e11b40` (2 bloqueantes preexistentes + smoke crónico)

---

## 0. Estado de partida verificado

- Árbol sucio con 3 archivos (ver `git status`): `inventory.module.ts` (+`StockIssueLineSerial`, es de BE pero bloquea SHA válido), `scripts/e2e-provision-operational.mjs` (`unit`→`UNIT`), `INFORME-MOD12-SALIDAS-S2-v1.0.md` (marcador `ADR-082 (propuesto)`). Sin árbol limpio no hay SHA G6.5.
- Fixes ya en local: `3382e31c` (3 tests scheduling → toolbar vigente) + `7cb64446` (provisioner al canon V2 + copy MFA smoke). Pendientes de corrida Linux.

## 1. Objetivo exacto

- **Resultado esperado:** G6.5 en GO sobre un único SHA nuevo, con artefacto `e2e-r41-summary` sanitizado y smoke sin rojo en ese SHA.
- **Lo que sí entra:** higiene+commit, push, corridas `ci.yml` y `e2e-web-admin-smoke.yml` por SHA, recolección de artefacto, registro G6.5 en el informe.
- **Lo que no entra:** código de `apps/*` (dueños scheduling/FE), migraciones nuevas, cambios de workflow para aflojar gates, despliegue/G7.

## 2. Artefactos de entrada obligatorios

- Diagnóstico PLAT-OPS 2026-09-06 (B1/B2/B3 + §4 comandos) y [INFORME S2](../informes/INFORME-MOD12-SALIDAS-S2-v1.0.md) §2/§5/§7.
- Workflows: `.github/workflows/ci.yml`, `e2e-web-admin-smoke.yml`; provisioner `scripts/e2e-provision-operational.mjs:1138-1147,1211`; specs `SchedulingClient.spec.tsx`, `admin-bootstrap.spec.ts:440-446` vs `platform-ui-copy.ts:312-322`.

## 3. Instrucciones

### G0 · Higiene (bloquea todo lo demás)
Coordinar con SR-FULL el commit del registro del módulo (es BE, pero sin él no hay SHA válido): un commit de higiene con los 3 archivos sucios, mensaje `chore(s2.1): higiene pre-G6.5 — registro hija, UNIT, marcador (propuesto)`. Verificar `git status` limpio + `git log -3` antes de pushear. No validar ningún SHA con árbol sucio.

### G1 · Scheduling (dueño scheduling+QA, PLAT-OPS orquesta)
Confirmar `SchedulingClient.spec` contra `SchedulingToolbar.tsx` vigente (grupo `Vista de agenda`, orden Día/Lista/Semana/Mes, CTA `Abrir orden de trabajo`). Repro focalizada, push, exigir job `Lint + Typecheck + Build + Unit tests` verde + `Cached: 0 cached` + cobertura con denominador >0.

### G2 · Provisioner R4.1 (dueño plataforma, PLAT-OPS ejecuta)
Confirmar mapa V2 (`Acceso estándar NOC` etc.) + `UNIT`. Sin fallback V1 silencioso. Push + `execution-orders-e2e` verde: `E2E_SETUP=OK`, `PASSED≥30`, `FAILED=0 SKIPPED=0 DID_NOT_RUN=0 FLAKY=0`, `E2E_CLEANUP=OK`. Si tenant E2E a medio migrar → `[CONSULTA]` a MOD09-11 con log sanitizado.

### G3 · Smoke MFA (dueño plataforma)
Disparar `E2E Web Admin Smoke` sobre el mismo SHA. Si sigue rojo tras el copy-fix → `[CONSULTA]` a FE/web con selector exacto; nunca relajar el workflow para que pase.

### G4 · Registro
Anotar en el informe: nuevo SHA + run_ids + conclusiones de los 4 jobs + conteos Playwright + cleanup + duración. Solo conteos/plataforma/duración; nunca tokens, cookies, `test-results/` ni `playwright-report/` crudos.

## 4. Restricciones no negociables

- ADR-069 manda: mismo SHA para los 4 jobs + artefacto descargable. Código local sin corrida no es evidencia.
- Sin secretos/PII en logs ni artefactos; credenciales efímeras enmascaradas.
- Sin cambios estructurales de workflow ni de infra (docker/nginx/TLS fuera de alcance).

## 5. Entregables

Artefacto `e2e-r41-summary` + sección G6.5 GO/NO-GO en el informe + historial smoke sin rojo docs-only.

## 6. Criterios de aceptación

- CA-S2.1-G01: árbol limpio + SHA pusheado único.
- CA-S2.1-G02: `production-images` + `execution-orders-e2e` success en ese SHA.
- CA-S2.1-G03: `Lint+Typecheck+Build+Unit` success con caché real.
- CA-S2.1-G04: smoke verde en ese SHA (señal; no gate formal).

## 7. Stop/go

`[BLOQUEO]` si: nueva corrida revela segunda causa (bootstrap real, tenant a medio migrar). Escalar al CTO solo si G6.5 vuelve a quedar pendiente por deuda ajena (opciones del informe §7, recomendada opción 1). GO autoriza merge, nunca despliegue (G7 requiere CTO).
