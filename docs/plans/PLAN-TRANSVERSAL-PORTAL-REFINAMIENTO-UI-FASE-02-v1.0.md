# PLAN — Refinamiento UI sistémico del portal empresarial

**Tipo:** PLAN  
**Módulo:** TRANSVERSAL — Portal empresarial tenant-aware  
**Fase:** 02 — Unificación visual operativa  
**Versión:** 1.0  
**Estado:** Listo para ejecución  
**Fecha:** 2026-05-04  
**Modo activo:** Mixto + Senior UI Systems Designer  
**Responsable de gobierno:** AI-EM-ARCH

## 1. Contexto y objetivo

La auditoría visual del portal confirmó que el dashboard principal avanzó hacia una gramática más sobria, pero el resto de `apps/portal` mantiene patrones visuales heredados: radios arbitrarios, gradientes repetidos, sombras fuertes, doble sistema de padding y estados duplicados.

El objetivo de esta fase es implementar el enfoque recomendado por el perfil Senior UI Systems Designer: **Portal operativo sobrio**. La intención es unificar shell, superficies, estados, foco, densidad y copy operativo sin cambiar contratos API, boundaries, multi-tenancy ni stack.

## 2. Artefactos fuente

| Tipo | Artefacto | Uso |
|---|---|---|
| Perfil | [Perfil_IA_Senior_UI_Systems_Designer_v1.md](../roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md) | Criterios de calidad visual, accesibilidad y alcance del rol |
| Skill | [.agents/skills/senior-ui-systems-designer/SKILL.md](../../.agents/skills/senior-ui-systems-designer/SKILL.md) | Método operativo para dirección visual SaaS |
| Stack | [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md) | Baseline de Next.js, React, Tailwind v4 y `@iwana/ui` |
| ADR | [ADR-023-Referencia-TailAdmin-Shell-Dashboard.md](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) | Referencia visual del shell y dashboard |
| HLD | [HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md) | Boundaries y contratos del dashboard empresarial |
| Informe vivo | [INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md](../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md) | Evidencia de la ejecución previa y auditoría visual |

## 3. Diagnóstico resumido

| ID | Severidad | Hallazgo | Impacto |
|---|---|---|---|
| H-01 | Alta | Gramática visual inconsistente entre dashboard, comercial, CRM, configuración y auth. | El portal se percibe como varias fases de producto unidas, no como consola empresarial única. |
| H-02 | Alta | Doble sistema de espaciado entre shell y pantallas hijas. | Primer viewport desalineado, densidad irregular y mantenimiento difícil. |
| H-03 | Alta | Estados visuales duplicados con gradientes y sombras en varios módulos. | Riesgo de drift, contraste irregular y deuda transversal. |
| H-04 | Media | Foco visible inconsistente en header, dropdowns, cards-link y accesos rápidos. | Riesgo WCAG y navegación por teclado poco predecible. |
| H-05 | Media | Notificaciones usan semántica de dialog sin comportamiento completo y enlazan a ruta no verificada. | Riesgo de accesibilidad y navegación rota. |
| H-06 | Media | Login tiene tono promocional y claims técnicos no verificados. | El acceso empresarial se siente más marketing que herramienta operativa. |
| H-07 | Media | Branding tenant-aware incompleto en header móvil autenticado. | El tenant pierde continuidad visual en mobile. |
| H-08 | Media | Comercial y Settings están demasiado cardificados para tareas tabulares. | Reduce densidad efectiva, comparación y velocidad operativa. |
| H-09 | Baja | Persisten hardcodes visuales de color, radios y sombras. | Dificulta evolución gobernada del sistema visual. |

## 4. Dirección visual aprobada

**Nombre:** Portal operativo sobrio.

**Tesis:** una consola empresarial compacta, clara y moderna, donde las superficies sostienen trabajo repetido y comparación de datos sin ornamento innecesario.

**Sistema visual objetivo:**

- superficies blancas o dark sólidas;
- bordes grises semánticos;
- radios estándar `rounded-2xl` o `rounded-xl` según densidad;
- sombras mínimas, solo cuando separan capas reales;
- gradientes removidos de estados operativos;
- foco visible consistente en todo control interactivo;
- copy operativo breve, en español y sentence case;
- tablas y formularios como herramientas de trabajo, no como composiciones editoriales.

