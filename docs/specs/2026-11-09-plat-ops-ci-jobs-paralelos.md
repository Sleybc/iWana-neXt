# SPEC — CI en jobs paralelos: `static`, `unit` en matriz e `integration` (ADR-107, Ola 3)

**Versión:** 1.0
**Estado:** Aprobado. El usuario adelanta la Ola 3 el 2026-11-09 (ADR-107 §6 v1.1)
**Fecha:** 2026-11-09
**Emitido por:** AI-EM-ARCH · **Ejecuta:** `plat-ops`
**Relacionado:** [ADR-107](../adrs/ADR-107-Publicacion-por-Lotes-y-G6.5-Asincrono.md) · [INFORME-TRANSVERSAL-TIEMPOS-ENTREGA-v1.0](../informes/INFORME-TRANSVERSAL-TIEMPOS-ENTREGA-v1.0.md) §3 · [spec de integración API](2026-11-09-plat-ops-ci-integracion-api-tiempo.md) · [plan](../plans/2026-11-08-publicacion-por-lotes.md) §2

---

## 1. Problema

El job «Lint + Typecheck + Build + Unit tests» de `.github/workflows/ci.yml` es la ruta crítica de cada tren con código: 20–27 min. Medido en la corrida 42678231774 (`965bf5e5`):

| Paso | Duración |
| --- | --- |
| Setup, install, tooling y sync | ~1:00 |
| Lint / typecheck / build | 0:45 / 0:50 / 1:16 |
| Unit tests + cobertura, en serie (`--concurrency=1`) | **12:26**: api 5:35 (489 suites), portal 5:02 (347), el resto 1:50 |
| Migraciones e integración 089 | ~1:10 |
| Integración API | **8:10**. `d09397ee` la reparte en 4 workers, aún sin medir en CI |
| Integración worker y SEC-04 | ~0:15 |

La serialización (R-14) evitó la contención en **un** runner de 2 cores. Con un runner por paquete deja de hacer falta. El repo es público, así que los runners estándar no consumen minutos facturables. La rama `main` no tiene protección con checks requeridos, y por eso los nombres de los jobs pueden cambiar.

## 2. Diseño

Todos los jobs nuevos llevan `needs: changes` e `if: needs.changes.outputs.docs_only != 'true'` (D7). **Ningún paso, umbral ni gate cambia**: solo se reparten entre jobs.

| Job | Contenido (pasos actuales, sin cambios) | Estimado |
| --- | --- | --- |
| `static` | Install, `audit --prod --audit-level critical`, `test:tooling`, `sync:agents:check`, `sync:skills:check`, `sync:mcp:check`, lint, typecheck y build | 4–5 min |
| `unit` (matriz `api`, `portal`, `resto`) | Install, el build mínimo que necesite la pata, y `turbo run test --filter=<paquetes> --only -- --coverage --coverageReporters=text-summary --coverageReporters=json-summary`. Después, la verificación de cobertura **solo para su app**: `0 cached` y denominador > 0. La pata `resto` cubre web, worker, db, shared, ui y storage, y verifica la cobertura de `web` | 6–7 min la más lenta |
| `integration` | Servicio Postgres, cliente psql, least-privilege, migraciones public y tenant, 089, integración API con `IWANA_IT_WORKERS` y los clones de `d09397ee`, worker R0.3, re-aplicación de least-privilege y SEC-04 | 5–9 min |

Restricciones que `plat-ops` debe respetar:
1. **Nota «LOAD-BEARING» de `ci.yml`:** `@iwana/db` no tiene `moduleNameMapper` y necesita `@iwana/shared` construido. La pata que corre `@iwana/db` construye antes `@iwana/shared`. Las migraciones del job `integration` corren contra `dist`, así que ese job construye `@iwana/db` y sus dependencias.
2. **Verificación de cobertura:** el paso que hoy verifica las tres apps se divide por pata, sin bajar ninguna exigencia. Cada pata publica su fila en `GITHUB_STEP_SUMMARY`.
3. **`MFA_ENCRYPTION_KEY` efímera:** se genera en cada job que la necesite (unit y integration), nunca se comparte por artefacto.
4. **`R-14` en `package.json`:** `test` y `test:coverage` conservan `--concurrency=1` para uso local. En CI, cada pata filtra un paquete o un grupo, así que no compite con otra.
5. **El resto del workflow no cambia:** los jobs `production-images`, `execution-orders-e2e`, `e2e-portal`, `changes` y `adr-citations` se quedan tal como están.
6. **`timeout-minutes`:** 15 para `static`, 15 para cada pata de `unit` y 20 para `integration`, recalibrados tras el primer verde con margen de 1,5× sobre lo medido. El paso de integración API conserva su propio `timeout-minutes` según la spec de integración §6.

## 3. Criterios de hecho

1. `pnpm test:tooling` en verde y YAML válido. `scripts/dev.test.mjs` lee `ci.yml`: si alguna aserción depende del nombre o de la estructura del job, se ajusta con el motivo citado.
2. **Primer tren con código**, que es síncrono por ser una ola de CI (D3):
   - todos los jobs en verde;
   - **conteos de suites y tests por paquete iguales** a los de la corrida 42678231774 (carraca de `AGENTS.md`): api 489, portal 347, y los del resto según el log de esa corrida;
   - integración API con el mismo número de specs y omisiones declaradas (B5 17/17 y K2 5/5).
3. La cobertura se evalúa en las tres apps, con denominador > 0 y `0 cached` en cada pata.
4. Ruta crítica medida con `gh run view --json jobs`. Meta: ≤ 16 min, con el E2E R4.1 como job más largo.
5. Un push solo de documentación sigue omitiendo todos los jobs pesados.

## 4. Precondiciones

| # | Precondición |
| --- | --- |
| P1 | La sesión dueña de `d09397ee` clasificó el rojo de las pruebas unitarias de la corrida 42704957642 y cerró el §10.3 de la spec de integración API |
| P2 | La última corrida de `main` está en verde (D5) |
| P3 | `git status --porcelain .github/workflows/ci.yml package.json` vacío al empezar |

## 5. Fuera de alcance

- Acortar el E2E R4.1 (~14,5 min), que pasa a ser la ruta crítica. Su paso de aprovisionamiento construye la imagen del worker en cada corrida. Va en una spec aparte, si la medición lo justifica.
- La caché remota de Turbo: sigue descartada por el gate `0 cached`.
- Runners de más de 2 cores, que son de pago.
