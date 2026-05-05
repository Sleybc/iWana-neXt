# Diseno UX/UI - Portal refinamiento sistemico Fase 02

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-05-04  
**Tipo:** Diseno de experiencia  
**Modulo:** TRANSVERSAL - Portal empresarial tenant-aware  
**Alcance:** apps/portal  
**Plan de referencia:** docs/plans/PLAN-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md  
**Prompt de referencia:** docs/prompts/PROMPT-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md  
**Perfil de referencia:** docs/roles/Perfil_IA_Senior_UI_Systems_Designer_v1.md  
**ADR de referencia:** docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md  
**Informe vivo relacionado:** docs/informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md

---

## 1. Objetivo

Unificar `apps/portal` bajo la direccion visual **Portal operativo sobrio** sin cambiar contratos API, auth, roles, permisos, multi-tenancy, stack ni tokens globales.

La fase corrige drift visual acumulado entre dashboard, commercial, CRM, settings, users, profile y login. La meta no es redisenar la aplicacion ni mover primitives a `packages/ui` por defecto. La meta es consolidar una gramatica operacional comun para shell, superficies, estados, foco, densidad y copy.

---

## 2. Problema actual

El portal ya tiene una base visual valida en partes del dashboard, pero el resto del producto conserva patrones heredados que compiten entre si:

1. wrappers duplicados de layout dentro de pantallas hijas;
2. cards, gradientes y sombras usadas como solucion general;
3. estados visuales repetidos con variantes inconsistentes;
4. foco visible irregular en navegacion y controles custom;
5. `NotificationBell` conserva semantica parcial y una navegacion a ruta no verificada;
6. modulos de trabajo tabular demasiado cardificados;
7. login con tono mas promocional que operativo.

Esto hace que el portal se perciba como varias etapas de producto superpuestas, no como una consola empresarial unica.

---

## 3. Principios de diseno aprobados

### 3.1 Claridad operativa

Cada pantalla debe sentirse como una herramienta de trabajo. La prioridad es lectura rapida, comparacion y accion recurrente.

### 3.2 Sobriedad visual

Se aprueban superficies solidas, bordes semanticos, radios consistentes y sombras minimas. Los gradientes decorativos salen de estados operativos si una primitive simple resuelve mejor el caso.

### 3.3 Densidad controlada

Commercial y Settings deben priorizar toolbars, tablas y comparacion antes que composiciones de tarjetas repetidas.

### 3.4 Consistencia de interaccion

Todo trigger, link y control custom debe exponer `focus-visible` claro y comportamiento de teclado coherente.

### 3.5 Producto antes que marketing

El login y el overview de CRM deben comunicar operacion real, politicas activas y siguiente accion, sin claims tecnicos no verificados ni hero blocks que parezcan landing page.

### 3.6 Evolucion local primero

Las primitives nacen en `apps/portal` y solo escalan a `packages/ui` si la implementacion demuestra uso transversal real y no una conveniencia especulativa.

---

## 4. Alcance

### Incluye

1. primitives visuales locales para paneles, alerts, skeletons, empty states y focus-visible;
2. normalizacion del shell global en `TopHeader`, `Sidebar`, `NotificationBell` y `DropdownUser`;
3. retiro de wrappers globales duplicados dentro de pantallas hijas del dashboard;
4. unificacion de superficies y estados en dashboard, commercial, CRM, settings, users y profile;
5. refinamiento del login con copy empresarial verificable;
6. evidencia before/after y actualizacion del informe vivo.

### No incluye

1. cambios de endpoints, DTOs, contratos de auth, roles o permisos;
2. cambios de stack, Tailwind config, tokens globales o librerias UI nuevas;
3. rediseño funcional de CRM, Commercial, Settings o Users;
4. migracion obligatoria de primitives a `packages/ui`;
5. cambios de tenancy, slugs, schemas o datos de branding no disponibles.

---

## 5. Arquitectura visual objetivo

### 5.1 Capa base de primitives locales

Se aprueba crear una capa minima de primitives en `apps/portal/src/components/shared/` o ubicacion equivalente:

1. `PortalPanel`
2. `PortalSectionHeader`
3. `PortalAlert`
4. `PortalSkeletonBlock`
5. `PortalEmptyState`
6. `interactiveFocusClassName`

Estas primitives deben resolver color, borde, radio, padding, tono visual, accesibilidad y estados recurrentes sin introducir una API transversal nueva.

### 5.2 Shell global

El shell debe consolidarse como una capa estable y predecible:

1. `TopHeader` maneja foco, branding mobile tenant-aware y acciones globales;
2. `Sidebar` solo muestra rutas reales o placeholders no navegables;
3. `NotificationBell` deja de comportarse como dialog incompleto y pasa a patron de popover no modal anclado al trigger, sin rutas inexistentes;
4. `DropdownUser` debe cerrar por teclado, devolver foco de forma consistente y reforzar su navegacion accesible.

### 5.3 Pantallas hijas

El layout de dashboard manda padding, ancho y scroll global. Las pantallas hijas solo definen composicion interna. La regla operativa es eliminar wrappers tipo `<main className="flex-1 p-6">` dentro de modulos hijos y reemplazarlos por contenedores internos tipo `div className="space-y-6"` o layouts equivalentes por modulo.

---

## 6. Decisiones por area

### 6.1 Dashboard