## 5. Fuera de alcance

- Cambiar endpoints, DTOs, contratos de auth, tenant, CRM o commercial.
- Cambiar roles, permisos, gating, multi-tenancy o `api-client` fuera de correcciones visuales evidentes.
- Mover componentes a `packages/ui` si implica cambio de API pública transversal no planificado.
- Cambiar paleta global, tipografía global o Tailwind config.
- Rediseñar flujos funcionales de CRM, Commercial o Settings.
- Introducir librerías UI nuevas.

## 6. Plan de implementación

### Fase 0 — Evidencia visual de entrada

1. Levantar `apps/portal` en entorno local.
2. Capturar screenshots desktop y mobile de:
   - `/auth/login`
   - `/dashboard`
   - `/dashboard/commercial`
   - `/dashboard/crm`
   - `/dashboard/settings`
   - `/dashboard/users`
3. Registrar hallazgos visuales iniciales en el informe vivo.

### Fase 1 — Primitives visuales locales del portal

Objetivo: evitar seguir duplicando estados y superficies.

Crear o consolidar primitives locales en `apps/portal/src/components/shared/` o `apps/portal/src/components/layout/` según convenga:

| Primitive | Responsabilidad |
|---|---|
| `PortalPanel` | Superficie base: borde, fondo, radio, padding y dark mode. |
| `PortalSectionHeader` | Título, descripción breve y acciones para bloques internos. |
| `PortalAlert` | Estados error, warning, success, info sin gradientes. |
| `PortalSkeletonBlock` | Skeletons con radio y tono consistentes. |
| `PortalEmptyState` | Estados vacíos accionables y compactos. |
| `interactiveFocusClassName` | Receta común de focus-visible para links y botones custom. |

Reglas:

- No mover todavía a `packages/ui` salvo que la implementación revele uso real transversal fuera del portal.
- Reutilizar `@iwana/ui` cuando ya exista componente suficiente.
- Evitar wrappers que creen cards dentro de cards.

### Fase 2 — Shell y navegación global

Objetivo: cerrar riesgos de foco, rutas y branding mobile.

1. `TopHeader.tsx`
   - Añadir focus-visible consistente a hamburger desktop/mobile.
   - Reemplazar el bloque `iW` mobile hardcodeado por `TenantSeal` o variante compacta con datos del tenant.
   - Mantener el buscador solo en desktop si mobile no tiene patrón aprobado.
2. `Sidebar.tsx`
   - Verificar rutas disabled: deben permanecer no navegables si no existen.
   - Corregir cualquier ruta futura que apunte fuera de `/dashboard` si no está implementada.
3. `NotificationBell.tsx`
   - Decidir patrón: popover no modal o menu, no dialog parcial.
   - Remover navegación a `/support` si no existe; usar ruta real o acción no navegable.
   - Añadir focus-visible a trigger e items.
4. `DropdownUser.tsx`
   - Añadir focus-visible a trigger, links y logout.
   - Confirmar retorno de foco al cerrar con Escape.

### Fase 3 — Layout interno de pantallas

Objetivo: el shell controla padding y ancho; las pantallas controlan solo composición interna.

Refactorizar wrappers en:

- `components/commercial/CommercialClient.tsx`
- `components/crm/CrmOverviewClient.tsx`
- `components/settings/SettingsClient.tsx`
- `components/profile/ProfileClient.tsx`
- `components/users/UsersClient.tsx`

Reglas:

- No usar `<main className="flex-1 p-6">` dentro de pantallas hijas; el `main` ya existe en `app/dashboard/layout.tsx`.
- Usar `div className="space-y-6"` o layout específico de módulo.
- Evitar `px-6` extra alrededor de todo el contenido si ya existe padding del shell.

### Fase 4 — Estados y superficies por módulo

Objetivo: reemplazar gradientes y sombras repetidas por primitives.

Aplicar primitives a:

- Dashboard: error, empty, recent activity y quick actions.
- Comercial: skeleton, error, placeholder, tab container, tables y alertas.
- Settings: overview, tabs, forms, coverage, products, services y plan catalog.
- CRM: hero/pipeline, recent opportunities y empty states.
- Profile y Users: paneles, dialogs y estados.

