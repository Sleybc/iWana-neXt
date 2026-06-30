# INFORME - TRANSVERSAL WEB PLATAFORMA - AUDITORIA UI

**Version:** 1.0  
**Estado:** Activo  
**Fecha:** 2026-06-26  
**Modo activo:** AI-SR-UI-SYS + AI-EM-ARCH  
**Superficie auditada:** `apps/web`  
**Plan de remediacion:** `docs/plans/2026-06-26-web-platform-iwana-fullstack-remediation.md`  
**Skills rectoras:** `iwana-identity-ui-review`, `ui-ux-pro-max`, `senior-ui-systems-designer`, `system-vocabulary-review`  
**Artefactos fuente usados:**  
- `docs/identity/Manual_Implementacion_Identidad_Iwana.md`  
- `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`  
- `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`  
- `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md`

---

## 1. Contexto

Se realizo una auditoria transversal de toda la consola administrativa de plataforma (`apps/web`) para evaluar alineacion con la identidad iWana, consistencia sistemica, claridad operativa B2B, accesibilidad y soporte real del backend.

La auditoria cubrio:

- shell autenticado
- dashboard
- empresas
- usuarios
- auditoria
- perfil
- configuracion
- login y recuperacion de acceso
- alta y configuracion de empresa
- buscador global

El objetivo no fue solo detectar deuda visual. Tambien se reviso si la UI esta apoyada por contratos API coherentes, nomenclatura estable y una estructura documental suficiente para ejecutar mejoras sin abrir ambiguedad de ownership.

---

## 2. Alcance auditado

| Area | Archivos principales |
|---|---|
| Shell | `apps/web/src/components/layout/Sidebar.tsx`, `TopHeader.tsx`, `PageHeader.tsx`, `apps/web/src/app/(protected)/layout.tsx` |
| Dashboard | `apps/web/src/components/dashboard/DashboardClient.tsx`, `MetricCard.tsx`, `PanelCard.tsx`, `SystemStatusPanel.tsx`, `TenantsTable.tsx` |
| Empresas | `apps/web/src/app/(protected)/tenants/page.tsx`, `apps/web/src/components/tenants/TenantCreateForm.tsx`, `TenantSettingsPageClient.tsx`, `TenantSettingsForm.tsx` |
| Usuarios | `apps/web/src/app/(protected)/users/page.tsx`, `UsersTable.tsx`, `UserCreateModal.tsx`, `UserManagementModal.tsx` |
| Auditoria | `apps/web/src/app/(protected)/audit-logs/page.tsx`, `AuditSummary.tsx`, `AuditLogsTable.tsx` |
| Configuracion y perfil | `apps/web/src/app/(protected)/settings/page.tsx`, `PlatformBrandingSettings.tsx`, `SecuritySettings.tsx`, `apps/web/src/app/(protected)/profile/page.tsx`, `ProfileForm.tsx` |
| Auth | `apps/web/src/components/auth/PlatformLoginExperience.tsx`, `LoginForm.tsx`, `apps/web/src/app/auth/forgot-password/page.tsx` |
| Search | `apps/web/src/components/search/GlobalSearch.tsx`, `GlobalSearchOverlay.tsx`, `useGlobalSearch.ts` |
| Backend relacionado | `apps/api/src/modules/tenant/*`, `users/*`, `platform-users/*`, `platform-branding/*`, `audit/*`, `search/*`, `health/*` |

---

## 3. Resumen ejecutivo

`apps/web` ya tiene piezas valiosas: branding publico, formularios importantes migrados a `@iwana/ui`, una base razonable de tablas y estados, y contratos API existentes para tenants, usuarios, auditoria, branding y busqueda. El problema principal no es ausencia de funcionalidad, sino falta de consolidacion.

Hoy la consola se percibe como una suma de pantallas correctas pero aisladas, no como un sistema administrativo unico con lenguaje visual, vocabulario y jerarquia operativa consistentes.

Las brechas mas relevantes son:

1. La identidad iWana no esta sistematizada en el shell, el dashboard ni las tablas principales.
2. Hay componentes duplicados y micro-patrones locales que fragmentan la experiencia.
3. Existen inconsistencias full stack entre contratos parecidos, especialmente en auditoria.
4. Varias pantallas muestran datos derivados o placeholders que erosionan confianza operativa.
5. No existe un artefacto rector transversal para la consola de plataforma completa; el gobierno documental hoy esta repartido entre MOD00 y MOD01.

---

## 4. Hallazgos prioritarios

