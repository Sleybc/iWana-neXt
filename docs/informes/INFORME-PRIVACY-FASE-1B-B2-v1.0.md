# INFORME — Privacy Fase 1b · B2 Participantes y adaptador

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Estado:** Bloqueado · **Autor:** AI-SR-FULL (`sr-backend`)
**Encargo:** `docs/prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md` §§0–3, §4 B2 · **Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md`
**Skills leídas:** `nestjs-expert`, `postgresql`, `backend-security-coder`, `test-driven-development`, `codebase-cleanup-deps-audit`.
**Propiedad revisada:** `apps/api/src/modules/crm/privacy-adapters/**`, `apps/api/src/cli/anonymize-titular*` y participantes de `parties`, `users`, `media`, `wfm`, `tasks`.

## 0. Estado de ejecución

- La ruta de este informe estaba libre antes de crearlo.
- S1 está presente en el árbol compartido. D1 cerró su informe y actualizó el Anexo A de `docs/runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md`.
- No se modificó código productivo ni se ejecutaron pruebas. La instrucción de fase ordena detenerse cuando falte una decisión de alcance; por ello, el conteo real de esta sesión es **0 suites y 0 tests ejecutados** (sin caché).
- No se registran PII, ciphertext, HMAC ni claves.

## 1. [BLOQUEO]

**De:** AI-SR-FULL (B2) → AI-EM-ARCH  
**Fase/módulo:** Privacy 1b  
**Qué falta:** El informe D1 §4 deja pendiente una decisión sobre los datos del titular en `contracts`: campos de instalación, fiscales y notas; evidencia de estrato; y snapshots JSON. §2.5 solo asigna al participante CRM `expediente_records`, `contact_attempts`, `consent_records`, `coverage_checks` y `subscribers`, y el Anexo A vigente no contiene reglas para esas columnas de `contracts`. ADR-094 §D7 establece retención general de cinco años para identificación, dirección y contrato del suscriptor y diez años para soporte contable, pero no determina la regla por columna ni el tratamiento de los snapshots. Media también identifica evidencia de estrato mediante referencias de `contracts`; omitir esa relación puede dejar evidencia del alcance sin tratar.  
**Qué intenté:** Revisé AGENTS.md, plan y prompt de la fase, ADR-094, HLD, informe D1, Anexo A y las cinco skills obligatorias. Confirmé que el informe estaba libre, que S1/D1 están presentes y que los artefactos B2 aún no existen.  
**Impacto:** No se puede completar ni certificar el alcance de CRM/Media sin una decisión explícita sobre conservación y anonimización de `contracts` y sus snapshots. No se inició la implementación para evitar elegir silenciosamente una regla de conservación.

## 2. Resolución interna de N1

`execution_order_activities.description` es `NOT NULL`. Para la futura implementación B2 de `tasks`, el criterio del módulo es conservar la restricción y escribir el centinela `ANONIMIZADO`; esto evita una migración fuera de la propiedad y está contemplado en la nota N1 del informe D1. Esta decisión no resuelve el bloqueo de alcance de `contracts`.

## 3. Tests

**Conteo de esta sesión:** 0 suites · 0 tests. No se ejecutaron pruebas porque el `[BLOQUEO]` de alcance exige detener la implementación.

## 4. Deuda nueva por severidad

- **Media — decisión de alcance pendiente:** `contracts` contiene campos personales y snapshots JSON fuera del inventario asignado a B2. AI-EM-ARCH debe decidir inclusión/regla por columna o exclusión por conservación y finalidad. Esta observación ya aparece como consulta en el informe D1; B2 la hace bloqueante para certificar la supresión completa.
- **Sin deuda de código nueva:** no se hicieron cambios productivos.
