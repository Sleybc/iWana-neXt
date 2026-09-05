# Plan de ejecución — MOD00 Acceso: catálogo de sugeridos fuera de galería

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task **después** de spec v1.10. Fase 1 (PROD-UX + DS-OWNER) corre ahora; Fase 2 FE no arranca hasta ese freeze.

**Goal:** sacar las 9 cards permanentes de `/dashboard/settings/access` del viewport de trabajo y mover la elección de un perfil sugerido al flujo de creación (peek existente), de modo que la administradora elija, vea qué trae, confirme y vuelva a la pantalla principal a nombrar y guardar.

**Architecture:** cambio de arquitectura de información y de flujo de creación en portal. Sin API, migraciones, tokens ni primitivas nuevas. Consume `PortalSidePeek` (receta #9) y el workspace de borrador ya existente. RF-ACC-17, banner post-creación y asignación en Usuarios no cambian.

**Tech Stack:** Next.js App Router, React, TypeScript estricto, `@iwana/ui`, `PortalSidePeek` / `PortalPanel` en `apps/portal`, Jest, Playwright. Sin cambios de NestJS ni PostgreSQL.

**Version:** 1.1  
**Estado:** Aprobado (opción B congelada por el dueño de producto el 2026-08-29)  
**Fecha:** 2026-08-29  
**Autor:** AI-EM-ARCH (modos Product Architect + EM + Orchestrator)  
**Módulo:** MOD00 Configuración / Acceso  
**Superficie:** `apps/portal` → `/dashboard/settings/access`

---

## Fuentes rectoras

- `AGENTS.md`
- `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md` (este entregable no contiene código ni mockups)
- `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- `docs/adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md` (D4, RF-ACC-16 / RF-ACC-17)
- Spec prevalente: `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` **v1.9**
- Spec Fase 3: `docs/specs/2026-08-28-mod00-convergencia-nav-gates-ux.md` **v1.1** (§3: 9 cards en página)
- Firma: `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`
- Receta #9: `.agents/skills/iwana-identity-ui-review/references/component-recipes.md` (`PortalSidePeek`)
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

---

## 1. Diagnóstico (por qué duele hoy)

El dolor **no** es la falta de un tercer overlay. El flujo de creación ya tiene:

1. diálogo `Crear nuevo perfil` (`Usar un perfil sugerido` / `Empezar desde cero`);
2. `PortalSidePeek` de preview (`Ver lo que permite` + CTA `Crear a partir de este perfil`);
3. workspace en página para nombrar, ajustar accesos y guardar.

El dolor **sí** es densidad: la banda permanente de **9 cards** (título + descripción + tipo de usuario + 2 CTAs `min-h-11` cada una) ocupa el primer viewport. La tarea principal post-corte (crear un perfil **nuevo** y luego ir a Usuarios a **reemplazar** el set) queda empujada hacia abajo. CA-ACC-UX-14 **congela** ese layout: exige el heading `Perfiles sugeridos` visible sin scroll en 1440×900 con 0 personalizados.

Las 9 cards cumplen dos roles mezclados:

| Rol | ¿Debe vivir en la página principal? |
| --- | --- |
| Catálogo para **crear a partir de** un sugerido | No. Es un paso del flujo de creación. |
| Recordatorio de que los equipos **ya usan** sugeridos | Sí, pero basta copy (empty §5 / §6.1) + un ancla compacta, no un grid de producto. |

RF-ACC-17 sigue vigente: los sugeridos **no se editan in-place**. Mostrarlos como 9 productos con CTA primario invita a tratarlos como el objeto de trabajo.

**Vocabulario (innegociable en UI):** perfil sugerido / tipo de usuario / accesos. Nunca plantilla, sistema, módulo ni clave cruda. En este plan, «plantilla» solo aparece como término interno de seed/`isSystem`.

---

## 2. Intención del dueño de producto (reformulada)

Pedido original: al crear, abrir un drawer, escoger el perfil sugerido, ver qué trae, elegirlo y **volver a la pantalla principal** para terminar de crear.

Eso es correcto como **secuencia de creación**. Es insuficiente si las 9 cards siguen en la página: el espacio no se recupera.

La secuencia objetivo (contrato de interacción, no mockup):

1. Pantalla principal = empty/workspace de **perfiles personalizados** + política MFA. Sin galería de 9 cards.
2. CTA `Crear perfil` abre el catálogo en **`PortalSidePeek`** (primitiva ya en uso; no un Drawer nuevo).
3. En el peek: lista compacta de 9 sugeridos + `Empezar desde cero`. Al seleccionar uno, el mismo peek muestra qué accesos trae.
4. Confirmar cierra el peek y deja el **borrador en la página principal** (nombre + edición de accesos + guardar), que es el workspace que ya existe.
5. Tras guardar: banner §6.6 (ir a Usuarios a reemplazar el set). Sin reasignación masiva.

---

## 3. Opciones comparadas

### Opción A — Drawer de picker + galería compactada en página

- Las 9 cards se densifican (una fila, chips, o lista corta) y el create usa un drawer/peek de elección + preview.
- **Pros:** el catálogo sigue visible sin abrir create; menos cambio de CA-ACC-UX-14 (se reescribe, no se elimina).
- **Contras:** dos superficies muestran el mismo catálogo; el viewport sigue contaminado; se duplica el peek actual. No resuelve el problema de fondo.

### Opción B — Catálogo solo en el peek de creación (recomendada)

- Se **retira** la banda permanente de 9 cards.
- `Crear perfil` abre un único `PortalSidePeek` de dos momentos: (1) elegir sugerido o desde cero; (2) ver qué trae y confirmar. Luego se vuelve al workspace de página.
- El empty post-corte y el subtítulo de sugeridos **siguen enseñando** que los equipos ya usan los 9 tipos; no hace falta el grid para esa lección.
- **Pros:** recupera el viewport; un solo overlay (hoy hay diálogo + peek + 9 cards); alinea catálogo con la tarea «crear»; reutiliza primitiva existente; RF-ACC-17 más claro (sugeridos no parecen editables).
- **Contras:** descubrir un tipo concreto exige abrir `Crear perfil` (un clic más). Mitigación: empty + CTA primario visibles sin scroll.

### Opción C — Selector compacto **dentro** del formulario de página (sin peek de catálogo)

- `Crear perfil` pone el workspace en modo creación en página, con un `<select>` / lista de 9 nombres y un resumen al lado.
- **Pros:** cero overlays; menos capas.
- **Contras:** el formulario de accesos + 9 opciones + resumen pelea por el mismo lienzo; peor en 390×844 que un peek; choca con receta #9 (edición estructural → peek/página deliberada, no un mega-formulario).

### Opción D — Tabs «En uso / Sugeridos» (descartada)

- Esconde sugeridos detrás de un tab pero no cambia que son 9 cards densas; añade IA y vocabulario de pestañas que Fase 3 ya rechazó.

**Veredicto EM-ARCH:** **Opción B**. La idea del usuario (elegir → ver qué trae → volver a la principal) se adopta; el vehículo es `PortalSidePeek`, no un Drawer nuevo; la galería permanente se elimina porque es la causa del espacio, no el síntoma.

Si el CTO exige ver los 9 nombres **sin** abrir create, el fallback es **A mínima**: una sola línea «9 perfiles sugeridos en uso» + enlace que abre el **mismo** peek de catálogo (no un segundo grid). No se implementa A completa (cards compactadas + peek).

---

## 4. Contratos que este cambio rompe (re-sync §3bis)

Un cambio de cualquiera de estos es el evento que fuerza re-sync. **No hay código hasta spec v1.10 congelada.**

| Contrato vigente | Qué deja de valer | Qué debe decir v1.10 / nota Fase 3 |
| --- | --- | --- |
| Spec v1.9 §4 + CA-ACC-UX-14 | Heading `Perfiles sugeridos` visible sin scroll **porque el grid está en página** | El primer viewport es empty/workspace + CTA `Crear perfil`. El heading de sugeridos vive **dentro del peek** de creación. Nuevo CA: empty + CTA visibles sin scroll en 1440×900. |
| Spec Fase 3 v1.1 §3 / CA-ACV2-01 / CA-ACV2-04 | «única sección con exactamente 9 cards» en la ruta | Las 9 entradas existen en el peek, orden canónico `UserRole` (sin SUBSCRIBER/PARTNER/INVESTOR). Conteos se verifican en el peek, no en el grid de página. |
| Spec v1.9 §7 | Diálogo modal de dos caminos **más** peek de preview **más** CTAs en cada card | Un peek de creación sustituye diálogo + preview + CTAs de card. El workspace de página para terminar el alta se conserva. |
| E2E `portal-settings-access-ui.spec.ts` + 6 snapshots | Asertos de 9 cards en página, fila xl de 4, heading sin scroll | Regenerar capturas; asertos de peek (abrir create → 9 filas → preview → borrador en página). CA-ACC-UX-20 (MFA) se re-verifica: MFA sube de viewport al desaparecer el grid. |

**No se toca (congelado):**

- RF-ACC-16 / RF-ACC-17 (sugeridos no se mutan in-place; sin `Editar` / `Editar accesos` sobre `isSystem`).
- Empty y copy post-corte v1.9 §5 / §6.1 (equipos ya usan sugeridos; no «crea tu primer perfil» como si no hubiera nada).
- Banner §6.6 y ayuda Users §6.7 (CA-ACC-POST-01…06).
- `POST /profiles` no reasigna; `PUT /users/:id/profiles` reemplaza el set (unión si quedan ambos).
- Ownership: perfiles en Access, asignación en Usuarios.
- Tokens, `@iwana/ui` global, API, migraciones, matriz V2.

**DS-OWNER:** veredicto de **no** nueva primitiva. `PortalSidePeek` ya cubre picker + detalle + footer de confirmación. Si el peek actual no admite lista + detalle en el mismo panel, PROD-UX describe el layout en spec; FE lo compone con children existentes. No hay token nuevo.

---

## 5. Modelo de interacción (alto nivel — no mockup)

```text
[Página Access]
  Empty post-corte (si 0 personalizados) + CTA Crear perfil
  Tabla/workspace de personalizados (si hay)
  Política MFA
        │ Crear perfil
        ▼
[PortalSidePeek — catálogo]
  Lista compacta: 9 sugeridos (nombre, tipo de usuario, N accesos)
  + fila «Empezar desde cero»
        │ seleccionar sugerido
        ▼
  Mismo peek: qué permite (accesos agrupados, solo lectura)
  Footer: Usar este perfil  |  Volver a la lista
        │ confirmar
        ▼
[Página Access — modo borrador]
  Nombre, tipo de usuario (techo), edición de accesos, Guardar
  Peek cerrado; foco en el campo nombre
```

Reglas:

- Un solo peek abierto a la vez (el de creación). El peek de preview de card **desaparece** con las cards.
- Escape / overlay cierra el peek **sin** crear borrador (igual que cancelar el diálogo actual).
- `Empezar desde cero` salta el momento «qué trae» y abre borrador vacío en página.
- Objetivos táctiles ≥ 44 px; foco visible; axe AA claro/oscuro.
- Copy del peek: `Perfiles sugeridos`, `Ver lo que permite`, `Usar este perfil` — alineado a labels vigentes en `mod00-settings-labels.ts`; PROD-UX decide ajustes menores en v1.10.

---

## 6. Alcance cerrado

### Entra

- Re-IA de `/dashboard/settings/access`: quitar galería permanente; catálogo en peek de creación; borrador sigue en página.
- Spec v1.10 (PROD-UX) + nota o bump menor de spec Fase 3 (9 entradas en peek, no en página).
- Tests unitarios del cliente, E2E + snapshots, axe, evidencia visual.
- Informe vivo (bump de versión al cerrar la fase).

### No entra

- Backend, OpenAPI, seed, remap V1, edición in-place de sugeridos, copy-on-write, reasignación masiva.
- Drawer/componente nuevo en `@iwana/ui`.
- Cambiar Users salvo copy ya congelado §6.7.
- G6 / G6.5 / G7 de convergencia (siguen NO-GO por su propia evidencia; este plan no los firma).

---

## 7. Fases y dueños

### Fase 0 — Freeze (este documento + dueño de producto)

- [x] Dueño de producto aprueba **B** (catálogo solo en `PortalSidePeek`; sin fallback de línea). 2026-08-29.
- Criterio de salida: este plan pasa a **Aprobado**. **Cumplido (v1.1).**

### Fase 1 — Contrato UX (AI-PROD-UX)

Prompts: `docs/prompts/PROMPT-MOD00-ACCESO-CATALOGO-PEEK-FASE-01-v1.0.md` y `…-DS-OWNER-v1.0.md`.

- [x] Spec **v1.10** de `2026-08-15-mod00-acceso-ui-remediation.md`.
- [x] Spec Fase 3 **v1.2**.
- [x] AI-DS-OWNER: **GO CON CONDICIONES** estampado en §10.1 (foco al cambiar de momento; `description` = una línea).
- Criterio de salida: specs versionadas. **Cumplido.** FE: `docs/prompts/PROMPT-MOD00-ACCESO-CATALOGO-PEEK-FASE-02-v1.0.md`.

### Fase 2 — Implementación portal (AI-FE-PLATFORM)

- [x] RED + GREEN: galería retirada; peek de dos momentos; labels §6.8.
- [x] 6 snapshots de access regenerados.
- Criterio de salida: Jest cliente **62**. E2E access-ui **12**. Typecheck portal: fallos preexistentes ajenos. **Deuda UX-25 cerrada** (nombre/tipo de usuario del borrador en página; diálogo solo para editar personalizados guardados).

### Fase 3 — Calidad (AI-SR-QA)

- [x] CA-ACC-POST-01…04 y 06 verdes. POST-05 fuera (G6).
- [x] CA-ACC-UX-21…30 y ACV2-01/03/04 con evidencia. QA añadió 5 tests (UX-28, UX-29, POST-02, unión POST-06, E2E peek móvil).
- [x] E2E access-ui 12 passed (axe del suite existente; no se firmó G6).
- Criterio de salida: **GO CON DEUDA**. Informe v1.86.

### Fase 4 — Cierre (AI-EM-ARCH)

- [x] Specs v1.10 / Fase 3 v1.2 + veredicto DS-OWNER §10.1 + implementación + QA.
- [x] G6 de convergencia **no** se firma.

---

## 8. Riesgos y no-regresión

| Riesgo | Mitigación |
| --- | --- |
| El empty post-corte «se queda corto» sin las 9 cards | Conservar copy v1.9 §5; CTA `Crear perfil` en empty y en `PortalPanel.actions` de personalizados. |
| Doble overlay (diálogo + peek) si FE deja el diálogo | v1.10 debe **retirar** el diálogo de dos caminos; un solo peek. |
| Usuario cree que «usar este perfil» asigna gente | Banner §6.6 y copy de empty intactos; peek no promete asignación. |
| Peek vs receta de drawer nuevo | DS-OWNER: no hay Drawer; hay `PortalSidePeek`. |
| MFA (CA-ACC-UX-20) cambia de posición visual | Re-verificar; es mejora (MFA más cerca del fold). |
| Vocabulario «plantilla» en copy de implementación | Gate de `system-vocabulary-review` en Fase 1 y 2. |

---

## 9. Archivos que tocará la implementación (mapa, no encargo aún)

| Archivo | Responsabilidad prevista |
| --- | --- |
| `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` | v1.10 — PROD-UX |
| `docs/specs/2026-08-28-mod00-convergencia-nav-gates-ux.md` | bump — PROD-UX |
| `apps/portal/src/components/settings/AccessControlSettingsClient.tsx` | Quitar grid; peek de creación; workspace de borrador |
| `apps/portal/src/components/settings/mod00-settings-labels.ts` | Copy del peek si v1.10 lo cambia |
| `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx` | Unidad |
| `e2e/tests/portal-settings-access-ui.spec.ts` + snapshots | E2E y evidencia visual |
| `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` | Bump al cerrar |

No se tocan `access-control.service.ts`, seed, ni Users salvo §6.7 ya vigente.

---

## 10. Stop / go

| Señal | Acción |
| --- | --- |
| Freeze B (o fallback de una línea) | EM-ARCH emite prompt Fase 1 PROD-UX |
| Spec v1.10 + veredicto DS-OWNER | Prompt Fase 2 FE-PLATFORM |
| Intento de editar sugeridos in-place o de API nueva | STOP — fuera de alcance |
| Intento de primitiva/token nuevo | STOP — escala a DS-OWNER / EM-ARCH |
| G6 convergencia aún sin evidencia | No bloquear **esta** micro-fase; no firmar G6 «de paso» |

---

## 11. Decisión congelada

**Opción B aprobada** el 2026-08-29: catálogo solo en `PortalSidePeek` de creación; 9 cards fuera de la página; borrador en la principal. Fallback de una línea **no** entra en este freeze.

Prompts Fase 1: `docs/prompts/PROMPT-MOD00-ACCESO-CATALOGO-PEEK-FASE-01-v1.0.md` (PROD-UX) y `docs/prompts/PROMPT-MOD00-ACCESO-CATALOGO-PEEK-DS-OWNER-v1.0.md` (DS-OWNER). FE no arranca sin spec v1.10 + veredicto DS-OWNER.
