# PROMPT — MOD00 Acceso — Catálogo de sugeridos en peek (Fase 1 UX)

**Version:** 1.0
**Fecha:** 2026-08-29
**Agente destinatario:** AI-PROD-UX
**Autor del prompt:** AI-EM-ARCH (orquestador)
**Modo:** Ejecución por fase
**Plantilla:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (en revisión)
**Plan congelado:** `docs/plans/2026-08-29-mod00-acceso-catalogo-sugeridos-en-peek.md` **v1.1 — Aprobado, opción B**

---

## 1. Objetivo exacto

Congelar spec **v1.10** de `/dashboard/settings/access`: retirar la galería permanente de 9 cards; el catálogo de perfiles sugeridos vive solo en un `PortalSidePeek` de creación (elegir → ver qué trae → confirmar); el borrador (nombre, tipo de usuario, accesos, guardar) vuelve a la **página principal**. Sin mockups de píxel. Sin código.

## 2. Artefactos de entrada (abrirlos)

- Plan v1.1 (opción B, modelo §5, contratos que se rompen §4).
- Spec prevalente v1.9: `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` (entera; §4, §5, §6, §8, §10, §13, §14, §15).
- Spec Fase 3 v1.1: `docs/specs/2026-08-28-mod00-convergencia-nav-gates-ux.md` (§3 y CA-ACV2-01/04).
- Receta #9: `.agents/skills/iwana-identity-ui-review/references/component-recipes.md`.
- Firma: `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`.
- Labels vivos: `apps/portal/src/components/settings/mod00-settings-labels.ts` (solo lectura; no editar).
- UI actual (solo lectura): `AccessControlSettingsClient.tsx` (banda sugeridos ~1468, peek ~1598, diálogo crear ~1651).
- Skills: `iwana-identity-ui-review` (modo diseño), `senior-ui-systems-designer` (densidad operativa, no 2–3 direcciones nuevas), `ui-ux-pro-max` (subordinada: adaptar o descartar), `system-vocabulary-review`.

## 3. Contratos congelados (no reabrir)

- Opción B. No fallback de «una línea + peek». No opción A ni C.
- RF-ACC-16 / RF-ACC-17: sugeridos no se editan in-place; sin `Editar` / `Editar accesos` / eliminar sobre `isSystem`.
- Empty y copy post-corte v1.9 §5 / §6.1 (equipos ya usan sugeridos). Banner §6.6 y ayuda Users §6.7 (CA-ACC-POST-01…06 se conservan en espíritu; POST-03 se reescribe contra filas del peek, no cards).
- `POST /profiles` no reasigna. Ownership: perfiles en Access, asignación en Usuarios.
- Primitiva: **solo** `PortalSidePeek` existente (`title`, `description`, `eyebrow`, `children`, `footer`). Un peek a la vez. DS-OWNER estampa §10; tú no inventas Drawer ni tokens.
- Vocabulario ruta access: perfil sugerido / tipo de usuario / accesos. Prohibidos §6.3. Nunca «plantilla» ni «sistema» en copy visible.

## 4. Alcance

1. **Bump in-place** de `2026-08-15-mod00-acceso-ui-remediation.md` a **v1.10** (no crear otro archivo). Cabecera, «Qué cambia vs v1.9», prevalencia.
2. **§4 IA:** quitar la banda 4 de 9 cards. Orden: encabezado → alertas → workspace personalizados|accesos → MFA. CTA `Crear perfil` sigue en empty y en `PortalPanel.actions` de personalizados.
3. **§5:** añadir estado «peek de creación abierto» (lista / detalle / cancelar sin borrador). Empty post-corte + CTA visibles sin scroll en 1440×900 (sustituye el rol de UX-14).
4. **§6 copy:** el panel `Perfiles sugeridos` deja de ser banda de página. Mover/adaptar su descripción al peek. Conservar helps de «crear no mueve». CTAs: `Ver lo que permite` (momento detalle), `Usar este perfil` (confirmar y volver a página), `Empezar desde cero`, `Volver a la lista`. Si retiras el diálogo modal, retira también sus labels de selector o reubícalos en el peek.
5. **§8:** sustituir diálogo de dos caminos + peek de preview de card + CTAs de card por **un** peek de dos momentos. Escape/Cerrar = sin borrador. Confirmar = peek cierra, foco al nombre del borrador en página.
6. **§10:** declarar consumo de `PortalSidePeek`; lista + detalle en `children`; CTAs en `footer`; `shadow-iwana-soft`; sin `z-10000`/glass. Dejar hueco explícito para el veredicto DS-OWNER (ellos no editan este archivo en paralelo: tú escribes el contrato de consumo; ellos lo confirman en su entregable).
7. **§13 CA:**
   - **Sustituir** CA-ACC-UX-14: empty post-corte (o listado) + CTA `Crear perfil` visibles sin scroll en 1440×900 con 0 personalizados. El heading `Perfiles sugeridos` ya no vive en página.
   - **Superar** CA-ACC-UX-15, 16, 18 (layout de cards en página). Marcar Superado y no exigirlos a FE/QA.
   - **Reescribir** CA-ACC-UX-12: MFA queda debajo del workspace de personalizados (ya no «debajo de sugeridos en página»).
   - **Conservar** UX-08 (peek = dialog + trampa de foco) y extenderlo al peek de creación.
   - **Nuevos CA** (IDs estables, p. ej. CA-ACC-UX-21…): abrir peek desde `Crear perfil`; 9 filas en orden canónico UserRole (Fase 3 §3.3); fila desde cero; detalle de accesos agrupados solo lectura; confirmar deja borrador en página y cierra peek; cancelar no crea borrador; desde cero salta detalle; teclado/Escape; 390×844 usable; sin `Editar` en filas sugeridas.
   - POST-03: filas del peek, no cards.
8. **Spec Fase 3:** bump a **v1.2** in-place. §3 deja de exigir 9 cards en la ruta. Las 9 entradas + orden + nombres humanos viven en el peek. Reescribir CA-ACV2-01/04. Empty sigue gobernado por la prevalente (ahora v1.10). Regeneración de snapshots contra el **primer viewport sin grid**.
9. **§14–§15:** desbloqueo de tracks: FE GO al freeze v1.10 + veredicto DS-OWNER. Notificar re-sync §3bis.

## 5. Restricciones

- No código, no tokens, no endpoints, no wireframes ASCII de píxel, no 2–3 alternativas estéticas (dirección ya es Firma + receta #9).
- No reabrir copy-on-write ni edición in-place.
- Texto de spec en español. Ejemplos ilustrativos sin PII.
- Si DS-OWNER aún no ha escrito, no bloquees: congela el consumo de `PortalSidePeek` como único vehículo.

## 6. Stop / Go

- **STOP** si el flujo exige primitiva nueva, API nueva o mutar `isSystem`.
- **GO** cuando v1.10 y Fase 3 v1.2 estén versionadas, CA viejos de cards superados con IDs nuevos, y FE pueda implementar sin preguntar layout de página.

## 7. Entregables

- Spec prevalente v1.10.
- Spec Fase 3 v1.2.
- No informe nuevo; no tocar `apps/`.
