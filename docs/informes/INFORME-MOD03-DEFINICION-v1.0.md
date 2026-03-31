# INFORME - MOD03 Definicion

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-23  
**Modo activo:** Mixto  
**Modulo:** MOD03 - Configuracion Empresarial  
**Artefacto principal:** docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md

---

## 1. Resumen ejecutivo

Se definio y ejecuto la Fase 01 del modulo de Configuracion Empresarial para una empresa ya creada y autenticada dentro de apps/portal.

La definicion parte del estado real del repositorio:

- dashboard empresarial de MOD02 ya operativo,
- contratos self-service de tenant ya disponibles para lectura,
- actualizacion minima de settings ya implementada en backend,
- pagina de configuracion aun en placeholder al inicio de la fase.

La ejecucion de Fase 01 cerro esa brecha con los siguientes resultados:

- backend self-service separado para `profile` y `settings`,
- enforcement contractual para bloquear escritura self-service de `features.billing` y `maxSubscribers`,
- pantalla funcional en `apps/portal/src/app/dashboard/settings/page.tsx`,
- evidencia automatizada backend y E2E del flujo principal,
- alineacion de la ruta canonica a `/dashboard/settings` en backend, frontend y pruebas.

---

## 2. Artefactos fuente utilizados

- docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md
- docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-BACKLOG-v1.0.md
- docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-01-v1.0.md
- apps/api/src/modules/tenant/tenant.controller.ts
- apps/api/src/modules/tenant/dto/tenant-settings.dto.ts
- apps/api/src/modules/tenant/dto/tenant-self.dto.ts
- apps/api/src/modules/tenant/dto/tenant-self-update.dto.ts
- apps/api/src/modules/tenant/tenant.service.ts
- apps/api/src/modules/tenant/dashboard-summary.service.ts
- apps/portal/src/app/dashboard/settings/page.tsx
- apps/portal/src/components/settings/SettingsClient.tsx
- apps/portal/src/lib/api-client.ts
- e2e/tests/portal-settings-empresa.spec.ts

---

## 3. Decisiones principales

- El modulo se clasifica como capacidad self-service del tenant, no como modulo de plataforma.
- No se crea bounded context nuevo; el ownership permanece dentro de TenantModule mientras no cambie el boundary.
- Se separa conceptualmente perfil empresarial, configuracion operativa y politicas sensibles.
- Se explicita que no todo flag expuesto en `settings.features` debe ser editable por el tenant.
- Se mantiene como regla que apps/portal solo consume contratos `me/*` y nunca endpoints globales `/:id`.
- Se implementa `PATCH /api/v1/tenants/me/profile` con DTO self-service propio y auditoria separada.
- `PATCH /api/v1/tenants/me/settings` del portal queda aislado en DTO self-service propio y solo admite `timezone`, `currency`, `language`, `country` y `features.mfa_required_all`.
- `name` permanece en solo lectura en la UI y fuera del DTO self-service por falta de confirmacion final de ownership.
- Se adopta una validacion tecnica base para `nit` de 6 a 15 digitos, sin inventar regla regulatoria adicional.
- La ruta canonica del modulo queda confirmada como `/dashboard/settings`.

---

## 4. Riesgos y pendientes abiertos

| Riesgo / pendiente | Impacto | Estado |
| --- | --- | --- |
| Confirmar ownership final de `name` | Medio | Abierto |
| Definir si la validacion de NIT requiere una regla de negocio/regulatoria mas estricta | Medio | Abierto |
| Confirmar si `maxSubscribers` seguira oculto o pasara a solo lectura visible en futuras fases | Bajo | Abierto |
| Mantener coverage adicional de integracion HTTP para validaciones DTO si la fase crece | Bajo | Abierto |

---

## 5. Siguiente paso recomendado

1. Validar con CTO/negocio si `name` puede pasar de solo lectura a tenant-managed sin impactar naming administrativo.
2. Confirmar si la validacion de NIT debe incorporar checksum o reglas tributarias adicionales.
3. Considerar una prueba HTTP de integracion para demostrar a nivel de ValidationPipe que `billing` y `maxSubscribers` no entran por el contrato self-service.

---

## 6. Artefactos generados en esta iteracion

- docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-BACKLOG-v1.0.md
- docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-01-v1.0.md
- apps/api/src/modules/tenant/dto/tenant-self-update.dto.ts
- apps/portal/src/components/settings/CompanyProfileForm.tsx
- apps/portal/src/components/settings/OperationalSettingsForm.tsx
- apps/portal/src/components/settings/SecuritySettingsCard.tsx
- e2e/tests/portal-settings-empresa.spec.ts

---

## 7. Decisiones refinadas

- Se separa definitivamente la escritura de `profile` y `settings` para evitar payloads ambiguos.
- `features.billing` y `maxSubscribers` quedan fuera de la escritura self-service MVP hasta confirmacion de ownership.
- La ruta objetivo del portal se mantiene en `apps/portal/src/app/dashboard/settings/page.tsx`, coherente con la estructura actual del repo.

---

## 8. Cambios ejecutados en Fase 01

### Backend

- Se agrego `PATCH /api/v1/tenants/me/profile` para actualizar campos tenant-managed del perfil empresarial.
- Se crearon DTOs self-service separados de los DTOs de plataforma para `profile` y `settings`.
- Se mantuvo el contrato de plataforma para `PATCH /api/v1/tenants/:id/settings` sin mezclarlo con el flujo del portal.
- Se incorporo auditoria separada para `TenantProfile` y `TenantSettings` self-service.

### Frontend portal

- La pantalla `apps/portal/src/app/dashboard/settings/page.tsx` dejo de ser placeholder.
- Se implementaron tres bloques independientes: Perfil empresarial, Configuracion operativa y Seguridad.
- El rol `ADMIN` puede editar; `ACCOUNTANT`, `NOC` y `SUPPORT` quedan en modo solo lectura.
- `features.billing` se expone como solo lectura y `maxSubscribers` queda fuera del formulario.

### Navegacion y consistencia

- Se alineo la ruta canonica a `/dashboard/settings`.
- Se corrigieron alertas de onboarding y pruebas que aun apuntaban a `/settings`.

---

## 9. Evidencia de calidad

- Pruebas unitarias backend ajustadas para `PATCH /tenants/me/profile` y `PATCH /tenants/me/settings` self-service.
- Cobertura unitaria de servicio para auditoria y enforcement de campos permitidos.
- Nueva prueba E2E del flujo `login/session -> /dashboard/settings -> guardar perfil -> guardar settings -> guardar seguridad`.
- Prueba E2E de modo solo lectura para `NOC`.

---

## 10. Decision de salida

- Estado recomendado: `GO` para cierre de Fase 01 dentro del alcance aprobado.
- Bloqueos no detectados: no hubo necesidad de migracion estructural ni de cambio de stack.
- Restriccion preservada: no se habilito escritura de campos platform-managed.

---

## 11. Preparacion de Fase 02 — Cobertura Comercial y Planes y Valores

Con Fase 01 cerrada con GO, se preparo la expansion del modulo para cubrir las dos subcapacidades faltantes:

- **Cobertura Comercial:** gestion de nodos de cobertura (zona/nodo/radio) con jerarquia, tecnologia disponible y factibilidad por coordenadas.
- **Catalogo de Planes y Valores:** gestion del catalogo de planes de servicio del tenant con velocidades, precios, ciclos y features.

Decision de boundary: ambas subcapacidades pertenecen a MOD03 dentro de TenantModule, no a MOD05 CRM. CRM las consume via contratos read-only (`ICoverageReadPort`, `IPlanCatalogReadPort`).

Artefactos emitidos:

| Documento | Ruta | Estado |
| --- | --- | --- |
| Prompt Fase 02 | `docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md` | Aprobado |
| Backlog Fase 02 | `docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md` | Aprobado |

Backlog: 13 tareas (BT-CE2-01 a BT-CE2-13), priorizadas P0 a P3.

---

## 12. Aprobacion documental y habilitacion de ejecucion

El 2026-03-23 se aprobaron los cinco documentos vigentes de MOD03 para habilitar la ejecucion de Fase 02 por el Sr. Dev Fullstack:

| Documento | Estado anterior | Estado nuevo |
| --- | --- | --- |
| PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md | En revision | Aprobado |
| HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md | En revision | Aprobado |
| PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md | En revision | Aprobado |
| PLAN-MOD03-CONFIGURACION-EMPRESA-FASE-02-v1.0.md | En revision | Aprobado |
| Este informe | En revision | Aprobado |

El paquete queda listo para entregar al Sr. Dev Fullstack para ejecucion.