| Severidad | ID | Hallazgo | Impacto |
|---|---|---|---|
| Alta | A-1 | El shell protegido usa un lenguaje visual generico y gris; no comunica una consola iWana con jerarquia operativa clara | Baja recordacion de marca, lectura plana, experiencia poco distintiva |
| Alta | A-2 | `DashboardClient` construye la portada casi solo desde `tenantApi.list()` y heuristicas locales | La home no refleja salud real de plataforma ni actividad confiable |
| Alta | A-3 | `TenantsTable` se reutiliza en dashboard y en `/tenants`, pero expone una columna `Suscriptores` sin dato real (`—`) | Genera promesa incumplida y ruido cognitivo |
| Alta | A-4 | `UsersPage` y `AuditLogsPage` duplican el mismo selector custom de empresa | Deuda de mantenimiento, estilos divergentes y mas superficie de bugs |
| Alta | A-5 | El contrato de auditoria no es simetrico: `platformAuditApi.list()` devuelve paginacion cursor-based, `auditApi.list()` devuelve arreglo plano | Complejiza frontend, impide un modelo unico de tabla y paginacion |
| Media-Alta | M-1 | `ProfileForm` mezcla `@iwana/ui` con inputs nativos y hardcodes de sombra/radio | Inconsistencia con el resto del sistema y mayor deuda de accesibilidad |
| Media-Alta | M-2 | Auth y recuperacion de acceso usan buen tono visual pero siguen con demasiados estilos locales y clases no sistematizadas | Dificulta evolucion y replica patrones fuera del login |
| Media | M-3 | `GlobalSearch` y su overlay siguen siendo generic search, no un centro de navegacion operativo iWana | Valor util pero poca potencia como comando central de plataforma |
| Media | M-4 | El vocabulario visible oscila entre `Dashboard`, `Mi Perfil`, `Registros de auditoria`, `Administracion`, `Gestion interna` | Falta sistema de lenguaje de producto para plataforma |
| Media | M-5 | No existe un informe transversal previo para `apps/web`; la trazabilidad documental esta dispersa | Riesgo de ejecutar cambios parciales sin vista de conjunto |

---

## 5. Evidencia full stack por capability

| Capability | Estado actual | Dependencia backend/documental | Riesgo |
|---|---|---|---|
| Dashboard de plataforma | Calcula metricas desde listado de tenants y muestra actividad reciente inferida por `updatedAt` | Requiere apoyarse en `platform-audit`, `health` y/o un summary dedicado | Home poco confiable para operacion real |
| Directorio de empresas | Buen CRUD base, pero la tabla y el create flow no cuentan una historia operativa completa | `tenant.controller.ts`, `tenant.service.ts`, DTOs de tenant | Se siente administrativo, no de control plane |
| Usuarios por empresa | Funcional, pero contextualizado de forma debil y con selector duplicado | `users.controller.ts`, `users.service.ts` | Mayor friccion para admins de plataforma |
| Auditoria | Dos vistas potentes, pero con contrato desigual entre plataforma y tenant | `platform-audit.controller.ts`, `audit.controller.ts`, `audit-query.service.ts` | Tabla mas compleja de mantener y extender |
| Perfil + settings | Existen rutas separadas, pero sus patrones visuales divergen y parte del copy es tecnico | `platform-users`, `platform-branding` | Fragmentacion entre cuenta personal y configuracion de plataforma |
| Auth | Buena base estetica, pero muy dependiente de clases inline/hardcodeadas | `platform-users.controller.ts`, bootstrap status y auth flows | Escalado costoso al cambiar identidad o variantes |
| Search global | Tiene endpoint y overlay, pero no esta explotado como comando de navegacion | `search.controller.ts`, `search.service.ts` | Valor subutilizado |

---

## 6. Documentacion y gobernanza

### 6.1 Estado actual

- `MOD00` gobierna parte del lenguaje administrativo, settings y control plane tenant.
- `MOD01` gobierna tenants, audit y users desde arquitectura base.
- No existe hoy un PRD o HLD unico para la consola administrativa de plataforma como producto transversal.

### 6.2 Decision documental para este ciclo

No se inventa un PRD nuevo en esta iteracion. Para no abrir un artefacto rector incompleto, se crea:

1. este informe transversal de auditoria
2. un plan ejecutable full stack que ata `apps/web` con `MOD00`, `MOD01`, `audit`, `search` y `branding`

### 6.3 Gap explicitado

Si la consola de plataforma va a crecer como producto de primera clase, despues de ejecutar la remediacion se recomienda crear un HLD transversal de `apps/web` que defina:

- informacion de portada de plataforma
- principios de navegacion
- taxonomia visible
- contratos summary/overview para la consola
- relation con tenants, auditoria, branding y auth

---

## 7. Plan de mejora propuesto

La remediacion se divide en seis frentes ejecutables:

