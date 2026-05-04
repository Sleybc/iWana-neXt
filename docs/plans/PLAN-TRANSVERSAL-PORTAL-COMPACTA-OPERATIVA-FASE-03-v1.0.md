# PLAN — Portal compacta operativa · Fase 03

**Tipo:** PLAN  
**Módulo:** TRANSVERSAL — Portal empresarial tenant-aware  
**Fase:** 03 — Compactación operativa y header único  
**Versión:** 1.0  
**Estado:** Listo para ejecución  
**Fecha:** 2026-05-04  
**Modo activo:** Mixto + Senior UI Systems Designer  
**Responsable de gobierno:** AI-EM-ARCH

---

## 1. Objetivo

Ejecutar la dirección aprobada **Portal compacta operativa: header único + workspace** sobre `apps/portal`, reduciendo sobre-rotulación y unificando la jerarquía visual entre Dashboard, Usuarios, Comercial, Configuración, CRM, Perfil y Auth.

La fase debe preservar completamente contratos, roles, tenancy, auth, stack y rutas existentes. El cambio es visual, estructural y de consistencia de experiencia.

## 2. Artefactos fuente

| Tipo | Artefacto |
|---|---|
| Spec visual | [SPEC-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md](../specs/SPEC-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md) |
| Perfil Senior UI | [Perfil_IA_Senior_UI_Systems_Designer_v1.md](../roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md) |
| Stack | [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md) |
| ADR UI | [ADR-023-Referencia-TailAdmin-Shell-Dashboard.md](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) |
| Plan previo | [PLAN-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md](PLAN-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md) |
| Informe vivo | [INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md](../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md) |

**Artefactos faltantes:** no hay PRD/HLD específico de portal compacta operativa; el alcance se gobierna por esta spec visual transversal y por las restricciones del repo.

## 3. Diagnóstico operativo

| ID | Severidad | Hallazgo | Módulos afectados |
|---|---|---|---|
| H-PCO-01 | Alta | `PageHeader` compite con banners, cards introductorias y headers internos. | Comercial, Configuración, CRM, Perfil |
| H-PCO-02 | Alta | `PortalAlert` se usa como explicación permanente de módulo. | Comercial, Configuración |
| H-PCO-03 | Alta | CRM overview conserva un hero interno que repite el propósito del módulo. | CRM |
| H-PCO-04 | Media | Detalles CRM usan headers custom fuera de la gramática general. | Expedientes, Suscriptores |
| H-PCO-05 | Media | Formularios Settings acumulan eyebrow, h2, descripción y subsection labels antes de campos. | Configuración |
| H-PCO-06 | Media | Perfil combina cabecera de página y bloque de identidad con peso similar. | Perfil |
| H-PCO-07 | Baja | Auth tiene familia visual separada y debe alinear disciplina de jerarquía sin perder propósito. | Auth |

## 4. Plan de implementación

### Fase 0 — Baseline visual y alcance

1. Confirmar estado actual de `apps/portal` y que `pnpm test:e2e:portal` está operativo.
2. Capturar evidencia desktop y mobile antes de cambios en:
   - `/dashboard`
   - `/dashboard/users`
   - `/dashboard/commercial`
   - `/dashboard/settings`
   - `/dashboard/crm`
   - `/dashboard/crm/expedientes`
   - `/dashboard/crm/subscribers`
   - `/profile` o ruta vigente de perfil si aplica
   - `/auth/login`
3. Registrar cualquier ruta no disponible en el informe vivo sin inventar navegación.

### Fase 1 — Ajuste de primitives y reglas base

1. Revisar `PageHeader` para que funcione como header compacto de workspace.
2. Documentar o reforzar en código el uso esperado de `PortalAlert` como estado accionable, no como banner introductorio permanente.
3. Revisar `PortalPanel` y `PortalSectionHeader` para que no incentiven eyebrow + h2 + descripción en todos los bloques.
4. Mantener cambios locales a `apps/portal` salvo que exista necesidad real de elevar a `packages/ui`.

### Fase 2 — Módulos cercanos al patrón

1. Usar `UsersClient` como referencia de limpieza.
2. Revisar `DashboardClient` solo para controlar onboarding alerts y jerarquía del primer viewport.
3. No rediseñar lo que ya cumple; evitar churn visual innecesario.

### Fase 3 — Comercial

1. Eliminar `PortalAlert` informativo permanente que solo explique el módulo.
2. Ubicar tabs principales inmediatamente después del header.
3. Reducir headers internos en `OffersManager` y managers de catálogo.
4. Mantener subtabs solo cuando representen una decisión real de workflow.
5. Verificar mobile: contenido útil visible sin tres bloques de texto previos.

