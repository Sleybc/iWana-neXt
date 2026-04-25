# Plan Tecnico - MOD03 Configuracion Empresarial Backlog Ejecutable

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-03-17  
**Modo activo:** Mixto

## Trazabilidad

- PRD base: docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- HLD base: docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md
- Informe relacionado: docs/informes/INFORME-MOD03-DEFINICION-v1.0.md

---

## Objetivo

Traducir MOD03 en un backlog tecnico ejecutable para cerrar la brecha entre la lectura self-service existente y una configuracion empresarial realmente operable desde apps/portal.

---

## Prioridad P0 - Contratos y ownership correctos

### BT-CE-01 - Separar lectura de perfil y settings del tenant

**Archivos objetivo**

- apps/api/src/modules/tenant/tenant.controller.ts
- apps/api/src/modules/tenant/tenant.service.ts
- apps/api/src/modules/tenant/dto/tenant-self.dto.ts

**Objetivo**

Dejar explicitos los contratos de perfil empresarial y settings operativos del tenant autenticado.

**Criterios de cierre**

- `GET /tenants/me` y `GET /tenants/me/settings` cubren el modelo del HLD.
- Los DTOs del tenant no reutilizan contratos globales de plataforma de forma ambigua.

### BT-CE-02 - Crear escritura self-service de perfil empresarial

**Archivos objetivo**

- apps/api/src/modules/tenant/tenant.controller.ts
- apps/api/src/modules/tenant/tenant.service.ts
- dto nuevo para update profile

**Objetivo**

Agregar `PATCH /api/v1/tenants/me/profile` para campos tenant-managed de `public.tenants`.

**Criterios de cierre**

- Solo `ADMIN` puede ejecutar el endpoint.
- El payload no permite escribir `slug`, `status` ni otros campos platform-managed.
- El cambio queda auditado.

### BT-CE-03 - Endurecer escritura de settings por ownership

**Archivos objetivo**

- apps/api/src/modules/tenant/tenant.service.ts
- apps/api/src/modules/tenant/dto/tenant-settings.dto.ts

**Objetivo**

Permitir editar solo settings tenant-managed y bloquear flags o limites que pertenezcan a plataforma.

**Criterios de cierre**

- `features.billing` no es editable desde portal.
- `maxSubscribers` no se escribe desde el flujo self-service MVP.
- `features.mfa_required_all` se mantiene editable.

---

## Prioridad P1 - UI funcional en portal

### BT-CE-04 - Convertir settings page en pantalla funcional

**Archivos objetivo**

- apps/portal/src/app/dashboard/settings/page.tsx
- apps/portal/src/components/settings/* si se crean nuevos componentes

**Objetivo**

Reemplazar el placeholder por una vista funcional de configuracion empresarial.

**Criterios de cierre**

- La pagina carga datos reales del tenant autenticado.
- Existen estados de loading, error y success.
- No quedan tarjetas puramente decorativas como sustituto del flujo real.

### BT-CE-05 - Implementar formulario de Perfil Empresarial

**Archivos objetivo**

- componentes nuevos o existentes de settings en portal
- apps/portal/src/lib/api-client.ts

**Objetivo**

Editar datos legales y de contacto tenant-managed mediante un formulario aislado.

**Criterios de cierre**

- El formulario valida y guarda por endpoint propio.
- Los campos platform-managed se muestran como solo lectura si aparecen.

### BT-CE-06 - Implementar formulario de Configuracion Operativa

**Archivos objetivo**

- componentes de settings en portal
- apps/portal/src/lib/api-client.ts

**Objetivo**

Editar timezone, currency, language y country con contrato normalizado.

**Criterios de cierre**

- El submit es parcial y no rompe claves no enviadas.
- La UI refleja los defaults reales del backend.

### BT-CE-07 - Implementar bloque de Seguridad organizacional

**Archivos objetivo**

- componentes de settings en portal
- apps/portal/src/lib/api-client.ts

**Objetivo**

Permitir editar `mfa_required_all` y mostrar flags no editables de forma clara.

**Criterios de cierre**

- El toggle de MFA global funciona de punta a punta.
- `billing` y otros campos no editables no se pueden modificar.

---

## Prioridad P2 - Validacion, auditoria y consistencia

### BT-CE-08 - Añadir validaciones de dominio y sanitizacion

**Archivos objetivo**

- DTOs backend del tenant
- schemas frontend de formularios

**Objetivo**

Aplicar validaciones coherentes para email, pais, moneda, telefono, website y NIT.

**Criterios de cierre**

- Backend rechaza payloads invalidos.
- Frontend anticipa validaciones sin duplicar reglas innecesarias.

### BT-CE-09 - Auditar perfil y settings por separado

**Archivos objetivo**

- apps/api/src/modules/tenant/tenant.service.ts
- servicios de auditoria relacionados

**Objetivo**

Registrar cambios con granularidad suficiente para troubleshooting y compliance.

**Criterios de cierre**

- Existe evidencia de oldValue/newValue para perfil.
- Existe evidencia de oldValue/newValue para settings.

### BT-CE-10 - Reutilizar summary para alertas de configuracion

**Archivos objetivo**

- apps/api/src/modules/tenant/dashboard-summary.service.ts si aplica
- apps/portal/src/app/dashboard/settings/page.tsx

**Objetivo**

Evitar divergencias entre dashboard y settings sobre alertas de onboarding.

**Criterios de cierre**

- La pantalla de settings usa una fuente comun de alertas o una logica equivalente documentada.

---

## Prioridad P3 - Calidad y evidencia

### BT-CE-11 - Pruebas backend de tenancy y permisos

**Archivos objetivo**

- specs de tenant en apps/api

**Objetivo**

Verificar que solo el tenant autenticado edita sus propios datos y que solo ADMIN puede escribir.

**Criterios de cierre**

- Hay pruebas de 200, 403 y casos invalidos.
- No existe bypass por path, query o body.

### BT-CE-12 - Pruebas frontend y E2E del flujo de configuracion

**Archivos objetivo**

- tests del portal
- e2e/tests/ relacionados con configuracion empresarial

**Objetivo**

Cubrir lectura, edicion exitosa, bloqueo por rol y visualizacion de solo lectura.

**Criterios de cierre**

- Existe evidencia automatizada del flujo `login -> dashboard -> settings -> guardar`.

### BT-CE-13 - Actualizar evidencia documental

**Archivos objetivo**

- docs/informes/INFORME-MOD03-DEFINICION-v1.0.md o informe vigente posterior
- docs/quality/ si aplica

**Objetivo**

Dejar trazabilidad de implementacion, desvíos y riesgos residuales.

**Criterios de cierre**

- El informe vivo se actualiza y no se duplica sin necesidad.
