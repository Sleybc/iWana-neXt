# PROMPT — Ejecucion Transversal Auth Login Premium · Fase 01

**Version:** 1.0  
**Estado:** Listo para ejecucion  
**Fecha:** 2026-05-02  
**Generado por:** Engineering Manager + Lead Software Architect (AI-EM-ARCH)  
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)  
**Convencion documental:** `PROMPT-TRANSVERSAL-AUTH-LOGIN-PREMIUM-FASE-01-v1.0.md`

## Modulo

- Nombre: Auth Login Premium web + portal
- Codigo: TRANSVERSAL-AUTH-LOGIN-PREMIUM
- Fase: 01 — Correccion frontend/backend para login empresarial
- Version: 1.0
- Fecha: 2026-05-02
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-TRANSVERSAL-AUTH-LOGIN-PREMIUM-FASE-01-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** `apps/portal` debe ofrecer una experiencia de login premium equivalente a `apps/web` (`/auth/login` variante premium), con frontend, cliente HTTP, backend auth/tenant y pruebas alineadas al mismo contrato funcional.
- **Lo que si entra:**
  - Extraccion o reutilizacion del baseline premium auth en `packages/ui`.
  - Refactor de login premium en `apps/web` sin regresion del bootstrap de plataforma.
  - Refactor de login tenant-aware en `apps/portal` con la misma gramática visual premium.
  - Unificacion de tenant slug visible y tenant slug efectivo en portal.
  - Hardening backend de `X-Tenant-Slug` y `public-branding` para slug vacio/whitespace/normalizado.
  - Pruebas unitarias, HTTP y E2E focalizadas.
  - Actualizacion de informe vivo.
- **Lo que no entra:**
  - Endpoints nuevos.
  - Cambio de JWT, refresh rotation, cookies o scopes MFA.
  - Login por username/identidad distinto de email.
  - Redisenar flujos MFA, forgot-password, reset-password o change-password fuera de compatibilidad visual minima.

---

## 2. Artefactos de entrada obligatorios

