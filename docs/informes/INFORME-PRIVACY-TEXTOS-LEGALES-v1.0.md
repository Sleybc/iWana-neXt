# INFORME — Privacy · Textos legales consumibles por el sistema — cierre de fase

**Versión:** 1.0
**Estado:** **G6 GO** (2026-10-29) · G6.5 pendiente (commit + CI de `main` por SHA) · B5 pendiente (aprobación jurídica + publicación en el tenant de Iwana)
**Fecha:** 2026-10-29
**Autor:** AI-EM-ARCH (modo EM + Orchestrator)
**Plan:** [`docs/plans/2026-10-29-privacy-textos-legales.md`](../plans/2026-10-29-privacy-textos-legales.md) v1.2 · **Spec:** [`docs/specs/2026-10-29-privacy-textos-legales.md`](../specs/2026-10-29-privacy-textos-legales.md) v1.2 · **Anexo:** [`2026-10-29-privacy-textos-legales-anexo-iwana-v1.md`](../specs/2026-10-29-privacy-textos-legales-anexo-iwana-v1.md) v1.0

## 1. Resultado

La superficie «Textos legales» (`/dashboard/privacy?view=legal`) deja de ser un almacén que solo se lee para capturar la autorización:

- **Formato fiel.** La Política, el Aviso y la Autorización se publican en Markdown seguro; las filas existentes conservan el texto plano con el que fueron aceptadas.
- **Captura desbloqueada.** Un usuario comercial lee el texto vigente sin el 403 que antes se mostraba como «no hay texto vigente».
- **Finalidades por empresa.** La captura solo ofrece las finalidades que declara la política de cada empresa.
- **Textos de Iwana listos.** Los tres textos fuente de Iwana S.A.S. quedan en el anexo: la política tal como la aprobó el responsable, y el aviso y la autorización como borradores.
- **Hallazgo de seguridad corregido.** Al revisar la fase se encontró y corrigió un defecto heredado de la Fase 1a: un token de plataforma con `X-Tenant-Slug` alcanzaba todo el módulo `privacy`.

## 2. Bloques

| Bloque | Responsable | Estado | Informe |
| --- | --- | --- | --- |
| B0 | AI-EM-ARCH | Cerrado | spec, anexo, plan, prompts y launchers |
| E1 | CTO | Aprobada: `react-markdown` 10.1.0 + `remark-gfm` 4.0.1, registradas en `Stack_Tecnologico.md` | plan §6 |
| B1 | `sr-backend` | Cerrado (tras el `[BLOQUEO]` resuelto con D-B1-1) | [B1 v1.1](INFORME-PRIVACY-TEXTOS-LEGALES-B1-v1.0.md) |
| B2 | `fe-platform` | Cerrado | [B2 v1.1](INFORME-PRIVACY-TEXTOS-LEGALES-B2-v1.0.md) |
| B3 | `sr-qa` | Cerrado | [B3-QA v1.0](INFORME-PRIVACY-TEXTOS-LEGALES-B3-QA-v1.0.md) |
| B4 | `sec-eng` | Cerrado (P1 → D-B4-1 → re-verificado) | [B4-SEC v1.1](INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md) |
| B6 | `sr-backend` | Cerrado | [B6 v1.0](INFORME-PRIVACY-TEXTOS-LEGALES-B6-v1.0.md) |
| MOD13 B3 | `sr-backend` (obra MOD13) | Cerrado: fixture WFM que bloqueaba el typecheck de API | [informe MOD13 §8.9](INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md) |
| B5 | Humano (Oficial / ADMIN del tenant de Iwana) | **Pendiente** | — |

## 3. Gates Before Merge (`AGENTS.md`) — evidencia de G6

| Gate | Resultado | Evidencia |
| --- | --- | --- |
| No critical vulnerabilities | **PASS** | Re-ejecutado por AI-EM-ARCH: `pnpm audit --prod --audit-level critical` da 0 críticas. Las 9 existentes (3 altas: `zod`, `body-parser`, `multer`; 5 moderadas; 1 baja) son previas y están en `apps/api` o en `csv-parse` del portal; ninguna viene de las dependencias de E1. B4 v1.1: sin P0/P1 |
| No boundary violations | **PASS** | Re-ejecutado por AI-EM-ARCH: ningún import a `modules/privacy/` desde otro módulo fuera de los puertos, y ningún SQL a `legal_texts` o `privacy_purpose_settings` fuera de `privacy`. CRM consume `IPrivacyLegalTextReadPort` e `IPrivacyPurposeReadPort` |
| Tests ≥ 80 % core modules | **PASS** | B3: API `modules/privacy` 96,26 % líneas / 85,14 % ramas; shared `schemas/privacy` 100 %; portal (privacy y consumidores) 89,94 % / 80,58 %. Sin caché |
| OpenAPI updated | **PASS** | B1: `privacy-openapi.schemas.ts` con `format` y `/privacy/purposes`, cubierto por las pruebas de OpenAPI de la suite de privacy |
| Migrations reversible | **PASS** | B1: migración tenant 166 con `up → down → up` contra PostgreSQL real (11 pruebas) e incluida en el inventario de reversiones destructivas |
| No PII in logs | **PASS** | B4: la auditoría del `PUT` de finalidades guarda solo finalidad y estado; la de `legal_texts` no incluye el contenido. Fixtures sintéticos o del anexo |
| Lint and typecheck passing | **PASS** | Re-ejecutado por AI-EM-ARCH tras MOD13 B3: `typecheck` de `@iwana/api`, `@iwana/shared` y `@iwana/portal`, y `lint` de `@iwana/api`, `@iwana/shared`, `@iwana/portal` y `@iwana/db`, todos con código 0 |

