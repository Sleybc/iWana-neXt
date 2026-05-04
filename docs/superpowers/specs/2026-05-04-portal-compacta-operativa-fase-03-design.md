# 2026-05-04 — Portal compacta operativa fase 03

**Tipo:** SPEC de ejecucion  
**Estado:** En revision  
**Fecha:** 2026-05-04  
**Modulo:** Portal empresarial (`apps/portal`)

## 1. Contexto

La Fase 03 de portal compacta operativa ya cuenta con artefactos aprobados de direccion visual:

- [`../../specs/SPEC-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md`](../../specs/SPEC-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md)
- [`../../plans/PLAN-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md`](../../plans/PLAN-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md)
- [`../../prompts/PROMPT-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md`](../../prompts/PROMPT-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md)
- [`../../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md`](../../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md)

El worktree actual ya contiene una parte importante de la compactacion visual en `apps/portal`. Esta especificacion fija como debe cerrarse esa ejecucion sin redisenar desde cero ni abrir un refactor de alcance mayor.

## 2. Problema a cerrar

Aunque la direccion `header unico + workspace` ya esta parcialmente reflejada en el codigo, todavia persisten remanentes que compiten con la gramatica aprobada:

1. `CommercialClient` y `SettingsClient` aun renderizan alerts introductorias permanentes.
2. `ProfileClient` sigue combinando `PageHeader` con un segundo bloque de identidad de peso similar.
3. Auth conserva demasiada carga introductoria en `LoginForm` y `LoginBrandPanel`.
4. `ExpedienteHeader` y `SubscriberHeader` todavia se perciben mas como hero de detalle que como header operativo enriquecido.

El riesgo no es funcional sino de consistencia: la fase podria declararse cerrada con el codigo todavia mezclando patrones compactos y patrones heredados.

## 3. Objetivo

Cerrar la Fase 03 sobre el estado actual del repo para que las vistas incluidas en el plan compartan esta secuencia:

```text
Header unico
Navegacion local inmediata, si aplica
Workspace operativo
Estados accionables
```

El resultado esperado es que cada pantalla presente el modulo una sola vez y que, despues del header, todo sea accion, navegacion, estado o contenido util.

## 4. Alternativas consideradas

### Opcion A — Compactacion focalizada sobre el trabajo ya hecho

Completar la ejecucion existente tocando solo los puntos que todavia rompen la gramatica aprobada y reutilizando las primitives locales ya disponibles.

**Ventajas:** minimiza riesgo, respeta el prompt, aprovecha el trabajo ya avanzado.  
**Costo:** deja las reglas mas por composicion que por endurecimiento fuerte de primitives.  
**Decision:** **aprobada**.

### Opcion B — Compactacion + endurecimiento de primitives locales

Ademas del cierre visual, ajustar `PortalPanel`, `PortalSectionHeader` y `PageHeader` para desincentivar de forma mas fuerte los anti-patrones.

**Ventajas:** mayor consistencia sistemica.  
**Desventajas:** amplia el radio de impacto y puede introducir churn adicional en pantallas ya razonables.  
**Decision:** descartada para esta fase.

### Opcion C — Generalizacion compartida fuera de `apps/portal`

Elevar el patron a `packages/ui` u otra capa compartida.

**Ventajas:** base reusable a futuro.  
**Desventajas:** viola el criterio de mantener esta fase local al portal salvo necesidad real.  
**Decision:** descartada.

## 5. Alcance

### Incluido

- `apps/portal/src/components/commercial/CommercialClient.tsx`
- `apps/portal/src/components/settings/SettingsClient.tsx`
- `apps/portal/src/components/crm/CrmOverviewClient.tsx`
- `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx`
- `apps/portal/src/components/profile/ProfileClient.tsx`
- `apps/portal/src/components/auth/LoginForm.tsx`
- `apps/portal/src/components/auth/LoginBrandPanel.tsx`
- Ajustes adyacentes minimos en componentes hijos si son necesarios para sostener la compactacion
- Actualizacion del informe vivo y evidencia visual de la fase

