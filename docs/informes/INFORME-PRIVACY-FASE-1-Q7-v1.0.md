# INFORME — Privacy Fase 1 · Q7

**Versión:** 1.0  
**Fecha:** 2026-10-14  
**Estado:** Bloqueado por contrato; implementación no iniciada  
**Responsable:** AI-FE-PLATFORM

## Resultado

Q7 se detuvo antes de editar código, conforme a la instrucción de no cambiar contratos y emitir `[BLOQUEO]` si falta un campo requerido. La ruta de este informe estaba libre antes de crearlo.

## Bloqueo contractual

La ruta exacta es `GET /privacy/requests/:id`, implementada por `PrivacyRequestsController.get()` en `apps/api/src/modules/privacy/requests/requests.controller.ts`. `PrivacyRequestsService.get()` devuelve `{ request, events, tasks }`; `request` se construye con `toPublicRequest(row)` y omite `requesterEvidenceMediaId`, `identityVerificationMethod`, `identityVerifiedAt` e `identityVerifiedBy`.

La spec ratificada exige saber si existe evidencia para ofrecer **Ver evidencia** solo cuando corresponda, y presentar el estado y la constancia de verificación en el detalle. Sin `hasRequesterEvidence` o equivalente la interfaz no puede ocultar la acción cuando no hay archivo. Consultar `GET /privacy/requests/:id/evidence` al cargar tampoco resuelve el contrato: firma y audita el acceso, mientras la spec exige solicitar la URL firmada bajo demanda.

Además, la respuesta de detalle no puede presentar la identidad de la persona a cuentas con `privacy.manage`; y la ruta actual requiere `privacy.read`. Hace falta una proyección que distinga la presencia de evidencia y el estado de verificación, y que entregue los datos de identidad únicamente bajo la autorización de gestión definida por la spec.

### Criterios afectados

- **CA-UX-PRIV-07:** campos de identidad en el side peek solo con acceso de gestión.
- **CA-UX-PRIV-13:** método, fecha y cuenta de verificación vinculados al registro.
- **CA-UX-PRIV-17:** mostrar u ocultar **Ver evidencia** y solicitar el enlace firmado solo al activarlo.
- **CA-UX-PRIV-47:** determinar si la identidad sigue pendiente para ofrecer verificación en los estados permitidos.
- **CA-UX-PRIV-53:** mostrar traslado y la no procedencia limitada cuando la identidad esté pendiente.

## Archivos de implementación sin modificar

No se modificaron archivos del portal, API, `@iwana/shared`, tests ni E2E. No se ejecutaron el gate de portal, `audit-ui.mjs` ni Playwright porque no existe implementación Q7 que validar y la proyección contractual bloquea el flujo.

## Deuda nueva por severidad

- **P1 — Proyección del detalle de solicitudes:** el backend debe definir cómo exponer presencia de evidencia y estado de verificación, y restringir los campos de identidad a `privacy.manage`. Bloquea Q7 y los criterios afectados arriba.
- **P2 — Navegación global:** `/dashboard/privacy` no tiene entrada en el menú global. `Sidebar.tsx` está fuera de la propiedad Q7; requiere asignación explícita para hacer la sección descubrible desde la navegación del portal.

## Trazabilidad

- [Spec UX de Privacy Fase 1 v1.2, §§4.3, 5.2 y 17](../specs/2026-10-14-privacy-fase-1-ux-spec.md)
- [Prompt de ejecución Privacy Fase 1 v1.3, §2 Q7](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md)
- `apps/api/src/modules/privacy/requests/requests.controller.ts` — `GET /privacy/requests/:id`
- `apps/api/src/modules/privacy/requests/requests.service.ts` — `get()` y `toPublicRequest()`
