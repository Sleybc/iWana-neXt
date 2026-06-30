# PROMPT — Ejecución portal compacta operativa · Fase 03

**Versión:** 1.0  
**Estado:** Listo para ejecución  
**Fecha:** 2026-05-04  
**Generado por:** Engineering Manager + Senior UI Systems Designer  
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)  
**Convención documental:** `PROMPT-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md`

## Módulo

- Nombre: Portal empresarial tenant-aware
- Código: TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA
- Fase: 03 — Compactación operativa y header único
- Versión: 1.0
- Fecha: 2026-05-04
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** `apps/portal` debe quedar alineado al patrón aprobado **Portal compacta operativa: header único + workspace**, con una jerarquía visual consistente en Dashboard, Usuarios, Comercial, Configuración, CRM, Perfil y Auth.
- **Lo que sí entra:**
  - Ajuste visual de headers, tabs, paneles, alertas, formularios, tables y vistas detalle.
  - Eliminación de banners informativos permanentes que solo explican módulos.
  - Reducción de títulos, subtítulos, eyebrows y headers internos redundantes.
  - Alineación de CRM overview y detalles con la gramática de header único.
  - Evidencia visual desktop/mobile y actualización del informe vivo.
- **Lo que no entra:**
  - Backend, migraciones, endpoints, DTOs, OpenAPI, roles, permisos, auth, MFA o multi-tenancy.
  - Cambio de Tailwind config, tokens globales, paleta, tipografía o librerías UI.
  - Rediseño funcional de flujos de negocio.
  - Extracción obligatoria a `packages/ui` sin escalación.

## 2. Artefactos de entrada obligatorios