### Fase 4 — Configuración empresarial

1. Eliminar o convertir el bloque “Centro de control” en estado compacto accionable.
2. Reducir `SettingsOverviewPanel` si no comunica riesgo, bloqueo o avance real.
3. Compactar headers de `CompanyProfileForm`, `OperationalSettingsForm`, `SecuritySettingsCard`, `BrandingForm` y managers relacionados.
4. Evitar que cada formulario abra con icono + eyebrow + h2 + descripción larga.
5. Mantener alertas solo para error, warning, success temporal o permisos.

### Fase 5 — CRM overview y detalle

1. Reemplazar el hero interno de `CrmOverviewClient` por un dashboard operativo compacto.
2. Mantener métricas y oportunidades recientes, pero sin repetir “radar” o “panorama” como segundo título protagonista.
3. Adaptar `ExpedienteHeader` y `SubscriberHeader` a variante de header de detalle:
   - título/persona;
   - badge de estado;
   - metadata breve;
   - acciones;
   - progreso compacto cuando aplique.
4. Confirmar continuidad entre listado y detalle.

### Fase 6 — Perfil y Auth

1. Reducir competencia visual entre `PageHeader` y `ProfileHeader`.
2. Mantener bloque de identidad como contenido, no como segunda cabecera de página.
3. En Auth, alinear disciplina de jerarquía: una intención principal, formulario directo, links secundarios compactos.
4. No forzar Auth a usar el mismo header autenticado si rompe el propósito del flujo.

### Fase 7 — Validación y documentación

1. Ejecutar validaciones técnicas:

```bash
pnpm --filter @iwana/portal test
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
pnpm test:e2e:portal
```

2. Capturar evidencia after desktop y mobile de las mismas rutas de Fase 0.
3. Validar teclado en tabs, header, dropdowns, modales y rutas principales.
4. Actualizar [INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md](../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md) con archivos tocados, comandos, evidencia y deuda residual.

## 5. Restricciones

- Usar `pnpm`, nunca `npm` ni `yarn`.
- No cambiar endpoints, DTOs, roles, permisos, tenancy, auth ni MFA.
- No hardcodear tenant, schema, slug, credenciales ni tokens.
- No agregar `tailwind.config.js`.
- No introducir librerías UI nuevas.
- No mover componentes a `packages/ui` sin justificación y escalación.
- Todo texto visible debe permanecer en español y sentence case.
- No usar el verde secundario base como texto sobre blanco.

## 6. Criterios de aceptación

| ID | Criterio |
|---|---|
| CA-PCO-01 | Cada pantalla autenticada tiene un solo título principal visible. |
| CA-PCO-02 | No quedan banners informativos permanentes que solo expliquen el módulo. |
| CA-PCO-03 | Tabs primarias aparecen inmediatamente después del header cuando aplican. |
| CA-PCO-04 | Paneles internos nombran tareas concretas y no repiten el módulo. |
| CA-PCO-05 | Mobile muestra contenido útil sin tres bloques textuales previos. |
| CA-PCO-06 | Formularios largos no tienen más de dos niveles de encabezado antes del primer campo. |
| CA-PCO-07 | CRM overview deja de tener hero interno y opera como tablero compacto. |
| CA-PCO-08 | Headers de detalle CRM quedan alineados a la gramática de header único enriquecido. |
| CA-PCO-09 | No hay cambios de stack, API, roles, tenancy ni tokens globales. |
| CA-PCO-10 | Informe vivo actualizado con validaciones y evidencia visual. |

## 7. Stop/go

**Detener ejecución si:**

- una mejora visual exige cambiar contrato API, permisos, roles, auth o tenancy;
- la compactación oculta acciones frecuentes o estados críticos;
- una primitive necesita pasar a `packages/ui` para no duplicarse fuera de portal;
- se detecta conflicto de accesibilidad WCAG con la solución visual;
- Playwright detecta regresiones de navegación o rutas rotas.

**Escalar a:** EM-ARCH. CTO solo si se requiere cambio de stack, tokens globales, librería UI o seguridad.

## 8. Definition of Done

- Spec, plan y prompt versionados.
- Implementación Fullstack completada por módulo.
- Tests, typecheck, lint y E2E estándar del portal en verde o bloqueo documentado.
- Evidencia visual desktop/mobile archivada.
- Informe vivo actualizado.
- Sin PII, secretos, tokens ni datos reales en código, tests, docs o capturas.