### Excluido

- Cambios backend, DTOs, endpoints, OpenAPI, tenancy, auth o MFA
- Cambio de stack, librerias UI, tokens globales o `tailwind.config.js`
- Extraccion de primitives a `packages/ui`
- Rediseno funcional de CRM, Comercial, Settings, Users o Auth

## 6. Diseno de ejecucion

### 6.1 Regla de composicion global

Cada vista afectada debe resolver su jerarquia asi:

1. `PageHeader` como unica intencion principal visible.
2. Tabs o navegacion local inmediatamente debajo, cuando aplique.
3. Primer panel operativo con copy de tarea concreta, no de presentacion del modulo.
4. Alerts reservadas para error, warning, success temporal, permisos o configuracion pendiente.

### 6.2 Comercial y configuracion

- Quitar alerts tipo introduccion permanente en `CommercialClient` y `SettingsClient`.
- Mantener `CommercialTabLayout` y `SettingsTabs` como primer bloque util tras el header.
- Dejar `SettingsOverviewPanel` como resumen operativo compacto, no como segunda cabecera.
- Si algun panel interno repite el nombre del modulo, reemplazarlo por el nombre de la tarea real.

### 6.3 CRM overview y detalle

- `CrmOverviewClient` debe mantenerse como dashboard operativo compacto, sin volver a un hero interno.
- `ExpedienteHeader` y `SubscriberHeader` deben bajar de protagonismo visual conservando:
  - accion de retorno,
  - titulo principal,
  - badges de estado,
  - metadata breve,
  - accion o progreso cuando aplique.
- El objetivo es que el detalle se lea como workspace, no como landing interna.

### 6.4 Perfil y auth

- En `ProfileClient`, `PageHeader` mantiene la intencion principal y `ProfileHeader` opera como bloque de identidad/contenido.
- En Auth, `LoginForm` y `LoginBrandPanel` deben reducir sobre-explicacion para que el flujo quede centrado en iniciar sesion.
- Se conserva la familia visual propia de Auth, pero con copy mas corto y jerarquia mas directa.

### 6.5 Regla de seguridad del cambio

Esta fase no puede ocultar acciones frecuentes ni estados criticos para ganar limpieza. Si una compactacion reduce claridad operativa, se revierte localmente y se documenta como deuda residual.

## 7. Validacion

La fase se considera correctamente cerrada cuando se cumpla todo lo siguiente:

1. Cada pantalla del alcance tiene una sola intencion principal visible.
2. No quedan alerts informativas permanentes que solo expliquen el modulo.
3. Las tabs primarias quedan inmediatamente despues del header donde corresponda.
4. Los headers CRM de detalle se leen como header enriquecido, no como hero.
5. Perfil y Auth reducen competencia visual sin alterar su proposito funcional.
6. Se ajustan tests si cambia semantica accesible, labels, roles o headings.
7. El informe vivo incorpora archivos tocados, comandos, evidencia y deuda residual.

Validacion tecnica esperada al cierre:

```bash
pnpm --filter @iwana/portal test
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
pnpm test:e2e:portal
```

## 8. Riesgos y mitigacion

| Riesgo | Mitigacion |
|---|---|
| Compactar y ocultar contexto realmente necesario | Mantener copy contextual solo en empty states o alerts accionables |
| Convertir el cierre en refactor de primitives | Limitar cambios a composicion local salvo bloqueo real |
| Romper tests por cambios de headings o labels | Ajustar tests solo donde cambie la semantica accesible real |
| Declarar la fase cerrada sin evidencia suficiente | Actualizar el informe vivo con capturas before/after y comandos efectivamente ejecutados |

## 9. Resultado esperado

`apps/portal` debe quedar alineado al patron aprobado **Portal compacta operativa: header unico + workspace** sobre el worktree actual, cerrando los remanentes de sobre-rotulacion sin tocar contratos, seguridad ni stack.
