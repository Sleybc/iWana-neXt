# PROMPT-WEB-SETTINGS-AUDITORIA-UI-v1.0

## Prompt de ejecución — auditoría UI + copy · `/settings` (apps/web)

**Versión:** 1.0  
**Estado:** Emitido — en ejecución  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa:** Auditoría (pre-G2) · protocolo v1.5 §3bis  
**Destinatarios:** AI-PROD-UX (A) · AI-DS-OWNER (B)  
**Siguiente (fuera de este prompt):** tras INFORME emitido, EM-ARCH emitirá prompt de alineación G2→G4 si el score lo exige.

> **Solo auditoría.** No implementar código productivo. No congelar specs de remediación aún.  
> Alcance: `apps/web` ruta `/settings` (consola plataforma). **No** `apps/portal`. **No** `tenants/[id]/settings` salvo mención de deslinde.

---

## 0. Identidad de sesión

1. `AGENTS.md`
2. Este prompt
3. Skills obligatorias:
   - A: `system-vocabulary-review` + `ui-ux-pro-max` (**subordinada** a iWana; adaptar/descartar genéricos)
   - B: `iwana-identity-ui-review` (**modo review**) + `core-components`
4. Firma: `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`
5. Referencia de forma (informe hermano): `docs/informes/INFORME-WEB-EMPRESAS-AUDITORIA-UI-v1.0.md` o Historial
6. Copy vivo existente: `apps/web/src/lib/platform-ui-copy.ts` (hoy casi no tiene bloque `settings` de pantalla)
7. Nav: `PLATFORM_UI_COPY.nav.settings` = «Plataforma»

---

## 1. Superficie a auditar

| Ruta | Archivos |
| --- | --- |
| `/settings` | `apps/web/src/app/(protected)/settings/page.tsx` (+ `.spec.tsx`) |
| Branding | `apps/web/src/components/settings/PlatformBrandingSettings.tsx` |
| Seguridad | `apps/web/src/components/settings/SecuritySettings.tsx` (+ `.spec.tsx`) |

**Tarea principal del operador:** configurar identidad visual de la consola y su propia seguridad de acceso (contraseña + verificación en dos pasos).

**Barrido mecánico (ya corrido por EM-ARCH):**  
`audit-ui.mjs` sobre settings → **0 hallazgos deterministas**. Los hallazgos de copy/jerarquía/Alert no los cubre el script.

---

## 2. Foco explícito del operador

1. **Copy alineado a iWana** — sentence case, sin jerga (`MFA`, `TOTP`, `Authenticator`, `branding` crudo, `Gobierno`, `superficie`, `metadata`, enums). Preferir «verificación en dos pasos» (canon vocabulario).
2. **Identidad visual** — PageHeader, Card anidada, tabs, Alert vs cajas FORM_ALERT_*, shadow dual, dark-surface, min-h-11.
3. **Consistencia** con Empresas / Historial / centro de control (Alert, copy en `PLATFORM_UI_COPY`, sin strings sueltos).

---

## 3. Entregables

### Track A — AI-PROD-UX (owner del INFORME)

Crear:

`docs/informes/INFORME-WEB-SETTINGS-AUDITORIA-UI-v1.0.md`

Formato estándar `iwana-identity-ui-review` (resumen ejecutivo, puntaje /100, P0–P3, evidencia archivo:línea, CA-SET-01…N, deslinde portal/tenant-settings).

Incluir matriz de copy actual → propuesto (vocabulario).

### Track B — AI-DS-OWNER

En paralelo, evaluar superficie/tokens/primitives. Al terminar A (o en paralelo si el archivo aún no existe: devolver hallazgos estructurados), **integrar** en el mismo INFORME una sección «Hallazgos de identidad / DS» o editar hallazgos P* de identidad con evidencia. Veredicto: ¿carril rápido viable para remediación posterior? (sin congelar contrato aún).

**No** crear aún UX spec ni DS contrato de remediación (eso es el prompt G2 siguiente).

---

## 4. Fuera de alcance

- Implementación FE
- Portal settings
- Cambios de API MFA/branding
- Sidebar / shell global

---

## 5. Criterio de done

INFORME v1.0 en `docs/informes/` con puntaje, hallazgos priorizados, CA de remediación y copy propuesto. Sin `[BLOQUEO]` de proceso salvo P0 real.

---

## Changelog

| Ver | Cambio |
| --- | --- |
| 1.0 | Auditoría inicial `/settings` web |
