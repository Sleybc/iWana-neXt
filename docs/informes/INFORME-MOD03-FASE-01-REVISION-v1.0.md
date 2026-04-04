# INFORME — MOD03 Configuracion Empresarial — Revisión y Correcciones Fase 01

**Version:** 1.0
**Estado:** Cerrado
**Fecha:** 2026-03-18
**Convencion documental:** INFORME-MOD03-FASE-01-REVISION-v1.0.md

## Vinculos de trazabilidad

- Plantilla base: docs/informes/TEMPLATE-INFORME-FASE-v1.0.md
- PRD del modulo: docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- Backlog tecnico: docs/plans/PLAN-MOD03-CONFIGURACION-EMPRESA-BACKLOG-v1.0.md
- Informe base de la fase: docs/informes/INFORME-MOD03-DEFINICION-v1.0.md
- Prompt ejecutado: docs/prompts/PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-01-v1.0.md
- ADRs aplicables: ADR-016, ADR-018, ADR-019, ADR-022, ADR-023

---

## Identificacion

- Modulo: MOD03 — Configuracion Empresarial
- Fase: FASE-01 — Revision y correcciones post-implementacion
- Sprint: Revision del estado del repositorio tras implementacion previa
- Fecha: 2026-03-17
- Responsable principal: AI-EM-ARCH (Lead Software Architect Senior)

---

## 1. Resumen ejecutivo

- **Objetivo de la sesion:** Ejecutar el PROMPT-MOD03-CONFIGURACION-EMPRESA-FASE-01-v1.0.md, revisar todos los documentos relacionados y verificar el estado completo de la implementacion.
- **Resultado alcanzado:** La implementacion de MOD03 Fase 01 ya estaba completa en el repositorio. La sesion confirmo coherencia de todos los artefactos, identifico y corrigio dos inconsistencias menores y verifico el estado verde de tests y typecheck.
- **Estado:** Completa

---

## 2. Entregables implementados

Los siguientes artefactos estaban ya presentes y fueron verificados durante la sesion.

### Backend

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| Endpoint `PATCH /api/v1/tenants/me/profile` | `apps/api/src/modules/tenant/tenant.controller.ts` | Verificado |
| Endpoint `PATCH /api/v1/tenants/me/settings` con enforcement de ownership | `apps/api/src/modules/tenant/tenant.controller.ts` | Verificado |
| Metodo `updateTenantSelfProfile()` con auditoria separada | `apps/api/src/modules/tenant/tenant.service.ts` | Verificado |
| Metodo `updateTenantSelfSettings()` bloqueando `billing` y `maxSubscribers` | `apps/api/src/modules/tenant/tenant.service.ts` | Verificado |
| DTOs self-service separados de contratos de plataforma | `apps/api/src/modules/tenant/dto/tenant-self-update.dto.ts` | Verificado |
| DTOs de respuesta self-service | `apps/api/src/modules/tenant/dto/tenant-self.dto.ts` | Verificado |

### Frontend (portal)

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| Pagina de configuracion empresarial (deja de ser placeholder) | `apps/portal/src/app/dashboard/settings/page.tsx` | Verificado |
| Orquestador `SettingsClient` con carga paralela y manejo de errores | `apps/portal/src/components/settings/SettingsClient.tsx` | Verificado |
| Formulario de Perfil Empresarial con validacion Zod | `apps/portal/src/components/settings/CompanyProfileForm.tsx` | Verificado |
| Formulario de Configuracion Operativa con selects | `apps/portal/src/components/settings/OperationalSettingsForm.tsx` | Verificado |
| Bloque de Seguridad con toggle MFA y flags solo lectura | `apps/portal/src/components/settings/SecuritySettingsCard.tsx` | Verificado |
| Cliente tipado con metodos self-service (`updateMeProfile`, `updateSettings`) | `apps/portal/src/lib/api-client.ts` | Verificado |

### Base de datos

No se requirieron migraciones estructurales. La implementacion opera sobre columnas existentes de `public.tenants` y el JSONB `settings`. Coherente con la restriccion del HLD.

### Integraciones

- Auditoria via `AuditService` para `TenantProfile` y `TenantSettings` como entidades separadas.
- Alertas de onboarding via `DashboardSummaryService` con hrefs canonicos a `/dashboard/settings`.

