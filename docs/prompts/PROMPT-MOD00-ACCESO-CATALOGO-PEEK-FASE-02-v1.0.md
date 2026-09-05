# PROMPT — MOD00 Acceso — Catálogo en peek (Fase 2 FE)

**Version:** 1.0
**Fecha:** 2026-08-29
**Agente destinatario:** AI-FE-PLATFORM
**Autor del prompt:** AI-EM-ARCH (orquestador)
**Modo:** Ejecución por fase
**Contrato UX congelado:** `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` **v1.10**
**Spec Fase 3:** `docs/specs/2026-08-28-mod00-convergencia-nav-gates-ux.md` **v1.2**
**Plan:** `docs/plans/2026-08-29-mod00-acceso-catalogo-sugeridos-en-peek.md` v1.1 opción B
**DS-OWNER:** GO CON CONDICIONES estampado en spec §10.1

---

## 1. Objetivo exacto

Quitar la galería de 9 cards de `/dashboard/settings/access`. `Crear perfil` abre un único `PortalSidePeek` de dos momentos (lista → detalle). Confirmar deja el borrador en la página. TDD. Sin backend. Sin primitiva nueva.

## 2. Artefactos de entrada

- Spec v1.10 completa, sobre todo §4, §5, §6.8, §8, §10.1, §11.4, CA-ACC-UX-14/21…30, POST-03.
- Spec Fase 3 v1.2 §3.3 (orden 9 filas) y CA-ACV2-01/04/05.
- `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- `apps/portal/src/components/settings/mod00-settings-labels.ts`
- `apps/portal/src/components/settings/AccessControlSettingsClient.spec.tsx`
- `e2e/tests/portal-settings-access-ui.spec.ts` + snapshots
- `apps/portal/src/components/shared/portal-ui.tsx` (`PortalSidePeek`) — no modificar la primitiva.
- Skills: `test-driven-development`, `testing-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` (modo diseño), `system-vocabulary-review`, `nextjs-app-router-patterns`.

## 3. Contratos congelados

- Un `PortalSidePeek`, mismo `open` para lista y detalle. Al cambiar de momento, **mover el foco** al primer control del nuevo `children` (§11.4).
- `description` del peek es un `<p>`: lista = omitido; detalle = `{tipo} · {n} accesos`. Intro largo de lista en `children`. `eyebrow` omitido ambos momentos. Heading `Lo que permite este perfil` en children del detalle.
- Footer detalle: `Usar este perfil` primary `size="lg"`; `Volver a la lista` ghost/secundario. Footer lista omitido.
- Filas compactas `min-h-11`, `divide-y`, no cards `rounded-2xl` ni grid 4 cols **dentro** del peek.
- `Usar este perfil` no hace `POST`; cierra peek y deja borrador; foco al nombre.
- Escape / Cerrar / velo = sin borrador.
- `Empezar desde cero` salta detalle.
- Sin `Editar` / `Editar accesos` / eliminar en filas sugeridas.
- Vocabulario: nunca plantilla/sistema/módulo/clave. Copy literal §6.8.
- Banner §6.6 y empty post-corte v1.9/v1.10 se conservan.
- Sin tokens, sin Drawer, sin `z-10000`, sin glass, sin `shadow-2xl`.

## 4. Alcance

1. **RED:** reescribir tests del cliente que asumen heading/cards en página y `Crear a partir de este perfil`. Nuevos: abrir peek desde Crear perfil; 9 filas orden canónico; intro en children; detalle readonly; confirmar → borrador; cancelar → sin borrador; desde cero; POST-03 en filas; empty + CTA sin heading de sugeridos en página.
2. **GREEN:** labels §6.8; retirar `#templates-section` y el `Dialog` de creación; un peek de dos momentos; conservar workspace de borrador y MFA.
3. **E2E:** asertos de peek; 9 filas no 9 cards; CA-ACC-UX-14 = empty+CTA en viewport 1440×900; regenerar 6 snapshots. Si Playwright no puede correr en el entorno, deja los asertos correctos y documenta snapshots pendientes.
4. Typecheck/lint del paquete portal. Jest del spec del cliente en verde.
5. Informe vivo: **no** crear uno nuevo; un párrafo corto en el existente solo si el orquestador no lo hace después. Preferible no tocarlo (cierre EM-ARCH).

## 5. Restricciones

- No `apps/api`, no seed, no Users salvo que un test de Access se rompa por copy (Users §6.7 no cambia).
- No commits.
- No `any`. Texto UI en español.
- STOP si hace falta prop nueva en `PortalSidePeek` o mutar `isSystem`.

## 6. Stop / Go

- **GO** cuando Jest del cliente pasa, no hay galería ni diálogo de creación, peek cumple §6.8/§10.1, typecheck portal limpio.
- E2E/snapshots: GO con asertos actualizados; snapshots regenerados si el runner lo permite.

## 7. Entregables

Código portal + tests. Cero archivos de spec (ya congeladas).