Reglas:

- Estados error/warning/success deben usar color + icono + copy, no gradiente como canal principal.
- Tablas deben priorizar densidad, header compacto, toolbar y scroll horizontal controlado.
- Las cards quedan para unidades repetidas o bloques de resumen, no para cada contenedor de trabajo.

### Fase 5 — Login operativo empresarial

Objetivo: alinear el login del portal con una experiencia operativa, no promocional.

Archivos:

- `components/auth/LoginExperience.tsx`
- `components/auth/LoginBrandPanel.tsx`
- `components/auth/LoginForm.tsx`

Cambios:

- Reescribir copy del panel lateral para evitar claims no verificados como cifrado específico o baja latencia.
- Mantener branding tenant-aware, favicon y background configurables.
- Usar tono: acceso empresarial seguro, políticas activas, MFA, trazabilidad por empresa.
- Validar que textos visibles sigan en español y sentence case.

### Fase 6 — Validación visual, accesibilidad y documentación

1. Ejecutar pruebas unitarias focalizadas.
2. Ejecutar typecheck y lint de portal.
3. Capturar screenshots after desktop/mobile de las mismas rutas de Fase 0.
4. Validar teclado:
   - sidebar
   - top header
   - global search
   - notification popover
   - user dropdown
   - tabs commercial/settings
5. Actualizar informe vivo con archivos tocados, comandos, resultados y deuda aceptada.

## 7. Criterios de aceptación

| ID | Criterio |
|---|---|
| CA-PUI-01 | `apps/portal` usa una gramática consistente de superficies en dashboard, commercial, CRM, settings, users y profile. |
| CA-PUI-02 | No quedan wrappers globales con `<main className="flex-1 p-6">` dentro de pantallas hijas del dashboard. |
| CA-PUI-03 | Los estados error, warning, success, empty y loading usan primitives consistentes sin gradientes decorativos. |
| CA-PUI-04 | Header, dropdown user, notification bell, quick actions y cards-link tienen focus-visible visible y consistente. |
| CA-PUI-05 | NotificationBell ya no declara `role="dialog"` sin comportamiento de dialog completo ni navega a rutas inexistentes. |
| CA-PUI-06 | Header móvil autenticado muestra branding tenant-aware o fallback coherente con `TenantSeal`. |
| CA-PUI-07 | Login portal usa tono operativo empresarial y no claims técnicos no verificados. |
| CA-PUI-08 | Tablas y listados de Commercial/Settings priorizan densidad y comparación, sin cardificación excesiva. |
| CA-PUI-09 | No se agregan dependencias visuales, Tailwind config ni tokens globales sin escalación. |
| CA-PUI-10 | Informe vivo queda actualizado con evidencia before/after, comandos ejecutados y resultado. |

## 8. Validación obligatoria

Ejecutar al cierre:

```bash
pnpm --filter @iwana/portal test
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
pnpm test:e2e:portal
```

Validación visual mínima:

- screenshots desktop `1440x900`
- screenshots mobile `390x844`
- revisión manual de teclado en flujos globales
- revisar dark mode si el entorno local lo permite

## 9. Stop/go

**Detener ejecución si:**

- una primitive local empieza a requerir cambio transversal de `@iwana/ui`;
- la corrección visual exige cambiar contrato API, roles o permisos;
- el patrón de branding mobile requiere datos no disponibles en el layout actual;
- Playwright detecta rutas rotas nuevas o navegación hacia páginas no implementadas;
- aparece conflicto entre accesibilidad WCAG y dirección visual.

**Escalar a:** EM-ARCH. CTO solo si se requiere cambio de stack, tokens globales, librería UI o contrato de seguridad.

## 10. Definition of Done

- Plan y prompt de ejecución versionados.
- Primitives visuales locales implementadas o decisión explícita de no crearlas.
- Pantallas principales del portal alineadas a “Portal operativo sobrio”.
- Validación técnica y visual documentada.
- Informe vivo actualizado.
- Sin PII, credenciales ni tokens en código, tests, docs o capturas.