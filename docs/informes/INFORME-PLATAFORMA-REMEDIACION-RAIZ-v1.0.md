# INFORME — Plataforma / remediación de configuración raíz

**Versión:** 1.0  
**Estado:** En revisión — evidencia parcial; no autoriza merge ni producción  
**Fecha:** 2026-08-08  
**Responsable de ejecución:** AI-PLAT-OPS  
**Revisión requerida:** AI-SR-QA y AI-SEC-ENG

## Trazabilidad

- Plan: [Remediación de configuración raíz](../plans/2026-08-08-remediacion-configuracion-raiz.md).
- Prompt de ejecución: [Plataforma / remediación raíz](../prompts/PROMPT-PLATAFORMA-REMEDIACION-RAIZ-v1.0.md).
- Gates: [ADR-069 — G6.5](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) y [Protocolo de colaboración](../roles/Protocolo_Colaboracion_Multiagente_v1.md).
- Runbook actualizado: [Release y rollback](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md).

## 1. Alcance ejecutado

| Track | Entregables observados | Estado |
| --- | --- | --- |
| Docker y operación | Contexto Docker excluye backups, almacenamiento local, HAR/trace, caches, logs, payload de login y caché Python; Git conserva únicamente `secrets/.gitkeep`. El overlay productivo inyecta consumidores existentes y espera migrator/MinIO one-shot. | Implementado; pendiente de revisión independiente. |
| Toolchain | Política `allowBuilds`, overrides, inputs Turbo, hooks, agregador Jest y reglas ESLint actualizados por AI-FE-PLATFORM. Las reglas type-aware se limitan a código fuente: specs/tests quedan con lint sintáctico porque el `tsconfig` de database los excluye. `turbo.json.globalDependencies` incluye `eslint.config.js` para invalidar caché cuando cambia esa configuración. | Implementado; verificación parcial documentada en §2. |
| Higiene raíz | Se retiraron el payload de login, instalador huérfano, script one-off y exactamente los tres logs auditados; `.gitattributes` fija LF general y CRLF para `.cmd`/`.bat`. | Implementado. |
| Gobernanza y documentación | `AGENTS.md` usa pnpm también en comandos puntuales, declara `@iwana/storage`; `CLAUDE.md` queda como bootstrap sin reglas duplicadas; este informe registra evidencia y gates separados. | Implementado. |

No se modificaron contratos de API, componentes, schemas, topología Docker, secretos locales, backups ni historia Git. La modificación local de paginación en `apps/api/src/common/pagination/clamp-page-endpoints.controller.http.spec.ts` se preservó.

## 2. Evidencia de verificación

| Comando o comprobación | Resultado real |
| --- | --- |
| Tres renders `docker compose ... config --quiet` (base, base+dev y base+prod con `.env.production.example`) | PASS, código 0 y sin volcar configuración ni valores. Docker emitió avisos de permiso al leer `C:\\Users\\SLEYB\\.docker\\config.json`; no alteraron el código de salida. |
| Comprobación estática de exclusiones y ausencia de los seis artefactos retirados | PASS. Incluye `.backups`, `apps/api/storage`, payload de login, HAR/trace, `.pnpm-store`, `.eslintcache`, `__pycache__` y `*.pyc`. |
| `pnpm install --frozen-lockfile --ignore-scripts --offline --lockfile-only` | PASS no destructivo. |
| `pnpm turbo run build --dry=json` | El wrapper local no resolvió; el binario local directo se ejecutó con código 0 y confirmó inputs/variables de build. |
| ESLint local directo sobre `eslint.config.js` y `apps/web/src/lib/api-client.ts` | PASS, código 0. |
| `pnpm lint --force` y re-ejecución normal | PASS, código 0: 8/8 tareas, `Cached: 0`; warnings heredados, sin errores. |
| `pnpm test --force` | Evidencia parcial, sin veredicto global: superó 60 s y se terminó por timeout. Antes del corte: `@iwana/shared` registró 2 suites / 7 tests PASS; database mostró múltiples suites PASS; portal registró 171 suites / 1.103 tests PASS / 1 skipped; worker inició al terminar la ventana. No se archivan logs. |
| `pnpm --filter @iwana/web typecheck` | PASS, código 0. |
| `pnpm run lint:staged` y `pnpm run commitlint --edit .git/COMMIT_EDITMSG` | PASS, código 0. |
| Carga de configuración Jest/lint-staged y `git diff --check` | PASS, código 0. |
| `pnpm audit:doc-locations` | PASS: 0 bloqueantes y 2 avisos. Ambos señalan informes bajo `.playwright-mcp/`, fuera de `docs/informes/`; no se modificaron por estar fuera de este alcance. |

