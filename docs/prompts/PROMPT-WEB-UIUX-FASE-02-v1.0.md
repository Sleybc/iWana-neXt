# PROMPT — WEB-UIUX — Fase 02: modales de usuarios y confirmación destructiva — v1.0

## Módulo

- Nombre: Consola de plataforma (apps/web) — remediación UI/UX
- Código: WEB-UIUX
- Fase: 02
- Versión: 1.0
- Fecha: 2026-07-20
- Generado por: AI-EM-ARCH (Engineering Manager / Orchestrator)
- Agente destinatario: AI-FE-PLATFORM (instancia B)

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** los modales de gestión de usuarios usan `Dialog` de `@iwana/ui` (foco atrapado, Escape, scroll-lock); toda acción destructiva de la consola pasa por un patrón único de confirmación en marca; el toast de resultado de `/tenants` es accesible y persistente en error.
- **Lo que sí entra:** lo listado en §3.
- **Lo que no entra:** cambios de API o lógica de negocio; módulo audit/layout/dashboard (fase 01); páginas auth (fase 03); rediseño visual de los formularios internos de los modales.

## 2. Artefactos de entrada obligatorios

- Skill: `.agents/skills/iwana-identity-ui-review/SKILL.md` + `references/component-recipes.md`
- Patrón de referencia: `apps/web/src/components/tenants/CredentialsModal.tsx` (uso correcto de `Dialog`)
- Primitives: `packages/ui/src/components/Dialog.tsx` (verificar API real antes de usar)
- Plan padre: `docs/plans/PLAN-WEB-UIUX-REMEDIACION-v1.0.md`

## 3. Instrucciones

1. **Migrar a `Dialog` (P1):** `components/users/UserCreateModal.tsx` y `components/users/UserManagementModal.tsx` — reemplazar el `div role="dialog"` manual y `MODAL_PANEL_CLASS` (duplicada en ambos) por `Dialog`/`DialogContent`/`DialogHeader` siguiendo `CredentialsModal`; eliminar `z-[10000]`.
2. **`ConfirmDialog` compartido (P0):** crear `components/shared/ConfirmDialog.tsx` sobre `Dialog`: título, descripción del efecto, botón confirmar con variante destructiva, cancelar como acción segura por defecto; soporte opcional de confirmación tipada (texto a escribir).
3. **Cablear confirmaciones (P0):** eliminar usuario y generar contraseña temporal en `UserManagementModal.tsx` (:206-219, :266-293, :644-653) pasan por `ConfirmDialog` con descripción del efecto irreversible.
4. **Migrar `confirm()` nativos (P0):** suspender/reactivar en `app/(protected)/tenants/page.tsx:51-56` y eliminar empresa en `components/tenants/TenantSettingsForm.tsx:225-226` → `ConfirmDialog`; la eliminación de empresa usa confirmación tipada (nombre de la empresa).
5. **Toast accesible (P2):** `app/(protected)/tenants/page.tsx:20-23,191-201` — éxito: `role="status"` + `aria-live="polite"` (autodescarte aceptable); error: `role="alert"`, persiste hasta cierre manual; añadir botón de cierre; z-index dentro de la escala corta y por encima del shell de fase 01 (usar `z-50`).
6. Spinner de acción en `components/tenants/TenantCreateSummary.tsx` no se toca (descartado en review).
7. Documentar desvíos y decisiones al final (resumen para el informe de fase).

## 4. Restricciones no negociables

- Sin cambios de contrato de API ni de flujo de negocio: las mismas mutaciones, ahora confirmadas.
- Solo tokens existentes en `globals.css`; copy en español, sentence case; sin PII en ejemplos.
- No tocar archivos de fases 01/03 (`components/audit/*`, `components/layout/*`, `app/(protected)/layout.tsx`, `app/auth/*`, `components/auth/*`, `packages/ui/*` — si `Dialog` necesitara un ajuste, detenerse y escalar).
- Mantener los specs existentes (`UserManagementModal.spec.tsx`, etc.) en verde; actualizar sus queries si cambia el markup, sin debilitar aserciones.

## 5. Entregables técnicos obligatorios

- Modales migrados + `ConfirmDialog` + confirmaciones cableadas + toast accesible.
- Tests Jest de los componentes tocados en verde, con cobertura del nuevo flujo de confirmación (al menos: confirmar ejecuta, cancelar no ejecuta).

## 6. Entregables documentales obligatorios

- Resumen de fase en la respuesta final — el orquestador lo consolida en `docs/informes/INFORME-WEB-UIUX-REMEDIACION-v1.0.md`.

## 7. Criterios de aceptación

- CA-201: ninguna acción destructiva (eliminar usuario, contraseña temporal, suspender, eliminar empresa) ejecuta sin confirmación explícita.
- CA-202: `grep -rn "window.confirm\|confirm(" apps/web/src` → 0 usos nativos.
- CA-203: los dos modales atrapan foco, cierran con Escape y bloquean scroll (vía `Dialog`); no queda `role="dialog"` manual ni `MODAL_PANEL_CLASS`.
- CA-204: el toast de error persiste hasta cierre manual y se anuncia con `role="alert"`.
- CA-205: `pnpm --filter @iwana/web lint && typecheck` y specs de usuarios/tenants en verde.

## 8. Criterio de stop/go

- **Detenerse si:** `Dialog` de `@iwana/ui` carece de algo necesario (p. ej. variante destructiva o control de cierre) — no parchear la primitive: escalar a AI-EM-ARCH/AI-DS-OWNER con propuesta.
- **Documentar causa en:** resumen de fase. **Escalar a:** AI-EM-ARCH.

## 9. Criterio de salida de la fase

- CA-201…205 cumplidos, tests en verde, resumen entregado.
