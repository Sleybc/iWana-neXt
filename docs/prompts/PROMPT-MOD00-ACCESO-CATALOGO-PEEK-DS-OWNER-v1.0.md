# PROMPT — MOD00 Acceso — Veredicto DS-OWNER peek de catálogo

**Version:** 1.0
**Fecha:** 2026-08-29
**Agente destinatario:** AI-DS-OWNER
**Autor del prompt:** AI-EM-ARCH (orquestador)
**Modo:** Consulta de contrato (carril rápido)
**Plan congelado:** `docs/plans/2026-08-29-mod00-acceso-catalogo-sugeridos-en-peek.md` **v1.1 — opción B**
**UX en paralelo:** `docs/prompts/PROMPT-MOD00-ACCESO-CATALOGO-PEEK-FASE-01-v1.0.md` (PROD-UX edita specs; **tú no editas esos archivos** para evitar carrera)

---

## 1. Objetivo exacto

Veredicto escrito: el flujo «lista de 9 perfiles sugeridos + detalle de qué permite + confirmar» **cabe en `PortalSidePeek` existente**. Sin primitiva nueva, sin token nuevo, sin cambio de API de `@iwana/ui`.

## 2. Artefactos de entrada (abrirlos)

- Plan v1.1 §3 opción B y §5 (secuencia).
- `apps/portal/src/components/shared/portal-ui.tsx` — `PortalSidePeek` (props `open`, `onClose`, `title`, `description`, `eyebrow`, `children`, `footer`).
- Receta #9: `.agents/skills/iwana-identity-ui-review/references/component-recipes.md`.
- Spec v1.9 §10 (contrato visual vigente, solo lectura).
- Firma iWana. Tokens: `packages/ui/src/styles/globals.css` si citas color (por token, nunca hex).

## 3. Pregunta de contrato

¿Lista compacta + detalle de accesos (solo lectura) + footer de confirmación se componen con `children` + `footer` del peek actual, o falta un estado/prop del contrato de componente?

Hipótesis del orquestador (confirma o refuta): **basta**. Dos momentos en el mismo peek (lista ↔ detalle) cambiando `title`/`children`/`footer`; un solo `open`. Overlay, Escape, trampa de foco y `shadow-iwana-soft` ya cubiertos. Prohibido Drawer nuevo, `z-10000`, glass en cabecera.

## 4. Alcance

- Entregable: veredicto en tu respuesta final al orquestador, con esta forma:
  1. **GO / GO CON CONDICIONES / NO-GO**
  2. Primitiva autorizada (nombre + archivo)
  3. Anatomía permitida (qué va en title / description / children / footer)
  4. Estados requeridos ya cubiertos vs huecos
  5. Prohibiciones (tokens, primitivas, sombras, z-index)
  6. Condiciones si GO CON CONDICIONES (una frase cada una)
- **No** edites `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` ni la spec Fase 3 (PROD-UX las versiona). El orquestador estampa tu veredicto en §10.
- **No** código, **no** flujos nuevos, **no** paleta.

## 5. Stop / Go

- **NO-GO** solo si `PortalSidePeek` no puede hospedar lista+detalle sin romper foco o footer sticky — entonces propone el hueco de contrato mínimo (prop), no un componente paralelo.
- **GO** si FE puede implementar mañana contra el peek actual.

## 6. Entregables

Veredicto en sesión. Cero archivos, salvo que detectes un hueco de contrato que **exija** una línea en spec §10 (entonces dilo en el veredicto; no la escribas tú).