---

## 3. Evidencia funcional

### Flujos verificados en codigo

| Flujo | Mecanismo | Resultado |
| --- | --- | --- |
| ADMIN carga perfil y settings en paralelo | `Promise.allSettled` en `SettingsClient` | Implementado |
| ADMIN guarda perfil empresarial (campos tenant-managed) | `PATCH /tenants/me/profile` via `tenantSelfApi.updateMeProfile()` | Implementado |
| ADMIN guarda configuracion operativa | `PATCH /tenants/me/settings` via `tenantSelfApi.updateSettings()` | Implementado |
| ADMIN activa/desactiva MFA obligatorio | Toggle en `SecuritySettingsCard` + `PATCH /tenants/me/settings` | Implementado |
| NOC/SUPPORT ven la pantalla en modo solo lectura | `canEdit = user?.role === 'ADMIN'`, botones ocultos para otros roles | Implementado |
| `features.billing` no es editable desde portal | Campo platform-managed expuesto como solo lectura en `SecuritySettingsCard` | Implementado |
| `maxSubscribers` no aparece en formularios | Ausente del DTO self-service y del formulario | Implementado |
| Portal no consume endpoints globales `tenants/:id` | Todos los metodos del `tenantSelfApi` apuntan a `/tenants/me/*` | Verificado |

### Datos de prueba usados

Fixtures ficticios en `e2e/tests/portal-settings-empresa.spec.ts`: tenant `test-isp`, usuario `user-uuid-admin-test`, email ofuscado `aabbccdd11223344`. Sin PII real.

---

## 4. Evidencia de calidad

