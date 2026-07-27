---
description: "R-10 borrar eslint-disable react-hooks inexistente — AI-FE-PLATFORM"
name: "Gate R-10 lint monorepo"
agent: "fe-platform"
---

# PROMPT — AI-FE-PLATFORM · R-10

**Emisor:** AI-EM-ARCH  
**Gate:** [INFORME-ADR065-OLA1-GATE-R10-DISPOSICION-v1.0](../../docs/informes/INFORME-ADR065-OLA1-GATE-R10-DISPOSICION-v1.0.md)

## Objetivo

`pnpm lint` (raíz) falla: tres directivas desactivan `react-hooks/exhaustive-deps`, regla **no registrada** en ESLint 9 flat del monorepo.

## Alcance — solo borrar las directivas (conservar comentarios si aclaran intención)

1. `apps/web/src/app/(protected)/tenants/page.tsx` (~146) — quitar `eslint-disable-next-line react-hooks/exhaustive-deps`
2. `apps/portal/src/components/assurance/AssuranceClient.tsx` (~320) — igual
3. `apps/portal/src/components/operations/OperationsClient.tsx` (~198) — quitar `eslint-disable-line react-hooks/exhaustive-deps`

## Prohibido

- Instalar `eslint-plugin-react-hooks`
- Cambiar dependencias de los `useEffect`
- Refactors ajenos

## Stop / Go

Tras el cambio: `pnpm lint` en la **raíz** del monorepo → 0 errores (warnings preexistentes OK si no bloquean CI).

Sin commit.
