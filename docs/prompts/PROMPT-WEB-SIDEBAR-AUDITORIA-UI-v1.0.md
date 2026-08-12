# PROMPT-WEB-SIDEBAR-AUDITORIA-UI-v1.0

## Prompt de ejecución — auditoría UI + copy · menú lateral `apps/web`

**Versión:** 1.0  
**Estado:** Emitido — en ejecución  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** Auditoría (pre-G2) · protocolo v1.5 §3bis  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B)  
**Siguiente:** tras INFORME, EM-ARCH emitirá prompt de alineación G2 si el score lo exige.

> **Solo auditoría.** No implementar código. No congelar specs de remediación aún.  
> Alcance: sidebar de `apps/web` (consola plataforma). **No** rediseñar TopHeader salvo deslinde. **No** `apps/portal` salvo comparación de receta.

---

## 0. Identidad de sesión

1. `AGENTS.md`
2. Este prompt
3. Skills: A = `system-vocabulary-review` + `ui-ux-pro-max` (subordinada); B = `iwana-identity-ui-review` **modo review** + receta shell (`references/component-recipes.md` §10)
4. Firma: `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`
5. Copy vivo: `platform-ui-copy.ts` → `navigation*` / `navigationGroups` / `shell`
6. Código: `apps/web/src/components/layout/Sidebar.tsx` (+ `PlatformBrandMark.tsx`, layout protegido)
7. Antecedentes (no borrar; medir **código vivo** contra Firma):
   - `docs/informes/INFORME-WEB-SHELL-SIDEBAR-CARRIL-RAPIDO-v1.0.md`
   - `docs/specs/2026-08-10-web-shell-sidebar-carril-rapido-contrato.md`
   - `docs/specs/2026-08-11-sidebar-azul-noche-ds-contrato.md`
   - `docs/prompts/PROMPT-WEB-PORTAL-SIDEBAR-AZUL-NOCHE-v1.0.md`

**Barrido EM-ARCH:** `audit-ui.mjs` sobre Sidebar + BrandMark — adjuntar resultado en el INFORME.

---

## 1. Tarea del operador

Navegar entre Centro de control, Empresas, Usuarios, Historial y Plataforma; reconocer ítem activo; colapsar en desktop; abrir/cerrar en mobile.

---

## 2. Foco

1. **Copy:** grupos (`Operacion` / `Gobierno`), ítems, `shell.workspace*`, acentos, sentence case, jerga.
2. **Identidad:** receta Firma = sidebar **azul noche** + barra lima activa. El código vivo (2026-08-11) es **blanco / glass**. Dictaminar si es deuda vs contrato azul-noche o decisión superada.
3. **A11y:** foco, `aria-current`, collapsed titles, mobile Escape, targets ≥44px.
4. **Consistencia** con canvas `rounded-3xl` + `iwana-surface-soft` ya vivos.

---

## 3. Entregables

### Track A — INFORME owner

Crear: `docs/informes/INFORME-WEB-SIDEBAR-AUDITORIA-UI-v1.0.md`

Formato `iwana-identity-ui-review`: resumen, puntaje /100, P0–P3 con `archivo:línea`, matriz copy, CA-SB-01…N (no chocar IDs de deuda previa; si CA-SB ya existen en otro informe, usar **CA-NAV-01…N**).

Hueco «Identidad / DS» para B.

### Track B — DS

Integrar hallazgos visuales/tokens en el mismo INFORME. Veredicto: remediación carril rápido SÍ/NO (¿azul noche reabre tokens de marca? si sí, **no** es carril rápido).

---

## 4. Fuera de alcance

Implementación FE · portal sidebar · cambiar IA de navegación (nuevas rutas) · TopHeader salvo mención.

---

## Changelog

| Ver | Cambio |
| --- | --- |
| 1.0 | Auditoría menú lateral web |
