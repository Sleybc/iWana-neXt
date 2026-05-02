# PLAN — Alineacion premium de login web + portal

**Tipo:** PLAN  
**Modulo:** Transversal Auth Login Premium  
**Fase:** 01 — Correccion frontend/backend para login empresarial  
**Version:** 1.0  
**Estado:** Listo para ejecucion  
**Fecha:** 2026-05-02  
**Modo activo:** Mixto  
**Responsable de gobierno:** AI-EM-ARCH

---

## 1. Contexto y objetivo

El login administrativo de `apps/web` en variante `premium` queda definido como baseline visual y funcional para la experiencia de acceso. El login empresarial de `apps/portal` debe igualar esa experiencia en composicion, jerarquia, estados y contrato operativo, preservando las diferencias propias del portal tenant-aware: selector/resolucion de empresa, branding publico por tenant, MFA setup para roles criticos y rutas tenant.

La correccion cubre frontend y backend, pero no requiere crear endpoints nuevos. El backend ya expone los contratos base: `POST /api/v1/auth/login`, `POST /api/v1/auth/platform/login` y `GET /api/v1/tenants/public-branding?slug=`. La ejecucion debe endurecer validaciones, pruebas y documentacion alrededor de esos contratos.

---

## 2. Artefactos fuente

| Tipo         | Artefacto                                                                                                    | Uso                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Gobernanza   | [Perfil_IA_EM_Architect_Unificado_v1.md](../roles/Perfil_IA_EM_Architect_Unificado_v1.md)                    | Modo Mixto y criterios de salida         |
| Stack        | [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md)                                                         | Versiones y restricciones del sprint     |
| ADR          | [ADR-019-JWT-RS256-Refresh-Rotation.md](../adrs/ADR-019-JWT-RS256-Refresh-Rotation.md)                       | JWT, refresh rotation y seguridad auth   |
| ADR          | [ADR-023-Referencia-TailAdmin-Shell-Dashboard.md](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md)   | Baseline visual transversal              |
| Informe vivo | [INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md](../informes/INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md) | Evolucion visual auth y evidencia previa |
| Informe vivo | [INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md](../informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md)         | Branding publico de login y assets       |

---

## 3. Diagnostico resumido

| ID   | Severidad | Hallazgo                                                                                                     | Impacto                                                                                                  |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| H-01 | Alta      | `apps/portal` resuelve el tenant visible desde un origen distinto al tenant efectivo usado por `api-client`. | Riesgo de login contra empresa distinta a la que muestra la UI o branding inconsistente.                 |
| H-02 | Alta      | El portal puede usar fallback local `iwana` cuando el campo Empresa esta vacio.                              | El login parece requerir empresa, pero funcionalmente puede autenticar contra otro tenant en desarrollo. |
| H-03 | Media     | El copy dice "correo o identidad", pero `loginSchema` solo acepta email.                                     | Promesa funcional falsa y errores de validacion confusos.                                                |
| H-04 | Media     | La experiencia premium de web y portal no comparten una base tecnica comun.                                  | Drift visual recurrente entre apps.                                                                      |
| H-05 | Media     | E2E portal usa labels y mocks desalineados con la UI y el envelope `{ data }`.                               | Cobertura fragil; puede pasar o fallar por razones distintas al contrato real.                           |
| H-06 | Baja      | No hay unit tests para componentes auth del portal.                                                          | Cambios visuales/funcionales quedan sin red de regresion local.                                          |

---

## 4. Decision tecnica

**Recomendacion:** extraer el baseline premium de auth hacia una superficie compartida reusable por `apps/web` y `apps/portal`, preferiblemente en `packages/ui`, y mantener en cada app solo la logica especifica de autenticacion.

**Justificacion:** copiar clases desde web al portal resolveria el sintoma visual, pero mantendria dos implementaciones divergentes. Un baseline compartido reduce drift, habilita pruebas de componentes y mantiene boundaries: `@iwana/ui` provee shell, paneles, estilos y primitivas visuales; cada app conserva su `AuthProvider`, `api-client` y reglas de negocio.

**Requiere ADR:** No, si no se cambian stack, boundary ni patron de integracion.  
**Requiere CTO:** No, salvo que durante ejecucion se proponga eliminar el selector de empresa, cambiar el contrato de login o soportar username distinto de email.

---

## 5. Alcance

### En scope

- Alinear `apps/portal/src/app/auth/login/page.tsx`, `LoginExperience`, `LoginBrandPanel` y `LoginForm` a la experiencia premium de `apps/web`.
- Reutilizar o extraer estilos/componentes premium auth desde `apps/web` hacia `packages/ui`.
- Unificar resolucion de tenant en portal para UI, branding, login, refresh, MFA, recovery y favicon.
- Endurecer validacion backend de tenant slug en endpoints publicos tenant-aware.
- Actualizar pruebas unitarias, HTTP y E2E afectadas.
- Actualizar informe vivo de adopcion visual y, si aplica, branding.

