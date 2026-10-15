# Informe de bloqueo — Anexo A de anonimización de titulares

**Fecha:** 2026-10-15  
**Resultado:** `[BLOQUEO]` — no se creó CLI ni se modificó el runbook.  
**Alcance revisado:** inventario de prospectos y ex suscriptores para anonimización por tenant y número de solicitud.

## Motivo del bloqueo

No es posible cumplir la anonimización integral dentro del límite autorizado de escrituras en CRM, Party y Media sin resolver dos dependencias de identidad:

1. **Prospectos legacy sin vínculo con la solicitud.** `PotentialLead` contiene identificadores y campos cifrados de nombre, correo y teléfono, pero no Party, documento ni HMAC que permita enlazarlo de forma determinista con una solicitud. `ProspectCase` referencia `potential_id`, pero no a la solicitud. `DataSubjectRequest` expone Party y HMAC del documento, pero no referencias al expediente o al potencial. No se hará matching por PII en claro ni un barrido masivo.
2. **PII de cuentas de usuario fuera del límite de escritura.** Un suscriptor puede referenciar `users` mediante `subscribers.user_id`. Esa entidad almacena correo, nombre, teléfono y documento. Anonimizar esos datos requeriría escribir fuera de CRM, Party y Media; dejarlos intactos no cumpliría la supresión integral de un ex suscriptor con cuenta.

## Referencias de código

- `apps/api/src/modules/crm/potentials/entities/potential-lead.entity.ts:11` — campos de `PotentialLead`; no hay Party, documento ni HMAC.
- `apps/api/src/modules/crm/prospects/entities/prospect-case.entity.ts:12` — relación local por `potential_id`; sin vínculo con solicitud.
- `apps/api/src/modules/privacy/entities/data-subject-request.entity.ts:25` — solicitud con `party_id`/HMAC y sin referencia a potencial o expediente.
- `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts:41` — relación opcional `user_id`.
- `packages/database/src/entities/user.entity.ts:39` — correo de usuario; `:154` — campos personales adicionales.

## Trabajo detenido

- No se crearon `apps/api/src/cli/anonymize-titular*` ni pruebas.
- No se modificó `docs/runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md`.
- No se ejecutaron escrituras de anonimización ni se modificó DDL.
- La ruta del informe estaba libre al iniciar el trabajo.

## Resolución requerida

Antes de implementar el Anexo A, el responsable del proyecto debe definir un vínculo confiable entre solicitudes y potenciales legacy, y decidir cómo se anonimiza la PII de `users` respetando los boundaries de autenticación y el alcance de escritura. Una vez aprobado ese diseño, se podrá completar el inventario, el CLI transaccional, la integración PostgreSQL y el procedimiento operativo.
