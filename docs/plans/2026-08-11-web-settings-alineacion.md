# Alineación `/settings` (Plataforma) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remediar copy + identidad de `apps/web` `/settings` según CA-SET-01…12 (informe 44/100).

**Architecture:** Bloque `PLATFORM_UI_COPY.settings`; dos tabs Identidad/Seguridad; Alert + soft/2xl + foco slot; sin API.

**Tech Stack:** Next.js App Router, `@iwana/ui`, Jest.

**Prompt:** [`PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-SETTINGS-ALINEACION-v1.0.md)

---

### Task 1: A — UX spec v1.0 Congelada

- Create: `docs/specs/2026-08-11-web-settings-plataforma-ux-spec.md`
- [ ] Copy literal (matriz informe), 2 tabs, CA-SET, Congelado

### Task 2: B — DS contrato v1.0 Congelado GO

- Create: `docs/specs/2026-08-11-web-settings-plataforma-ds-contrato.md`
- [ ] Alert, una cáscara, soft/2xl, foco, skeleton, 0 primitives, GO

### Task 3: C — Copy + page chrome

- Modify: `platform-ui-copy.ts`, `settings/page.tsx` (+ spec)
- [ ] Bloque settings; 2 tabs; subtítulo; sin Gobierno/General

### Task 4: C — SecuritySettings

- Modify: `SecuritySettings.tsx` (+ spec)
- [ ] Copy MFA; Alert; sin panel anidado; soft; otpauth avanzado; tests

### Task 5: C — PlatformBrandingSettings

- Modify: `PlatformBrandingSettings.tsx` (+ specs)
- [ ] Copy identidad; Alert; soft/2xl; focus slot; skeleton; eyebrow; tests

### Task 6: D — Verificación

- [ ] Jest settings; audit-ui; adenda GO en informe
