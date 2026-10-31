# PROMPT — MOD13 · Consumidor WFM del puerto de Organización (addendum §6)

## Módulo

- **Nombre:** MOD13 Network (catálogo de routers), con consumidor en WFM
- **Fase:** addendum §6 del plan de retiro de la columna LAN: corrección del consumidor del puerto
- **Versión:** 1.0
- **Fecha:** 2026-10-29
- **Generado por:** AI-EM-ARCH
- **Agente destinatario:** `sr-backend`
- **Plantilla:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 (en revisión)

## 1. Objetivo exacto

- **Resultado esperado:** `pnpm --filter @iwana/api typecheck` sale con código 0.
- **Lo que sí entra:** el mock de `OrganizationSiteReadPort` en `apps/api/src/modules/wfm/services/wfm-organization-sites.adapter.spec.ts` declara `findRouterSummariesByIds`. Si el typecheck revela otros dobles de prueba del mismo puerto en el mismo estado, también entran.
- **Lo que no entra:** cambiar el puerto, su adaptador, `network-catalog`, el adaptador WFM productivo, privacy o cualquier otro archivo.

## 2. Artefactos de entrada

- Plan: `docs/plans/2026-10-28-mod13-routers-retiro-columna-lan.md` **v1.1 §6**.
- Origen del cambio de puerto: `docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md` §8.8.
- Puerto: `apps/api/src/modules/organization/ports/organization-site-read.port.ts`, con `findRouterSummariesByIds(siteIds: string[]): Promise<OrganizationSiteRouterSummaryRecord[]>`. Es un cambio sin commitear de MOD13 y **es el contrato vigente**: no lo modifiques.
- Error de partida: `TS2352` en `wfm-organization-sites.adapter.spec.ts:7`, el único que reporta el typecheck de API el 2026-10-29.

## 3. Pasos

1. Reproduce el error con `pnpm --filter @iwana/api typecheck` y registra la salida.
2. Añade `findRouterSummariesByIds: jest.fn()` al mock, siguiendo el patrón de los otros métodos. No conviertas a `unknown` ni relajes el tipo: el cast tipado es lo que detectó la deriva.
3. Repite el typecheck. Debe salir con código 0. **Si aparece otro error, no lo corrijas:** emite `[BLOQUEO]` con el diagnóstico literal.
4. Corre sin caché: el spec de WFM, `apps/api/src/modules/organization` y `apps/api/src/modules/network/network-catalog.service.spec.ts`.

## 4. Restricciones

- Árbol compartido: hay cambios sin commitear de MOD13 y de privacy (textos legales). No los toques, no los reviertas y no commitees.
- Sin datos reales ni credenciales. Solo `pnpm`.

## 5. Entregables

- El diff del spec WFM.
- La §8.9 «Consumidor WFM del puerto de Organización — 2026-10-29» en `docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md`, con:
  - el error de partida;
  - el cambio;
  - typecheck con su código de salida;
  - conteo real de las suites del paso 4;
  - deuda nueva por severidad.

## 6. Criterio de stop/go

- **GO:** typecheck de API con código 0 y suites del paso 4 en verde.
- **STOP (`[BLOQUEO]` a AI-EM-ARCH):** cualquier error de typecheck que exija tocar código productivo o un archivo fuera del alcance §1.