1. Fundaciones de sistema: vocabulario, shell, tokens, componentes compartidos.
2. Portada y directorio de empresas: dashboard, tabla de empresas, alta y settings de empresa.
3. Contexto compartido de empresa: selector unificado y flujos de usuarios/auditoria.
4. Cuenta y configuracion de plataforma: perfil, settings, branding y seguridad.
5. Auth y search: login, recuperacion administrada y buscador global.
6. Contratos, pruebas y cierre documental: API client, DTOs, tests, E2E e informes vivos.

La version ejecutable de este roadmap queda en:

- `docs/plans/2026-06-26-web-platform-iwana-fullstack-remediation.md`

---

## 8. Riesgos y decisiones a vigilar

| ID | Riesgo o decision | Tratamiento recomendado |
|---|---|---|
| R-1 | Introducir una nueva API summary para portada puede cruzar responsabilidades entre `tenant`, `audit` y `health` | Implementarla como query facade explicita, no como acceso cruzado improvisado |
| R-2 | Unificar auditoria tenant/plataforma puede romper consumidores actuales | Hacer cambio aditivo, con tests HTTP y adaptacion controlada del `api-client` |
| R-3 | Reemplazar copy visible sin sistema central puede generar otra ronda de drift | Centralizar vocabulario de plataforma en un archivo compartido del frontend |
| R-4 | Refactorizar formularios de perfil y auth sin cerrar tests aumentaria riesgo de regresion | Ejecutar por fases con cobertura focalizada y smoke E2E |

---

## 9. Estado final

**Estado del informe:** Cerrado — remediacion ejecutada  
**Resultado:** plan `2026-06-26-web-platform-iwana-fullstack-remediation.md` aplicado con verificacion full stack  
**Siguiente paso recomendado:** HLD transversal de `apps/web` si la consola crece como producto de primera clase (ver seccion 6.3)

---

## 10. Avance de ejecucion

### Corte 2026-06-26

Durante la ejecucion del plan quedaron aplicados estos avances sobre `apps/web` y sus contratos asociados:

- shell y vocabulario base de plataforma consolidados en un diccionario compartido
- selector reutilizable de empresa incorporado en usuarios y auditoria
- contrato de auditoria tenant/plataforma normalizado con paginacion consistente en frontend y backend
- dashboard conectado a salud de plataforma y actividad reciente real
- copy y jerarquia ajustados para separar `Mi cuenta`, `Plataforma` y `Configuracion de empresa`
- buscador global corregido y validado como comando de navegacion usable
- `PlatformBrandingSettings` refinado para privilegiar upload + preview y relegar origenes avanzados a un disclosure secundario
- `TenantCreateForm` y `TenantCreateSummary` reorientados a puesta en marcha operativa, no solo a completitud de formulario

### Verificacion ejecutada

- `pnpm --filter @iwana/web typecheck` — OK
- `pnpm --filter @iwana/web lint` — OK
- `pnpm --filter @iwana/web test --passWithNoTests` — 17 suites / 67 tests OK
- `pnpm --filter @iwana/api test -- tenant` — 14 suites / 136 tests OK
- `pnpm --filter @iwana/api test -- users` — 5 suites / 120 tests OK
- `pnpm --filter @iwana/api test -- audit` — 5 suites / 35 tests OK
- `pnpm --filter @iwana/api test -- platform-branding` — 1 suite / 5 tests OK
- `pnpm --filter @iwana/api test -- platform-users` — 2 suites / 28 tests OK
- `pnpm --filter @iwana/api test -- search` — 3 suites / 8 tests OK
- `pnpm test:e2e` — 5/5 specs activos en verde tras corregir conflicto de merge, vocabulario E2E, desempaquetado paginado en `api-client.ts` y flujos MFA/OTP en settings

### Decisiones de implementacion registradas

- El DTO paginado de auditoria quedo en `audit-log-response.dto.ts` (`AuditLogListResponseDto` y `PlatformAuditLogListResponseDto`) con forma `{ data, nextCursor, total }` en tenant y plataforma.
- El vocabulario visible de plataforma se centralizo en `apps/web/src/lib/platform-ui-copy.ts`.
- El HLD MOD01 se actualizo en la seccion `GET /api/v1/audit-logs` para reflejar el contrato unificado.

### Backlog visible despues del corte

- ampliar la racionalizacion visual de `PlatformBrandingSettings` con pruebas dedicadas si el modulo sigue creciendo
- fortalecer `TenantCreateForm` con pruebas focalizadas de resumen operativo y acciones post-activacion
- ampliar smoke tests de plataforma para usuarios y auditoria, dado que dashboard y directorio ya tienen cobertura focalizada