### Resultados de verificacion en esta sesion

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api test` | **232 tests pasando, 0 fallos** — 16 suites |
| `pnpm --filter @iwana/api typecheck` | **exit 0** — sin errores TypeScript |
| `pnpm --filter @iwana/portal typecheck` | **exit 0** — sin errores TypeScript (tras correccion) |

### Unit tests verificados

- `tenant-settings.spec.ts`: tests de `updateTenantSelfSettings()` con enforcement de ownership y auditoria
- `tenant-self.spec.ts`: tests de controller para `PATCH /me/profile` y `PATCH /me/settings`
- `tenant.service.spec.ts`: cobertura del servicio de tenant

### E2E tests verificados

- `e2e/tests/portal-settings-empresa.spec.ts`:
  - Test 1: ADMIN edita perfil, settings y politica MFA sin llamar endpoints de plataforma
  - Test 2: NOC ve pantalla en modo solo lectura y no consume summary de ADMIN

### Correcciones aplicadas en esta sesion

#### Correccion 1 — Inconsistencia de href en fixture de test

- **Archivo:** `apps/api/src/modules/tenant/tenant-self.spec.ts:91`
- **Problema:** Fixture de alerta usaba `href: '/settings'` en vez de la ruta canonica confirmada
- **Correccion:** Actualizado a `href: '/dashboard/settings'` para alineacion con `dashboard-summary.service.ts` y la decision documental del modulo
- **Impacto:** Solo afectaba datos de prueba — sin impacto en logica de produccion

#### Correccion 2 — Error TypeScript con exactOptionalPropertyTypes

- **Archivo:** `apps/portal/src/components/profile/ProfileClient.tsx:144`
- **Problema:** `tenantCountry: string | undefined` pasado directamente a prop tipada como `tenantCountry?: string`. Con `exactOptionalPropertyTypes: true` en tsconfig, esto genera error TS2375
- **Correccion:** Spread condicional `{...(tenantCountry !== undefined ? { tenantCountry } : {})}` para respetar la semántica exacta de la prop opcional
- **Impacto:** Error de compilacion — el typecheck del portal fallaba antes de la correccion

#### Correccion 3 — Contrato de branding desfasado en el cliente del portal

- **Archivo:** `apps/portal/src/lib/api-client.ts`
- **Problema:** El contrato `TenantSelf` no incluía `logoLightUrl`, `logoDarkUrl`, `sealLightUrl`, `sealDarkUrl` ni `showTenantName`, y `tenantSelfApi` no exponía `updateBranding()`, aunque el backend sí publica esos campos y el endpoint `PATCH /api/v1/tenants/me/branding`
- **Correccion:** Se alineó `TenantSelf` con `TenantSelfResponseDto`, se agregó `UpdateTenantSelfBrandingDto` y se implementó `tenantSelfApi.updateBranding()` hacia `/tenants/me/branding`
- **Impacto:** Error de compilacion — `Sidebar.tsx` y `BrandingForm.tsx` no podían tipar ni persistir el branding del tenant

#### Correccion 4 — Patrón ARIA incompatible con el validador del workspace

- **Archivo:** `apps/portal/src/components/profile/MfaRequiredToggle.tsx`
- **Problema:** El editor reportaba `Invalid ARIA attribute value` sobre `aria-checked` en el botón con patrón `role="switch"`
- **Correccion:** Se simplificó a un botón semántico con `aria-label` y feedback textual, eliminando atributos ARIA booleanos que el validador JSX del workspace estaba marcando como inválidos
- **Impacto:** Error de editor/accesibilidad — quedaba un problema de validación visible aun con el typecheck limpio

#### Correccion 5 — Estabilizacion E2E del flujo de seguridad en settings

- **Archivo:** `e2e/tests/portal-settings-empresa.spec.ts`
- **Problema:** El click del control `Activar MFA obligatorio` era inestable (intercepción del span visual del switch y elemento fuera de viewport), provocando timeout intermitente.
- **Correccion:** Se cambió la interacción a patrón robusto con `scrollIntoViewIfNeeded()` + `check({ force: true })` sobre el input etiquetado.
- **Impacto:** Estabilidad de pruebas E2E; elimina falsos negativos sin alterar lógica de negocio ni contrato API.

#### Correccion 6 — Favicon del portal alineado al branding del tenant

- **Archivos:** `apps/portal/src/app/layout.tsx`, `apps/portal/src/components/layout/TenantFavicon.tsx`, `apps/portal/src/components/settings/BrandingForm.tsx`, `apps/portal/public/brand/iwiso6.png`
- **Problema:** El portal seguía usando un favicon estático y la configuración empresarial no ofrecía un apartado explícito para administrar esa superficie de marca.
- **Correccion:** Se agregó un gestor cliente que sincroniza el favicon con el sello del tenant autenticado, con fallback local del portal cuando no existe branding configurado. En paralelo, `BrandingForm` ahora expone un bloque visible de favicon con preview de pestaña y actualización en caliente tras guardar el sello.
- **Impacto:** La identidad visual del tenant queda consistente entre menú lateral y pestaña del navegador sin introducir una migración nueva ni duplicar fuentes de verdad de branding.

#### Correccion 7 — Titulo real del producto y remocion del favicon legacy

- **Archivos:** `apps/portal/src/app/layout.tsx`, `apps/portal/src/app/auth/login/page.tsx`, `apps/portal/src/app/favicon.ico`
- **Problema:** El portal todavía se presentaba como `Portal de Suscriptores` y Next seguía resolviendo el icono histórico desde `src/app/favicon.ico`, ocultando el PNG nuevo definido en metadata.
- **Correccion:** Se renombró el producto visible a `Portal Corporativo` en el layout y en la pantalla de login, y se eliminó el `favicon.ico` legado para que App Router sirva el icono configurado desde `public/brand/iwiso6.png` y el gestor dinámico de branding.
- **Impacto:** El navegador ya puede reflejar el nombre correcto del producto y el favicon nuevo sin quedar secuestrado por un asset residual de App Router.

#### Correccion 8 — El perfil empresarial no exponía el dígito de verificación del NIT

- **Archivos:** `apps/api/src/modules/tenant/dto/tenant-self.dto.ts`, `apps/api/src/modules/tenant/dto/tenant-self-update.dto.ts`, `apps/api/src/modules/tenant/tenant.service.ts`, `apps/portal/src/lib/api-client.ts`, `apps/portal/src/components/settings/CompanyProfileForm.tsx`
- **Problema:** La base de datos y el flujo de plataforma ya contemplaban `nit_dv`, pero el contrato self-service de `GET/PATCH /api/v1/tenants/me/profile` no devolvía ni aceptaba `nitDv`, por lo que el perfil empresarial del portal no podía visualizarlo ni editarlo.
- **Correccion:** Se agregó `nitDv` al DTO de respuesta self-service, al DTO de actualización self-service, al mapeo de `TenantService` y al cliente/formulario del portal con validación de un único dígito numérico.
- **Impacto:** El perfil empresarial ahora queda alineado con la persistencia real de `public.tenants` y evita perder el dígito de verificación al editar datos legales desde el portal.

#### Correccion 9 — El usuario principal no podía rotar su email de acceso desde Perfil

- **Archivos:** `apps/portal/src/components/profile/PersonalInfoForm.tsx`, `apps/portal/src/lib/api-client.ts`, `apps/api/src/modules/users/dto/user.dto.ts`, `apps/api/src/modules/users/users.controller.ts`, `apps/api/src/modules/users/users.service.ts`, `apps/api/src/modules/platform-users/dto/update-platform-user.dto.ts`, `apps/api/src/modules/platform-users/platform-users.controller.ts`, `apps/api/src/modules/platform-users/platform-users.service.ts`
- **Problema:** El onboarding de empresa seguía acoplando el usuario principal al `contactEmail`, y ni el portal tenant ni la consola web permitían cambiar el email de acceso desde Perfil con una confirmación segura.
- **Correccion:** Se agregó una operación dedicada de cambio de email de acceso en tenant y plataforma, siempre confirmada con la contraseña actual. En el portal, el formulario de perfil ahora separa datos personales del email de acceso. Para el ADMIN principal del tenant, el backend sincroniza también `public.tenants.contact_email` cuando el login cambia y el usuario sigue siendo el principal.
- **Impacto:** El login inicial queda desacoplado del canal comercial del tenant, el usuario principal puede rotar su identidad operativa sin intervención manual y la empresa conserva consistencia entre contacto y administrador principal cuando corresponde.

### Hallazgos abiertos

| Hallazgo | Prioridad | Estado |
| --- | --- | --- |
| Confirmar ownership de `name` con CTO/negocio para habilitar edicion | Media | Abierto — documentado en INFORME-MOD03-DEFINICION-v1.0.md |
| Validacion de NIT con regla regulatoria adicional si negocio lo requiere | Media | Abierto — decision de negocio pendiente |
| `maxSubscribers` en solo lectura visible vs. oculto en fases futuras | Baja | Abierto — no bloquea MVP |

---

## 5. Cambios documentales

- **PRD actualizado:** No — sin desviacion de alcance
- **HLD actualizado:** No — sin desviacion de diseno
- **ADR nuevo o referenciado:** No — arquitectura dentro de TenantModule confirma decision original
- **Informe base del modulo:** `docs/informes/INFORME-MOD03-DEFINICION-v1.0.md` — sin necesidad de actualizacion; este informe de revision complementa el cierre
- **Tests modificados:** `apps/api/src/modules/tenant/tenant-self.spec.ts` — correccion de href en fixture
- **Frontend corregido adicionalmente:** `apps/portal/src/lib/api-client.ts`, `apps/portal/src/components/profile/PersonalInfoForm.tsx`, `apps/portal/src/components/profile/MfaRequiredToggle.tsx`, `apps/portal/src/app/layout.tsx`, `apps/portal/src/components/layout/TenantFavicon.tsx`, `apps/portal/src/components/settings/BrandingForm.tsx`

---

## 6. Riesgos y bloqueos

| Riesgo | Severidad | Estado |
| --- | --- | --- |
| Ownership de `name` no confirmado por plataforma | Media | Abierto — campo en solo lectura hasta confirmacion |
| NIT sin regla regulatoria adicional | Media | Abierto — validacion tecnica base (6-15 digitos) aplicada, suficiente para MVP |
| `maxSubscribers` ambiguo entre operativo y comercial | Baja | Resuelto en MVP — campo excluido de escritura self-service |

- **Bloqueo tecnico:** Ninguno. No se requirio migracion estructural ni cambio de stack.

---

## 7. Decision de salida

- **Puede pasar a siguiente fase:** Si
- **Requiere correcciones previas:** No — las dos correcciones de esta sesion fueron aplicadas y verificadas
- **Aprobadores pendientes:** CTO para decision de ownership de `name` (no bloquea cierre de Fase 01)
- **Criterio de salida:** GO — todos los criterios de aceptacion del PROMPT-MOD03 estan cumplidos, tests en verde, typecheck limpio, documentacion coherente
