# INFORME-PRIVACY-FASE-1A-SEC-v1.1

**Fecha:** 2026-10-14  
**Revisor:** AI-SEC-ENG  
**Resultado:** **GO para SEC-01 y para esta re-verificación acotada.** SEC-02 permanece como deuda P2 condicional, asignada a `plat-ops`; no bloquea G6 según la decisión documentada.  
**Método:** revisión estática de solo lectura del código, la prueba HTTP y la configuración. No se ejecutaron pruebas dinámicas ni pentest.

## Fuentes

`AGENTS.md`; ADR-094; PRD `PRD-MOD05-CRM-DEFINICION-v2.0.md` y HLD `HLD-MOD05-ARQUITECTURA-v2.0.md` como contexto de CRM; perfil de AI-SEC-ENG y Protocolo de Colaboración; skill `security-auditor`; plan de Privacy v1.5; prompt de ejecución v1.3 §4; informes SEC v1.0 y R1 v1.0. El plan registra que el HLD propio de Privacy queda pendiente antes de G7.

## Re-verificación

### [SEC-REVIEW] SEC-01 — Corregido

**Evidencia:** el endpoint `GET /privacy/parties/:partyId/authorizations/:id/proof` declara `Cache-Control: no-store` y ejecuta una auditoría explícita luego de recuperar la prueba. El evento incluye `operation: AUTHORIZATION_PROOF_VIEWED` y `authorizationId`; no incorpora URL, hash, texto legal ni datos de contacto. La ruta mantiene los guards de JWT y permisos, exige `privacy.read` y evita la auditoría automática para no duplicarla (`apps/api/src/modules/privacy/authorizations/authorizations.controller.ts:104-135`).

La prueba HTTP verifica el encabezado, la respuesta, la invocación de auditoría con el identificador de autorización y la ausencia de campos sensibles en el payload (`apps/api/src/modules/privacy/authorizations/authorizations.controller.http.spec.ts:77-100`). **SEC-01 queda cerrado en el alcance revisado.**

**Escenario revisado:** una persona autorizada consulta una prueba de consentimiento; la respuesta no queda cacheable y queda trazabilidad explícita del acceso sin guardar evidencia o datos personales en el payload de auditoría.

### [SEC-REVIEW] SEC-02 — P2 / Media — Deuda condicional de `plat-ops`

El adaptador local entrega URL pública directa e ignora el TTL solicitado; además, `/storage/` se sirve con caché pública de un año (`packages/storage/src/adapters/local-fs-storage.adapter.ts:15-22,84-86`; `apps/api/src/main.ts:31-40`). La configuración de la API exige `STORAGE_DRIVER=minio` en producción y solo permite `local` fuera de producción (`apps/api/src/app.config.ts:351-355`). El prompt confirma que SEC-02 no bloquea G6 y lo asigna a `plat-ops`, con la condición de no cargar datos reales usando storage local (`docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md:236-237`).

**Estado:** deuda **P2**, condicionada a entornos con almacenamiento local; se mantiene asignada a `plat-ops`. No encontré evidencia para elevarla a hallazgo de producción mientras se aplique la validación explícita de MinIO.

## Deuda y veredicto

- **SEC-01:** cerrado tras comprobar el control y el test HTTP.
- **SEC-02:** P2 abierta para `plat-ops`, condicionada al almacenamiento local; no bloquea G6 conforme a §4 del prompt.
- **Deuda nueva:** ninguna dentro del alcance.
- **GO:** la re-verificación SEC-01 está satisfecha. Este informe no constituye aprobación global de Fase 1a ni afirma que se hayan ejecutado pruebas dinámicas.