### Bloqueo de reinstalación compartida

El comando completo `pnpm install --frozen-lockfile --ignore-scripts --offline` abortó con `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`: para continuar requería reemplazar `node_modules`. La decisión de AI-EM-ARCH fue no usar `CI=true` ni recrear `node_modules` compartido. Por tanto, el resultado `--lockfile-only` no se interpreta como una reinstalación completa.

### Deuda ESLint

`@typescript-eslint/no-explicit-any` y `@typescript-eslint/no-floating-promises` quedan configuradas como `warn`. Hay 60 usos preexistentes de `any` fuera del alcance congelado; no se elevan a error ni se declaran resueltos en esta fase. Esta deuda impide usar el lint focalizado como evidencia de aceptación integral G6.

## 3. Riesgos y deuda abierta

- El wrapper local de Turbo no resolvió el comando dry-run; la validación directa del binario no sustituye una ejecución futura de CI Linux.
- La reinstalación completa está pendiente de un entorno aislado o de una ventana autorizada que no afecte el `node_modules` compartido.
- Los avisos de ubicación documental bajo `.playwright-mcp/` permanecen como deuda no bloqueante fuera de este cambio.
- No hay evidencia nueva de backup/restore global o tenant, ensayo integral de rollback, dominio/TLS o aprobación de ventana.

## 4. Gates separados

| Gate | Estado | Evidencia y condición restante |
| --- | --- | --- |
| G6 — aceptación de calidad | PENDIENTE / NO-GO | El lint final no tuvo errores, pero la aceptación integral exige ejecutar `pnpm install --frozen-lockfile --ignore-scripts --offline` en un entorno aislado, sin sustituir el `node_modules` compartido, y cerrar la escalación de seguridad. `pnpm test --force` quedó inconcluso por timeout antes del resultado global. Persisten además 60 warnings ESLint heredados fuera de alcance. Requiere revisión AI-SR-QA y AI-SEC-ENG. |
| G6.5 — merge readiness | PENDIENTE / NO-GO | Requiere G6 y una corrida verde en Linux de `production-images` y `execution-orders-e2e`, identificada por SHA y artefacto sanitizado. No existe tal evidencia en esta fase. |
| G7 — autorización de producción | NO-GO / DIFERIDO | No hay recomendación AI-EM-ARCH ni aprobación CTO. Siguen pendientes dominio/TLS, rollback por componente y restores global/tenant verificados. |

## 5. Escalación obligatoria

### [ESCALACION AL CTO]

1. Revocar la credencial que pudo quedar en el payload de login retirado del árbol de trabajo; esta fase no afirma que la revocación haya ocurrido.
2. Evaluar los artefactos, cachés y registros Docker ya publicados que pudieran haber incorporado el payload o datos locales; no se inspeccionan ni purgan desde este repositorio.
3. Decidir la higiene de historia Git y, si procede, su ejecución autorizada. No se reescribió historia en esta fase.

## 6. Decisión de salida

La remediación queda disponible para revisión cruzada. No autoriza G6, G6.5 ni G7 hasta que se complete la evidencia y las autoridades correspondientes emitan sus decisiones.