- Spec visual: [SPEC-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md](../specs/SPEC-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md)
- Plan de fase: [PLAN-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md](../plans/PLAN-TRANSVERSAL-PORTAL-COMPACTA-OPERATIVA-FASE-03-v1.0.md)
- Plantilla base: [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
- Perfil Senior UI: [Perfil_IA_Senior_UI_Systems_Designer_v1.md](../roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md)
- Stack: [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md)
- ADR UI: [ADR-023-Referencia-TailAdmin-Shell-Dashboard.md](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md)
- Informe vivo: [INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md](../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md)
- Artefactos faltantes detectados: no hay PRD/HLD específico de portal compacta operativa; esta fase se gobierna por la spec visual transversal aprobada y por las restricciones del repo.

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer primero la spec y el plan. Ejecutar como compactación visual sistémica, no como rediseño libre.
2. Capturar baseline before desktop/mobile de rutas principales: dashboard, users, commercial, settings, CRM, expedientes, suscriptores, perfil si aplica y auth login.
3. Revisar `PageHeader` para que actúe como cabecera compacta de workspace. Debe haber un solo título principal visible por pantalla.
4. Eliminar `PortalAlert` informativos permanentes que solo expliquen módulos. Conservar alerts para error, warning, success temporal, permisos o configuración pendiente.
5. Mover tabs primarias inmediatamente bajo el header en módulos con navegación local.
6. Compactar paneles internos para que nombren tareas concretas y no repitan el módulo.
7. Comercial:
   - eliminar banner “Módulo comercial” o equivalente;
   - reducir headers internos en `OffersManager` y managers de catálogo;
   - conservar subtabs solo cuando representen workflow real.
8. Configuración:
   - eliminar o compactar “Centro de control” si no comunica estado real;
   - reducir headers de formularios y managers;
   - evitar icono + eyebrow + h2 + descripción larga antes del primer campo.
9. CRM:
   - reemplazar hero interno de overview por tablero operativo compacto;
   - adaptar `ExpedienteHeader` y `SubscriberHeader` a variante de header único enriquecido.
10. Perfil y Auth:
   - reducir competencia entre `PageHeader` y `ProfileHeader`;
   - mantener Auth con familia propia, pero una sola intención principal y copy breve.
11. Actualizar tests si cambian roles ARIA, labels, headings o estructura accesible.
12. Actualizar el informe vivo con archivos tocados, validaciones, evidencia visual y deuda residual.

## 4. Restricciones no negociables

- Usar `pnpm`, nunca `npm` ni `yarn`.
- No cambiar endpoints, DTOs, roles, permisos, tenancy, auth ni MFA.
- No hardcodear tenant, schema, slug, credenciales ni tokens.
- No agregar `tailwind.config.js`; Tailwind v4 CSS-first se conserva.
- No introducir librerías UI nuevas.
- No mover componentes a `packages/ui` sin justificar y escalar.
- Todo texto visible debe estar en español y sentence case.
- No usar `iwana-secondary` base como texto sobre blanco.
- No dejar rutas visibles que naveguen a páginas inexistentes.
- No ocultar acciones frecuentes ni estados críticos por compactar la UI.

## 5. Entregables técnicos obligatorios

- `PageHeader` y reglas de composición alineadas al patrón compacto.
- `PortalAlert`, `PortalPanel` y `PortalSectionHeader` usados conforme a la spec.
- Comercial sin banner informativo permanente ni headers internos redundantes.
- Configuración compactada en overview, tabs y formularios.
- CRM overview sin hero interno y detalles alineados a header único enriquecido.
- Perfil y Auth con jerarquía reducida y copy operativo.
- Tests ajustados si cambia semántica accesible.

## 6. Entregables documentales obligatorios

- Actualización de [INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md](../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md).
- Evidencia visual before/after desktop y mobile.
- Lista de comandos ejecutados y resultados.
- Registro explícito de deuda visual aceptada si alguna pantalla queda fuera.
- Stop/go documentado si aparece bloqueo.

## 7. Criterios de aceptación

- CA-PCO-01: cada pantalla autenticada tiene un solo título principal visible.
- CA-PCO-02: no quedan banners informativos permanentes que solo expliquen el módulo.
- CA-PCO-03: tabs primarias aparecen inmediatamente después del header cuando aplican.
- CA-PCO-04: paneles internos nombran tareas concretas y no repiten el módulo.
- CA-PCO-05: mobile muestra contenido útil sin tres bloques textuales previos.
- CA-PCO-06: formularios largos no tienen más de dos niveles de encabezado antes del primer campo.
- CA-PCO-07: CRM overview deja de tener hero interno y opera como tablero compacto.
- CA-PCO-08: headers de detalle CRM quedan alineados a la gramática de header único enriquecido.
- CA-PCO-09: no hay cambios de stack, API, roles, tenancy ni tokens globales.
- CA-PCO-10: informe vivo actualizado con validaciones y evidencia visual.

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - una mejora visual exige cambiar contrato API, permisos, roles, auth o tenancy;
  - la compactación oculta acciones frecuentes o estados críticos;
  - una primitive necesita pasar a `packages/ui` para no duplicarse fuera de portal;
  - se detecta conflicto de accesibilidad WCAG con la solución visual;
  - Playwright detecta regresiones de navegación o rutas rotas.
- **Documentar causa en:** [INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md](../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md)
- **Escalar a:** EM-ARCH; CTO solo por cambios de stack, tokens globales, librería UI o seguridad.
- **Recomendación esperada:** mantener el alcance visual y resolver con patrones locales del portal antes de ampliar `packages/ui`.

## 9. Criterio de salida de la fase

- Frontend validado:

```bash
pnpm --filter @iwana/portal test
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
```

- E2E validado:

```bash
pnpm test:e2e:portal
```

- Validación visual archivada:
  - screenshots before/after desktop `1440x900`;
  - screenshots before/after mobile `390x844`;
  - revisión manual de teclado en navegación global, tabs, dropdowns y modales.
- Documentación archivada:
  - informe vivo actualizado con resultado, deuda residual y stop/go.
- Seguridad:
  - sin PII, tokens, credenciales ni slugs hardcodeados en código, tests, docs o capturas.
