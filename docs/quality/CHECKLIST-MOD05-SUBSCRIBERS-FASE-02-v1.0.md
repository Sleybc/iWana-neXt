# CHECKLIST OPERATIVO - MOD05 CRM Subscribers Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-17  
**Modulo:** MOD05-CRM-SUBSCRIBERS  
**Fase:** 02 - Frontend Portal Empresarial  
**Modo activo:** Mixto

---

## 1. Preflight

- [ ] PRD Fase 02 leido y comprendido.
- [ ] HLD de referencia leido.
- [ ] Prompt Fase 02 actualizado y sin ambiguedades de implementacion.
- [ ] Contrato backend validado contra `apps/api/src/modules/crm/subscribers/subscribers.controller.ts`.
- [ ] Schemas y enums compartidos confirmados en `packages/shared`.

## 2. Integracion API

- [ ] `apps/portal/src/lib/api-client.ts` exporta `subscribersApi` como objeto literal, no como clase.
- [ ] Existen tipos `SubscriberRecord`, `ListSubscribersParams`, `SearchSubscribersParams` y payloads relacionados.
- [ ] `subscribersApi.list()` usa filtros y paginacion coherentes con backend.
- [ ] `subscribersApi.search()` usa la ruta `/crm/subscribers/search`.
- [ ] `subscribersApi.getById()` usa `/crm/subscribers/:id`.
- [ ] `subscribersApi.create()` envia `Idempotency-Key`.
- [ ] `subscribersApi.update()` y `remove()` respetan el contrato REST existente.
- [ ] `subscribersApi.transitionStatus()` usa `/crm/subscribers/:id/status`.
- [ ] `subscribersApi.get360()` usa `/crm/subscribers/:id/360`.

## 3. Metadata UI

- [ ] Existe `subscriber-ui.ts` con metadata de estados, tipo de persona, segmento, IVA y regimen.
- [ ] `ALLOWED_TRANSITIONS` coincide con la maquina de estados vigente del backend.
- [ ] Helpers de nombre y documento cubren NATURAL y JURIDICA.

## 4. Listado

- [ ] La ruta `/dashboard/crm/subscribers` muestra listado funcional y no un stub.
- [ ] La tabla incluye nombre o razon social, documento o NIT, tipo, segmento, IVA, ciudad, estado y fecha.
- [ ] Filtros de estado, tipo de persona, segmento y estrato funcionan.
- [ ] La busqueda funciona sin romper tenant-awareness.
- [ ] La paginacion funciona con limites 10, 25 y 50.
- [ ] El CTA "Nuevo suscriptor" navega a `/dashboard/crm/subscribers/new`.

## 5. Alta y edicion

- [ ] Existe formulario discriminado por `personType`.
- [ ] NATURAL muestra documentType, documentNumber, firstName, lastName, stratum y birthDate.
- [ ] JURIDICA muestra nit, digito de verificacion, businessName, commercialName y legalRepresentativeId.
- [ ] Shared fields cubren datos de contacto y direccion.
- [ ] La validacion reutiliza `CreateSubscriberSchema` y `UpdateSubscriberSchema`.
- [ ] No existe validacion manual paralela para reglas ya definidas en shared.
- [ ] `VatTreatmentBanner` solo refleja respuesta backend.

## 6. Detalle 360 y estados

- [ ] Existe ruta `/dashboard/crm/subscribers/[id]`.
- [ ] El header muestra badges de status, tipo de persona y segmento.
- [ ] El detalle consume `get360()`.
- [ ] Contacts, contracts y habeas data quedan como stubs informativos.
- [ ] Existe dialogo de transicion de estado.
- [ ] La razon es obligatoria para estados que lo requieren.

## 7. Navegacion y CRM overview

- [ ] Sidebar mantiene visible el acceso a Suscriptores.
- [ ] El redirect historico `/dashboard/subscribers` apunta a `/dashboard/crm/subscribers`.
- [ ] `CrmOverviewClient` incorpora entry point de suscriptores.
- [ ] No se reintroducen estados legacy del pipeline CRM en textos o metricas.

## 8. Seguridad y calidad

- [ ] No hay logs con PII en cliente.
- [ ] No hay secretos, tokens ni connection strings en codigo o docs.
- [ ] No hay recálculo client-side de IVA o regimen.
- [ ] La implementacion mantiene tenant-awareness via api-client.
- [ ] No se introducen imports circulares.

## 9. Verificacion final

- [ ] `pnpm --filter @iwana/portal typecheck` limpio.
- [ ] `pnpm --filter @iwana/portal lint` limpio.
- [ ] Tests relevantes de subscribers backend siguen pasando.
- [ ] Validacion manual de listado, alta NATURAL, alta JURIDICA, detalle 360 y transicion completada.
- [ ] Informe vivo actualizado con evidencia de ejecucion.

---

**Resultado esperado:** Checklist completo antes de declarar Fase 02 lista para revision o merge.