El dashboard debe usar la misma gramatica de paneles y estados que el resto del portal. `DashboardClient`, `DashboardPanel`, `RecentActivityPanel` y `QuickActionsPanel` deben dejar de sentirse como un lenguaje visual separado.

### 6.2 Commercial

Se recomienda una direccion compacta. La tabla y la toolbar son el contenido dominante. Las tarjetas solo se conservan cuando resumen o agrupan informacion, no cuando reemplazan estructuras tabulares.

### 6.3 CRM

`CrmOverviewClient` debe mantener valor ejecutivo, pero el bloque principal no puede parecer hero comercial. Debe leerse como un dashboard operativo con senales de estado, actividad y proxima accion.

### 6.4 Settings

Settings debe bajar decoracion y subir densidad efectiva. Tabs, formularios, catalogos y managers deben compartir superficies y alertas comunes, con lectura clara y comparacion rapida.

### 6.5 Users y Profile

Users y Profile deben alinearse a la misma capa de paneles, alerts, focus-visible y vacios. No se aprueba un estilo aislado para dialogos o bloques secundarios.

### 6.6 Login

El login debe comunicar acceso empresarial seguro, politicas activas, MFA y trazabilidad por empresa. Se eliminan claims no verificables y cualquier tono de landing promocional.

---

## 7. Comportamiento y accesibilidad

### 7.1 Foco visible

Todo elemento interactivo de shell y modulos refinados debe mostrar foco visible consistente a partir de `interactiveFocusClassName`, incluyendo:

1. header;
2. sidebar;
3. notification bell;
4. dropdown de usuario;
5. quick actions;
6. cards-link;
7. tabs y acciones secundarias.

### 7.2 Semantica

No se aprueban roles ARIA que simulen patrones no implementados. En particular, `NotificationBell` no debe declarar `role="dialog"` si no existe comportamiento completo de dialog.

### 7.3 Teclado y retorno de foco

Los componentes desplegables del shell deben cerrar con `Escape`, mantener orden de foco predecible y devolver el foco al trigger cuando corresponda. `DropdownUser` debe mejorar su navegacion de teclado y `NotificationBell` debe comportarse como popover no modal accesible, no como pseudo-dialog.

### 7.4 Copy visible

Todo texto visible en portal debe mantenerse en espanol y sentence case, con tono empresarial y operacional.

### 7.5 Canal de estado

Color no puede ser el unico canal. Alerts y estados deben combinar tono, icono, titulo y accion siguiente cuando aplique.

---

## 8. Estrategia de implementacion aprobada

La ejecucion se divide en seis bloques:

1. capturar baseline visual before;
2. crear primitives locales;
3. normalizar shell y navegacion;
4. limpiar layout interno de pantallas;
5. compactar superficies, estados y copy por modulo;
6. validar con tests, capturas after y actualizacion del informe vivo.

La recomendacion aprobada es ejecutar este camino con refactor sistemico local en `apps/portal`, reutilizando `@iwana/ui` solo donde ya exista una primitive suficiente y evitando abrir una migracion transversal del design system.

---

## 9. Riesgos y stop/go

Se detiene la fase si aparece cualquiera de estos casos:

1. una primitive local exige cambio transversal en `@iwana/ui`;
2. una correccion visual requiere cambiar contratos API, roles o permisos;
3. el branding mobile necesita datos que el layout actual no expone;
4. emergen rutas rotas nuevas durante la validacion;
5. aparece conflicto entre accesibilidad WCAG y la direccion visual aprobada.

La respuesta esperada ante estos casos es escalar a EM-ARCH y mantener el alcance visual local mientras exista alternativa segura.

---

## 10. Criterios de aceptacion

1. El portal usa una gramatica consistente de superficies en dashboard, commercial, CRM, settings, users y profile.
2. No quedan wrappers globales con `<main className="flex-1 p-6">` dentro de pantallas hijas del dashboard.
3. Error, warning, success, empty y loading usan primitives consistentes sin gradientes decorativos.
4. Header, dropdown user, notification bell, quick actions y cards-link tienen `focus-visible` claro y consistente.
5. `NotificationBell` deja de usar semantica de dialog incompleta y no navega a rutas inexistentes.
6. El header mobile autenticado muestra branding tenant-aware o fallback coherente.
7. El login usa tono operativo empresarial y no comunica claims tecnicos no verificados.
8. Commercial y Settings priorizan densidad y comparacion sobre cardificacion excesiva.
9. No se agregan dependencias visuales nuevas ni cambios de stack.
10. El informe vivo queda actualizado con evidencia before/after, comandos y resultado.

---

## 11. Validacion esperada

Al cierre de implementacion se deben ejecutar:

```bash
pnpm --filter @iwana/portal test
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
pnpm test:e2e:portal
```

Y se debe archivar evidencia visual desktop `1440x900` y mobile `390x844` para:

1. `/auth/login`
2. `/dashboard`
3. `/dashboard/commercial`
4. `/dashboard/crm`
5. `/dashboard/settings`
6. `/dashboard/users`

---

## 12. Decision final de diseno

Se aprueba ejecutar la Fase 02 como **refinamiento sistemico del portal existente**, no como rediseño libre. La unidad de cambio es el patron visual local del portal y sus pantallas principales. Cualquier necesidad de cambio transversal fuera de ese perimetro sale de alcance y requiere escalacion.
