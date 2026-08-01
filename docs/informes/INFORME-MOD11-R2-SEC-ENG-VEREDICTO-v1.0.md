# INFORME-MOD11-R2-SEC-ENG-VEREDICTO-v1.0

**Estado:** NO-GO para merge de R2  
**Fecha:** 2026-07-31  
**Owner:** AI-SEC-ENG  
**Expediente:** MOD09-MOD11 OT instalacion  
**Fuentes:** `INFORME-MOD11-R2.1-EVIDENCE-SECURITY-v1.0.md`, `INFORME-MOD11-R2.5-RATE-LIMIT-G6-v1.0.md`, checklist QA-01 a QA-50 y codigo de `apps/api/src/modules/tasks/` y `apps/api/src/modules/mailer/`.

## Veredicto

R2 no cumple el gate de seguridad. Existe un P0 de dependencia en runtime y un
P0 de exposicion potencial de tokens en logs de desarrollo. Hay controles P1 sin
evidencia ejecutada contra Redis real y pruebas automatizadas pendientes para
storage local. No se recomienda merge ni despliegue.

## Hallazgos

### P0-SEC-01 — Nodemailer vulnerable en runtime

`pnpm audit` identifica `nodemailer@8.0.11` en `apps/api` y recomienda
working tree a `^9.0.1`; el lockfile debe permanecer sincronizado y la auditoria
debe repetirse antes del re-gate.

### P0-SEC-02 — Posible exposicion de token de recuperacion en logs

`MailerService` registraba `options.text` en modo desarrollo. La plantilla de
recuperacion incluye el `resetLink` con un token de un solo uso. La correccion
elimina el contenido del log y mantiene solo el asunto. El test de mailer debe
probar explicitamente que `text` no aparece en `Logger.debug`.

### P1-SEC-03 — Rate limit sin evidencia Redis real

El guard implementa una clave por bucket, actor y tenant, con evaluacion atomica
y fail-closed. La evidencia disponible usa doubles de Redis; falta una prueba
real de rafaga 11 -> 429, aislamiento entre actor/tenant y error/timeout del
backend Redis.

### P1-SEC-04 — QA-49 sin prueba automatizada explicita

La inspeccion no encontro persistencia local de evidencia o PII en las superficies
revisadas, pero falta una prueba que garantice ausencia en localStorage,
sessionStorage e IndexedDB.

### P1-SEC-05 — Threat model requiere registro formal

STRIDE y ASVS L2 estan documentados, pero el checklist exigia un artefacto formal
emitido por AI-SEC-ENG. Este documento satisface el registro del veredicto, no
cierra los P0 ni la evidencia Redis pendiente.

## Controles revisados

- BOLA, ABAC y aislamiento por tenant en `ExecutionOrdersService`.
- DTOs estrictos y proteccion contra mass assignment.
- Intent de evidencia ligado a tenant, OT y asset.
- URLs firmadas sin exponer `objectKey` o bucket en respuestas.
- Minimizacion de PII en respuestas y auditoria.
- Rate limiting por actor y tenant.

## Condiciones para reabrir R2

1. Verificar lockfile y `pnpm audit` sin el hallazgo de Nodemailer runtime.
2. Ejecutar el test de mailer y verificar que ningun token aparece en logs.
3. Ejecutar la rafaga Redis real y archivar 429, aislamiento y fail-closed.
4. Agregar y ejecutar prueba automatizada de ausencia de evidencia/PII en storage
   local del navegador.
5. Solicitar una nueva revision formal de AI-SEC-ENG despues de esas evidencias.

**Recomendacion:** mantener R2 en **NO-GO**.