- Plan de fase: [PLAN-TRANSVERSAL-AUTH-LOGIN-PREMIUM-FASE-01-v1.0.md](../plans/PLAN-TRANSVERSAL-AUTH-LOGIN-PREMIUM-FASE-01-v1.0.md)
- Plantilla base: [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
- Gobernanza: [Perfil_IA_EM_Architect_Unificado_v1.md](../roles/_historico/Perfil_IA_EM_Architect_Unificado_v1.md)
- Stack: [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md)
- ADR auth: [ADR-019-JWT-RS256-Refresh-Rotation.md](../adrs/ADR-019-JWT-RS256-Refresh-Rotation.md)
- ADR UI: [ADR-023-Referencia-TailAdmin-Shell-Dashboard.md](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md)
- Informe vivo TailAdmin: [INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md](../informes/INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md)
- Informe vivo Branding: [INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md](../informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md)
- Artefactos faltantes detectados: no hay PRD especifico para esta correccion; se ejecuta como fase correctiva transversal gobernada por el plan anterior.

---

## 3. Instrucciones para Sr. Dev Fullstack

1. **Leer el plan completo antes de codificar.** Ejecutar en modo implementacion con foco en correccion transversal, no en rediseño libre.
2. **Backend auth/tenant:**
   - Revisar `apps/api/src/modules/auth/auth.controller.ts`, `auth.service.ts`, `tenant.middleware.ts`, `tenant.controller.ts`.
   - Normalizar `X-Tenant-Slug` y query `slug` con `trim().toLowerCase()` donde aplique.
   - Rechazar `slug` vacio o whitespace con `400` antes de buscar tenant.
   - Mantener envelope `{ data }` y propagacion explicita de `mfaRequired` y `mfaSetupRequired`.
   - Actualizar ejemplos OpenAPI si los specs muestran brecha.
3. **Baseline premium compartido:**
   - Crear componentes/estilos auth en `packages/ui/src/components/auth/` y exportarlos desde `packages/ui/src/index.ts`.
   - Reutilizar el layout premium actual de `apps/web` como referencia visual: shell central, fondo con overlay, aside desktop, panel formulario, CTA, alertas, loading y footer seguro.
   - No introducir `tailwind.config.js`; Tailwind v4 CSS-first se conserva.
4. **apps/web:**
   - Migrar `PlatformLoginExperience` al baseline compartido sin alterar flujos `bootstrap_email`, `bootstrap_password`, `login`.
   - Conservar variante `premium` como default; preservar `sobria` si no genera complejidad excesiva.
   - Mantener `PlatformLoginExperience.spec.tsx` y ampliarlo si cambia el contrato del componente.
5. **apps/portal:**
   - Refactorizar `LoginExperience`, `LoginBrandPanel` y `LoginForm` para igualar la experiencia premium de web.
   - Crear helper unico de tenant resolution en `apps/portal/src/lib/tenant-resolution.ts` o nombre equivalente.
   - Asegurar que UI, branding publico, favicon, `tenantLogin`, refresh, MFA setup/verify y recovery usen el mismo slug normalizado.
   - Si `NEXT_PUBLIC_TENANT_SLUG` existe, prellenar y bloquear Empresa de forma visible.
   - Si no existe env, prellenar desde localStorage de forma visible; nunca autenticar con slug oculto.
   - Submit sin Empresa debe fallar localmente y no llamar backend.
   - Cambiar copy visible a `Correo electronico` mientras `loginSchema` sea email-only.
6. **Pruebas:**
   - Agregar unit tests de portal auth para tenant env bloqueado, localStorage visible, tenant vacio y slug usado por branding/login.
   - Corregir E2E portal para label `Empresa`, mocks con `{ data }` y headers esperados.
   - Agregar/ajustar HTTP specs backend para slug vacio/whitespace y normalizacion.
7. **Documentacion:**
   - Actualizar [INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md](../informes/INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md) con resultado, archivos tocados y evidencia.
   - Si se toca comportamiento de branding publico, actualizar tambien [INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md](../informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md) como addendum breve.
   - No crear informes duplicados.

---

## 4. Restricciones no negociables

- Usar `pnpm`, nunca `npm` ni `yarn`.
- No hardcodear tenant, schema, slug, credenciales ni tokens.
- No acceder directamente a tablas de otro modulo.
- No relajar validaciones de auth por conveniencia.
- No guardar el token `mfa-setup` como sesion completa.
- No mostrar PII, tokens ni detalles internos de backend en logs o UI.
- No introducir dependencias visuales externas ni URLs remotas hardcodeadas para assets.
- No modificar stack, Tailwind config ni contratos de JWT sin escalacion.
- Todo texto visible en UI debe estar en español y sentence case.

---

## 5. Entregables tecnicos obligatorios

- `packages/ui/src/components/auth/**` con baseline premium auth compartido.
- `apps/web/src/components/auth/PlatformLoginExperience.tsx` alineado al baseline compartido.
- `apps/portal/src/components/auth/LoginExperience.tsx`, `LoginBrandPanel.tsx`, `LoginForm.tsx` alineados al baseline premium.
- `apps/portal/src/lib/tenant-resolution.ts` o helper equivalente.
- `apps/portal/src/lib/api-client.ts` usando la resolucion unica de tenant.
- Backend auth/tenant hardening si las validaciones actuales no cubren slug vacio/whitespace.
- Tests unitarios frontend en web/portal.
- Tests HTTP backend.
- E2E portal auth corregido.

---

## 6. Entregables documentales obligatorios

- Actualizacion de [INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md](../informes/INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md).
- Addendum en [INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md](../informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md) solo si se modifica comportamiento de branding publico.
- Evidencia de comandos ejecutados y resultados.
- Si aparece bloqueo tecnico: decision stop/go documentada en el informe vivo.

---

## 7. Criterios de aceptacion

- CA-ALP-01: `http://localhost:3002/auth/login` iguala la experiencia premium de `http://localhost:3001/auth/login` en shell, jerarquia, panel, inputs, alertas, CTA, loading y footer seguro.
- CA-ALP-02: `apps/web` conserva bootstrap inicial, login plataforma, MFA y password reset sin regresion.
- CA-ALP-03: Portal usa un unico tenant slug normalizado para input, branding, favicon, login, refresh y MFA.
- CA-ALP-04: Empresa vacia bloquea submit local y no llama a `/api/v1/auth/login`.
- CA-ALP-05: `NEXT_PUBLIC_TENANT_SLUG` prellena y bloquea Empresa de forma visible.
- CA-ALP-06: Tenant guardado en localStorage aparece en el input si no hay env.
- CA-ALP-07: Backend responde `400` para auth tenant publico sin slug o con slug vacio/whitespace.
- CA-ALP-08: `public-branding` normaliza slug y rechaza vacio/whitespace.
- CA-ALP-09: UI ya no promete login por identidad si el contrato sigue siendo email-only.
- CA-ALP-10: E2E portal auth cubre login completo, MFA required, MFA setup required y password reset required con envelope `{ data }`.

---

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - La extraccion a `packages/ui` requiere cambiar Tailwind config o tokens globales.
  - Se necesita cambiar semantica de JWT, refresh cookie o scope `mfa-setup`.
  - Hay posibilidad de autenticar contra un tenant distinto al visible en UI.
  - El contrato email-only no alcanza y se decide soportar username/identidad.
- **Documentar causa en:** [INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md](../informes/INFORME-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md)
- **Escalar a:** Staff Engineer y CTO si el bloqueo supera 4 horas o requiere cambio de contrato.
- **Recomendacion esperada:** mantener contratos actuales y corregir UI/client/backend validation; abrir ADR solo si cambia contrato, boundary o seguridad.

---

## 9. Criterio de salida de la fase

- Backend validado:
  - `pnpm --filter @iwana/api test -- auth.tenant-context.http.spec.ts tenant.controller.http.spec.ts tenant.swagger.spec.ts`
  - `pnpm --filter @iwana/api typecheck`
- Frontend validado:
  - `pnpm --filter @iwana/web test -- PlatformLoginExperience.spec.tsx`
  - `pnpm --filter @iwana/portal test -- LoginExperience.spec.tsx LoginForm.spec.tsx`
  - `pnpm --filter @iwana/web typecheck`
  - `pnpm --filter @iwana/portal typecheck`
- E2E validado:
  - `pnpm test:e2e:portal`
- Documentacion archivada:
  - Informe vivo actualizado con archivos tocados, comandos y resultado.
- Seguridad:
  - Sin PII, tokens, credenciales ni slugs hardcodeados.
