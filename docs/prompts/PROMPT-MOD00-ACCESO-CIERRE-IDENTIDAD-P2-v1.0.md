# PROMPT — MOD00 Acceso — Cierre identidad P2/P3 (peek + borrador)

**Version:** 1.0
**Fecha:** 2026-08-29
**Agente destinatario:** AI-FE-PLATFORM
**Autor:** AI-EM-ARCH
**Contrato:** spec v1.10 §10 / §10.1 + review identidad v1.88 (P0=0, P1=0)

---

## 1. Objetivo

Cerrar **todos** los hallazgos P2 y P3 del review de Firma en `/dashboard/settings/access`, con primitives y tokens existentes. Sin primitiva nueva, sin API, sin commits.

## 2. Skills

- `.agents/skills/iwana-identity-ui-review/SKILL.md` (**modo diseño**)
- `.agents/skills/core-components/SKILL.md`, `tailwind-patterns`, `frontend-dev-guidelines`
- `.agents/skills/test-driven-development/SKILL.md`
- `.agents/skills/system-vocabulary-review/SKILL.md`

## 3. Correcciones obligatorias

Archivo principal: `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`

### P2-1 Borrador genérico (`:1151`)

Quitar el pozo `rounded-2xl border ... bg-iwana-surface-soft/60`. El panel de personalizados, con `creationDraft`, lleva `className` que añade `shadow-iwana-active` (el panel *es* la superficie en curso). Dentro: `.portal-eyebrow` para `draftFieldsTitle` (no `font-semibold` compitiendo con el h2) + barra lima + píldora En edición + campos. Conservar píldora `bg-iwana-secondary-50` + `text-iwana-secondary-700` (spec §10).

`ProfileIdentityFields`: usar `Input`/`Select` con props `label` y `error` (como Organización). `CheckboxCard` se conserva. `h-11` / `min-h-11`.

### P2-2 Toolbar desktop (`:1336`)

Quitar `className="bg-gray-50/90 dark:bg-dark-surface-3"` de `PortalActionToolbar`. El pozo es el del primitive. Extender el test que ya veta `bg-gray-50` en móvil para que la toolbar desktop tampoco lo tenga.

### P2-3 Lima del peek en oscuro (`:1809`)

`Ver lo que permite`: `text-iwana-secondary-700 dark:text-iwana-secondary-300` (mismo par que la píldora). No `text-iwana-secondary` sin sufijo sobre claro.

### P2-4 Loading de guardar

`loading={isSaving}` en: `Guardar perfil` (borrador), `Guardar cambios` (accesos de existente) y submit del diálogo Editar perfil. Conservar `disabled={isSaving}`.

### P3-1 Peek detalle + filas

- Heading `Lo que permite este perfil` → `p.portal-eyebrow` (no `h3 font-semibold`).
- Ítems del detalle: `divide-y` flush, no `border-gray-100` suelto tipo README.
- Filas del catálogo y `Empezar desde cero`: añadir `portalTableRowHoverClassName` (ya importado). **No** `PortalNavListRow` ni `rounded-2xl` en el peek.
- Cifras `{n} accesos` y contador de tabs: `tabular-nums`.

### P3-2 Loading subtitle — NO TOCAR

Conservar `Cargando perfiles y accesos` (freeze v1.79 / prompt post-corte). No alargar a «de acceso y sus accesos».

## 4. Tests

`AccessControlSettingsClient.spec.tsx`:

- Borrador: no hay pozo `rounded-2xl` anidado; hay eyebrow `Datos del nuevo perfil`; el campo Nombre sigue en página y recibe foco (CA-ACC-UX-25 intacto).
- Toolbar de tabla desktop: sin `bg-gray-50`.
- Peek: fila con hover class; detalle con eyebrow; `Ver lo que permite` incluye clase dark lima.
- Guardar perfil: el botón admite `loading` (p. ej. `aria-busy` tras click si el POST cuelga, o aserto de prop si es estable).

No E2E nuevo obligatorio. Regenerar snapshots solo si un test visual falla.

## 5. Stop / Go

- STOP si hace falta token, Drawer o editar `PortalSidePeek`.
- GO: Jest del spec en verde; `audit-ui.mjs` sobre el cliente sin P0/P1; píldoras En edición pueden seguir disparando heurística lima-50 (descartar).

## 6. Entregables

Código + tests. No specs. No informe (lo cierra el orquestador).