### Fuera de scope

- Crear nuevos endpoints de autenticacion.
- Cambiar modelo de JWT, refresh rotation o MFA.
- Soportar login por username/identidad distinto de email.
- Redisenar MFA setup, change-password, forgot-password o reset-password mas alla de compatibilidad visual minima.
- Cambiar modelo de branding o storage.

---

## 6. Diseno de solucion

### 6.1 Frontend compartido

Crear una base reusable en `packages/ui` para la experiencia premium de auth:

| Pieza              | Ubicacion sugerida                                     | Responsabilidad                                                                        |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `AuthPremiumShell` | `packages/ui/src/components/auth/AuthPremiumShell.tsx` | Shell central premium con fondo, aside desktop, panel formulario y soporte responsive. |
| `AuthBrandHeader`  | `packages/ui/src/components/auth/AuthBrandHeader.tsx`  | Logo/nombre compacto reutilizable en desktop/mobile.                                   |
| `authFormStyles`   | `packages/ui/src/components/auth/auth-form-styles.ts`  | Clases de input, labels, alertas, paneles, footer seguro y CTA.                        |
| exports            | `packages/ui/src/index.ts`                             | Exportar componentes y estilos para ambas apps.                                        |

`apps/web` debe seguir usando su experiencia premium actual, pero migrando la composicion visual a la base compartida sin alterar el flujo bootstrap/platform login. `apps/portal` debe consumir la misma base y aportar los slots especificos de empresa, branding tenant y formulario tenant login.

### 6.2 Resolucion unica de tenant en portal

Crear un helper cliente en `apps/portal/src/lib/tenant-resolution.ts` o nombre equivalente:

```typescript
type TenantResolutionSource = 'input' | 'env' | 'storage' | 'none';

interface ResolvedTenantSlug {
  slug: string;
  source: TenantResolutionSource;
  isLocked: boolean;
}
```

Reglas:

1. `NEXT_PUBLIC_TENANT_SLUG` tiene prioridad si existe y bloquea el campo Empresa.
2. Si no hay env, usar `localStorage` como valor inicial visible, no como login silencioso oculto.
3. Si el usuario edita Empresa, el valor del input es el source of truth para branding y login.
4. En produccion, si no hay slug visible, bloquear submit con error local antes de llamar API.
5. En desarrollo, eliminar el fallback silencioso `iwana` del login; solo puede existir como seed sugerido visible si se decide por DX.

El mismo helper debe alimentar:

- `LoginExperience` para estado inicial y branding.
- `LoginForm` para validacion y submit.
- `api-client` para `tenantLogin`, refresh, MFA setup/verify, recovery y rutas tenant-aware.

### 6.3 Backend

No se crean endpoints nuevos. El Sr. Fullstack debe validar y ajustar solo lo siguiente:

1. `TenantMiddleware` y `TenantController.getPublicBranding()` deben normalizar `slug` con `trim().toLowerCase()` y rechazar string vacio o whitespace con `400`.
2. `AuthController.login()` debe conservar envelope `{ data }` y propagar explicitamente `mfaRequired` y `mfaSetupRequired`.
3. OpenAPI/examples deben mostrar respuestas para:
   - login completo,
   - `mfaRequired`,
   - `mfaSetupRequired`,
   - falta de `X-Tenant-Slug`.
4. Tests HTTP deben cubrir login tenant sin `X-Tenant-Slug`, slug con whitespace y `public-branding` con slug normalizado.

### 6.4 Copy y validacion

- Cambiar textos visibles de "Correo electronico / identidad" a "Correo electronico" mientras el contrato sea `email` estricto.
- Mantener sentence case en UI.
- Mensajes de error locales del portal:
  - Empresa vacia: `Ingresa el identificador de la empresa.`
  - Correo invalido: usar mensaje de `loginSchema`.
  - Tenant no encontrado: mapear `404` a `Empresa no encontrada o cuenta inexistente.`

---

## 7. Fases de ejecucion

### Fase 1 — Backend contract hardening

1. Revisar `apps/api/src/modules/auth/auth.controller.ts`, `auth.service.ts`, `tenant.middleware.ts`, `tenant.controller.ts`.
2. Normalizar y validar `X-Tenant-Slug` y `slug` publico.
3. Agregar/ajustar tests:
   - `auth.tenant-context.http.spec.ts` para falta de tenant y whitespace.
   - `tenant.controller.http.spec.ts` para `public-branding` con slug normalizado y vacio.
   - `tenant.swagger.spec.ts` si cambian ejemplos OpenAPI.
4. No modificar modelo de tokens ni scopes MFA.

### Fase 2 — Baseline compartido premium auth