**Pruebas:**

| Suite | Conteo | Quién lo ejecutó |
| --- | --- | --- |
| API `modules/privacy` + invariante de permisos, sin caché | 36 suites, 187 pruebas | AI-EM-ARCH, tras B6 |
| Shared `schemas/privacy` | 4 suites, 22 pruebas | B3 |
| Portal: suite completa | 330 suites, 3326 pruebas, 1 omitida previa y ajena | B2 |
| Portal: specs de privacidad | 8 suites, 77 pruebas | B3 |
| PostgreSQL: integración de la migración 166 | 11 pruebas | B1 |
| PostgreSQL: integración de finalidades | 1 prueba | B1 |
| PostgreSQL: migración DPO 147 | 2 pruebas | B6 |
| E2E B3 | 3/3 | B3; repetido por B6 |
| WFM + `organization` + `network-catalog` | 6 suites, 95 pruebas | MOD13 B3 |

**Criterios de aceptación:** CA-LT-01 a CA-LT-13 en verde (spec §4).

**Dictamen G6: GO.** El aprobador no es el productor: los bloques los produjeron los subagentes y AI-EM-ARCH consolidó y re-ejecutó los gates indicados.

## 4. Decisiones de la fase

| ID | Decisión | Registro |
| --- | --- | --- |
| D1–D3 | El aviso y la autorización los redacta AI-EM-ARCH; finalidades por empresa; Markdown seguro | plan §2 |
| E1 | `react-markdown` + `remark-gfm` con `skipHtml`, `allowedElements` y `urlTransform` limitado a http/https | spec C4, `Stack_Tecnologico.md` |
| D-B1-1 | `PUT /privacy/purposes` con `@Roles(ADMIN, AUDITOR)` + `privacy.manage`; sin excepción al invariante | spec §8 |
| D-B4-1 | `RolesGuard` en los 9 controladores de `privacy`; no se toca `PermissionsGuard`; residual aceptado en `GET current` y `GET purposes` | spec §8 |
| Fixture WFM | Lo corrige la obra MOD13 que cambió el puerto (decisión del usuario) | plan MOD13 v1.1 §6 |

## 5. Deuda por severidad

| Severidad | Deuda | Origen |
| --- | --- | --- |
| Crítica | Ninguna | — |
| Alta | Ninguna nueva. Hay 3 vulnerabilidades altas previas en dependencias de `apps/api` (`zod`, `body-parser`, `multer`), ajenas a esta fase; se registran para el próximo `codebase-cleanup-deps-audit` | `pnpm audit` |
| Media | Legado `crm/habeas-data` con `legalTextVersion` libre y sin hash, todavía montado | spec §7 |
| Media | `PermissionsGuard` deja pasar cualquier token `platform`. En esta fase lo neutraliza `RolesGuard` en los 9 controladores de `privacy`, pero sigue siendo una conducta transversal y queda como propuesta aparte | D-B4-1 (b) |
| Baja | Sin columna `valid_from`; la vigencia declarada vive en el contenido | spec §6 |
| Baja | La Política aún no se consume en `apps/web` ni en el PDF del contrato | spec §7 |

**Hallazgo sobre una fase cerrada:** el defecto de D-B4-1 existía desde la Fase 1a de privacy, que ya tenía G6.5 GO. No hubo exposición en producción, porque G7 está diferido hasta la beta. La corrección cubre el módulo completo.

## 6. Pendientes para G6.5 y B5

1. **Commit separado por obra.** El árbol de `main` mezcla esta fase con trabajo sin commitear de MOD13 (catálogo de routers y organización, §8.8 y §8.9) y otras rutas. El commit de esta fase debe incluir **solo** sus archivos: los de privacy, los contratos `schemas/privacy`, la migración 166, los consumidores CRM y del portal, el `pnpm-lock.yaml` con las dos dependencias de E1 y los documentos de la fase. El fixture WFM viaja con la obra MOD13. **Riesgo:** si se commitea privacy sin MOD13, el árbol del commit **no** contiene el cambio de puerto de §8.8 y el mock WFM sigue compilando; si se commitea MOD13 sin su fixture, el CI vuelve a rojo. Hay que mantener juntos el puerto y el fixture.
2. **G6.5:** CI de `main` en verde sobre el SHA del commit (ADR-069), registrado aquí.
3. **B5:**
   - aprobación del Aviso y la Autorización por Iwana S.A.S. y dictamen jurídico (ADR-094 §7 punto 3);
   - en el tenant de Iwana, desactivar `DATOS_BIOMETRICOS` y `REPORTE_CENTRALES_RIESGO`;
   - publicar los tres textos del anexo en orden Política → Aviso → Autorización, con `format: MARKDOWN` (runbook de release por tenant, Paso 7).

## 7. Métricas de la fase

- **Reescrituras de la spec:** 2 versiones (v1.1 por D-B1-1 y v1.2 por D-B4-1); ninguna reabrió alcance.
- **Bloqueos:** 2, los dos resueltos en la sesión siguiente.
- **Desempates:** 2.
- **Escalaciones al CTO:** 1 (E1), resuelta.
- **Hallazgos post-merge:** sin instrumentar (aún no hay merge).
