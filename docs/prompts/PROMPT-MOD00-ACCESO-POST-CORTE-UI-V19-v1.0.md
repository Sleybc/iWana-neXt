# PROMPT — MOD00 Acceso — UI post-corte spec v1.9

**Version:** 1.0
**Fecha:** 2026-08-29
**Agente destinatario:** AI-FE-PLATFORM
**Autor del prompt:** AI-EM-ARCH (orquestador)
**Modo:** Ejecucion por fase
**Plantilla:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (en revision)
**Contrato UX congelado:** `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` **v1.9**
**Nota Fase 3:** `docs/specs/2026-08-28-mod00-convergencia-nav-gates-ux.md` v1.1 (empty lo gobierna v1.9)

---

## 1. Objetivo exacto

Hacer visible el camino real post-corte: los sugeridos **ya estan en uso** y **no se editan**; crear un perfil **no mueve a nadie**; el admin **debe** ir a Usuarios y **reemplazar** el set (quitar el sugerido, dejar solo el nuevo).

## 2. Artefactos de entrada (abrirlos)

- Spec v1.9 completa (copy §6.1–§6.7, matriz §5, CA-ACC-POST-01…06).
- `apps/portal/src/components/settings/AccessControlSettingsClient.tsx`
- `apps/portal/src/components/settings/mod00-settings-labels.ts`
- `apps/portal/src/components/settings/SettingsAccessShortcuts.tsx` + copy del hub
- `apps/portal/src/components/users/CompanyRolesAssignmentSection.tsx`
- `apps/portal/src/components/users/EditUserModal.tsx` / `CreateUserModal.tsx`
- Specs Jest colocalizados y `e2e/tests/portal-settings-access-ui.spec.ts`

## 3. Contratos congelados

- Sin tokens, primitivas `@iwana/ui` nuevas, ni endpoints.
- **Sin** `Editar` / `Editar accesos` / eliminar en cards sugeridas (CA-ACC-POST-03).
- Sin copy-on-write ni reasignacion masiva.
- Vocabulario: prohibidos de spec §6.3 en esta ruta. En Users se conserva «categoria base».
- Loading subtitle: conservar el copy vivo v1.79 `Cargando perfiles y accesos` (no revertir al texto largo de la tabla §6.1).

## 4. Alcance

1. **Empty condicionado:** 0 personalizados + ≥1 sugerido → copy post-corte §6.1. 0+0 sugeridos → empty «aun no has creado». Un solo `Crear perfil`.
2. **Subtitulo, descripcion de sugeridos, descripcion de personalizados, hub card access** = tablas §6.1.
3. **Selector crear:** helps §6.2 (crear no mueve).
4. **Banner §6.6** tras guardar perfil **nuevo** (desde sugerido o desde cero). `PortalAlert` success + `live="polite"` + `Ir a Usuarios`. No al guardar solo accesos de un personalizado existente. Distinguir copy «desde sugerido» vs «desde cero».
5. **Ayuda Users §6.7** en `CompanyRolesAssignmentSection` si hay ≥1 seleccionado `isSystem`. Enlace a `/dashboard/settings/access`. Create y Edit.
6. **Accesos sin seleccion:** copy §5 se conserva (`Elige un perfil de la lista…`) — no anadir segundo CTA.
7. **E2E access:** mocks `MOD00_ACCESS_V2`, 9 sugeridos (incl. SALES/ACCOUNTANT/HR), asercion **9** (hoy `toHaveCount(6)` y catalogo V1). Regenerar 6 snapshots. CA-ACC-POST-01 en desktop (empty post-corte, no «aun no has creado» si hay sugeridos). Axe 0 en los 6 combos.
8. **Jest:** empty post-corte vs empty sin sugeridos; banner tras create; ayuda Users; cards sugeridas **siguen sin** boton Editar; actualizar el test de loading al copy vivo.

## 5. Restricciones

- Skills: `iwana-identity-ui-review`, `system-vocabulary-review`, `frontend-dev-guidelines`, `core-components`.
- Texto visible en espanol, sentence case. Sin `any`. Sin PII.
- No tocar backend ni seed.

## 6. Stop / Go

- **STOP** si hace falta endpoint, token o mutar `isSystem` para cumplir un CA.
- **GO** cuando CA-ACC-POST-01…04 y 06 verdes en unit; E2E access alineado a 9 cards + empty post-corte; typecheck/lint del portal sin errores nuevos.

## 7. Entregables

Codigo portal + tests. Actualizar el **informe vivo** (no crear uno nuevo). No firmar G6. CA-ACC-POST-05 (walkthrough ≤8 acciones) queda para AI-SR-QA / Playwright de sesion real en el lote G6.