1. Crear componentes/estilos compartidos en `packages/ui`.
2. Migrar `apps/web/src/components/auth/PlatformLoginExperience.tsx` para usar el baseline compartido conservando variante `premium` y `sobria` si sigue vigente.
3. Migrar `apps/web/src/components/auth/LoginForm.tsx` solo en imports de estilos si aplica; no tocar flujo bootstrap salvo necesario por API del componente compartido.
4. Mantener tests `PlatformLoginExperience.spec.tsx` en verde y ampliar cobertura del shell compartido.

### Fase 3 — Portal login premium tenant-aware

1. Refactorizar `apps/portal/src/components/auth/LoginExperience.tsx` para usar `AuthPremiumShell`.
2. Conservar `LoginBrandPanel` solo si queda como adapter tenant-aware; si no, reemplazar por slots del shell compartido.
3. Refactorizar `LoginForm` con estilos compartidos y validacion local del tenant.
4. Crear helper unico de tenant resolution y usarlo en UI + `api-client`.
5. Asegurar que branding publico, favicon y submit usen el mismo slug normalizado.

### Fase 4 — Pruebas y evidencia

1. Agregar unit tests en `apps/portal/src/components/auth/` para:
   - tenant env bloqueado,
   - tenant localStorage visible,
   - tenant vacio bloquea submit,
   - branding consulta el mismo slug que login.
2. Corregir `apps/portal/tests/e2e/auth-tenant.spec.ts`:
   - label `Empresa`, no `Tenant`.
   - respuestas mock con envelope `{ data: ... }`.
   - assert de header `X-Tenant-Slug` normalizado.
3. Ejecutar gates focalizados y documentar resultados.

---

## 8. Criterios de aceptacion

| ID        | Criterio                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-ALP-01 | `http://localhost:3002/auth/login` usa composicion premium equivalente a `http://localhost:3001/auth/login` en shell, panel, inputs, CTA, loading, alertas y footer seguro. |
| CA-ALP-02 | Branding visible del portal, favicon y login usan el mismo tenant slug normalizado.                                                                                         |
| CA-ALP-03 | En portal, submit sin Empresa visible no llama al backend y muestra error local.                                                                                            |
| CA-ALP-04 | En portal, `NEXT_PUBLIC_TENANT_SLUG` prellena y bloquea Empresa de forma explicita.                                                                                         |
| CA-ALP-05 | En portal, si no hay env, el tenant guardado en localStorage se muestra en el input antes de autenticar.                                                                    |
| CA-ALP-06 | `POST /api/v1/auth/login` sin `X-Tenant-Slug` o con slug vacio/whitespace responde `400` sin crear contexto ambiguo.                                                        |
| CA-ALP-07 | `GET /api/v1/tenants/public-branding?slug=` normaliza slug y rechaza vacio/whitespace.                                                                                      |
| CA-ALP-08 | Copy de correo queda alineado al contrato email-only; no se promete login por identidad.                                                                                    |
| CA-ALP-09 | E2E portal auth cubre login, MFA required, MFA setup required y password reset required con envelope real.                                                                  |
| CA-ALP-10 | `apps/web` conserva bootstrap de primer SYSTEM_ADMIN y login plataforma sin regresiones visuales ni funcionales.                                                            |

---

## 9. Validacion obligatoria

Ejecutar al cierre:

```bash
pnpm --filter @iwana/api test -- auth.tenant-context.http.spec.ts tenant.controller.http.spec.ts tenant.swagger.spec.ts
pnpm --filter @iwana/web test -- PlatformLoginExperience.spec.tsx
pnpm --filter @iwana/portal test -- LoginExperience.spec.tsx LoginForm.spec.tsx
pnpm --filter @iwana/web typecheck
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/api typecheck
pnpm test:e2e:portal
```

Si Playwright local falla por limitacion de navegador en Ubuntu 26.04, usar el config local ya documentado para Chrome channel y dejar el gate estandar para CI.

---

## 10. Stop/go

**Detener ejecucion si:**

- La extraccion a `packages/ui` obliga a cambiar tokens globales o Tailwind config.
- El backend requiere cambiar semantica de JWT, MFA setup token o refresh cookies.
- Aparece conflicto entre tenant visible y tenant efectivo que no pueda resolverse sin cambiar contrato.
- Las pruebas muestran posibilidad de login cross-tenant o branding de tenant equivocado.

**Escalar a:** Staff Engineer y CTO si el bloqueo supera 4 horas o requiere cambio de contrato.

**Decision esperada:** mantener endpoints actuales y ajustar UI/client/backend validation; cualquier cambio de contrato debe abrir ADR o addendum aprobado.

---

## 11. Definition of Done

- Plan y prompt de ejecucion versionados.
- Codigo frontend/backend implementado sin nuevos endpoints.
- Tests unitarios, HTTP y E2E focalizados en verde o bloqueo documentado.
- Sin PII, credenciales ni tokens en logs o docs.
- Informe vivo actualizado con evidencia y resultado.
- Sin cambios de stack, boundary o seguridad sin escalacion.
