# PROMPT — Privacy · Textos legales · B8 Historial de versiones

## Módulo

- **Nombre:** `privacy`, portal
- **Fase:** Textos legales, bloque B8 (C7 de la spec v1.3)
- **Versión:** 1.0
- **Fecha:** 2026-10-30
- **Generado por:** AI-EM-ARCH
- **Agente destinatario:** `fe-platform`
- **Plantilla:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 (en revisión)

## 1. Objetivo exacto

- **Resultado esperado:** en `/dashboard/privacy?view=legal`, la lista principal muestra solo las versiones vigentes y las reemplazadas pasan a «Historial de versiones», contraído por defecto.
- **Lo que sí entra:** C7 de la spec v1.3 en `LegalTextsSurface` (`apps/portal/src/components/privacy/PrivacyWorkspace.tsx`), más sus pruebas.
- **Lo que no entra:**
  - API, `packages/shared`, base de datos;
  - los consumidores `CompliancePanel`, `SubscriberForm` y `ConsentsPanel`;
  - la sección de finalidades;
  - componentes nuevos en `@iwana/ui`.

## 2. Artefactos de entrada

- **Contrato:** `docs/specs/2026-10-29-privacy-textos-legales.md` **v1.3**, §3 C7 y CA-LT-14 a 17.
- **Componente a reutilizar:** `SectionAccordion` de `@iwana/ui` (`packages/ui/src/components/SectionAccordion.tsx`). Ejemplos de uso: `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx` y `apps/portal/src/components/inventory/AwardQuoteAccordion.tsx`.
- **Datos:** `GET /privacy/legal-texts`, que ya devuelve todas las versiones con `isCurrent` y `publishedAt`.
- **Pruebas existentes:** `apps/portal/src/components/privacy/PrivacyWorkspace.spec.tsx`.

## 3. Pasos

1. Separa el listado en vigentes (`isCurrent`) y reemplazadas.
   - **Vigentes:** en orden Política → Aviso → Autorización.
   - **Reemplazadas:** agrupadas por tipo en el mismo orden y, dentro de cada tipo, de la más reciente a la más antigua.
   - **Fecha de reemplazo:** el `publishedAt` de la versión inmediatamente posterior del mismo tipo.

   Haz el cálculo en una función pura dentro del módulo de privacidad y pruébala aparte.
2. Lista principal «Versiones vigentes»: conserva la fila y el peek actuales.
3. «Historial de versiones (N)» con `SectionAccordion`, contraído por defecto. No se renderiza con N = 0. Filas con «Publicada el», «Reemplazada el» y la huella corta, sin insignia.
4. En el peek de una versión reemplazada, aviso informativo con el texto exacto de C7 punto 3, usando el patrón de alerta que ya usa el portal (`PortalAlert` o el equivalente vigente). Conserva la huella completa y «Copiar huella».
5. Accesibilidad y vocabulario según C7 puntos 6 y 7.
6. Pruebas de CA-LT-14 a 16 en `PrivacyWorkspace.spec.tsx`, más la unitaria de la función pura. Las fechas son sintéticas y no hay PII.

## 4. Restricciones

- Solo tokens reales de `packages/ui/src/styles/globals.css`. Ni color ni estilo nuevo.
- No tocar los archivos de MOD13 ni de organización que están sin commitear en el árbol, ni hacer commit.
- Solo `pnpm`.

## 5. Gates y evidencia

- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre `PrivacyWorkspace.tsx`, sin P0/P1 (CA-LT-17).
- `pnpm --filter @iwana/portal typecheck` y `pnpm --filter @iwana/portal lint`, ambos con código 0.
- **Suite completa del portal** sin caché: `pnpm --filter @iwana/portal exec jest --runInBand --silent --no-cache`. Reporta suites y pruebas.

## 6. Entregable

`docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md` (verifica que la ruta esté libre). Debe incluir:
- archivos tocados;
- CA-LT-14 a 17 con su prueba;
- comandos con código de salida y conteos reales;
- deuda nueva por severidad.

## 7. Stop/go

- **GO:** CA-LT-14 a 17 en verde y la suite completa del portal sin fallos.
- **STOP (`[BLOQUEO]` a AI-EM-ARCH):** si `SectionAccordion` no sirve sin modificarlo, o si C7 exige un cambio de API.
