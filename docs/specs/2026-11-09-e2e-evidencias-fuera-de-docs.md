# SPEC — Las capturas del E2E no escriben en `docs/` salvo que se pidan

**Versión:** 1.0
**Estado:** Aprobado por el usuario el 2026-11-09 («Sí, prepárala»)
**Fecha:** 2026-11-09
**Emitido por:** AI-EM-ARCH · **Ejecuta:** `sr-qa`
**Origen:** [INFORME-TRANSVERSAL-TIEMPOS-ENTREGA-v1.0](../informes/INFORME-TRANSVERSAL-TIEMPOS-ENTREGA-v1.0.md) §7 P5 · ADR-107 D6 (árbol limpio)

---

## 1. Problema

Once specs E2E guardan sus capturas en carpetas versionadas de `docs/`. Cada corrida local las reescribe y deja el árbol sucio:

- De las 38 rutas de `docs/` con cambios al 2026-11-09, **28 son PNG**: 25 modificadas y 3 sin seguimiento.
- Ese ruido se mezcla con el trabajo de otras sesiones. Impide el checkpoint ligero (casos A y B de la skill `iwana-checkpoint-commit`) y obliga a revisar a mano qué PNG son evidencia y cuáles regeneración.

Una sola spec ya lo resuelve: `portal-operations-consola-ot-r3.spec.ts:10-14` solo escribe en `docs/quality/mod11-ola2b/` con `R3_EVIDENCIA=1`. Esta spec generaliza ese patrón.

| Spec | Carpeta destino | ¿La citan documentos? |
| --- | --- | --- |
| `portal-commercial-ui-evidence.spec.ts:35` | `docs/informes/evidence/portal-commercial-ui-2026-07-11/` | 8 |
| `portal-crm-subscribers-pagination.spec.ts:299` | `docs/informes/evidence/adr065-ola4-subscribers/` | 3 |
| `portal-dashboard-empresa.spec.ts:25` | `docs/informes/evidencias/portal-dashboard-recomposicion/` | 17 |
| `portal-network-interfaces-a11y.spec.ts:29` | `docs/quality/evidence-mod13-o3-q/` | 0 |
| `portal-operations-consola-ot-ola1.spec.ts:53` | `docs/quality/evidencia-OTE-20260828-001.png` | 4 |
| `portal-operations-consola-ot-r3.spec.ts:13` | `docs/quality/mod11-ola2b/` (ya con bandera) | 8 |
| `portal-shell-touch-a11y.spec.ts:26` | `docs/quality/evidence-portal-shell-touch/` | 3 |
| `web-audit-logs-historial.spec.ts:10` | `docs/quality/evidence-web-audit-logs/` | 2 |
| `web-centro-control-portada.spec.ts:9` | `docs/quality/evidence-web-centro-control-portada/` | 2 |
| `web-empresas-directorio.spec.ts:10` | `docs/quality/evidence-web-empresas-directorio/` | 2 |
| `web-shell-sidebar-touch-a11y.spec.ts:11` | `docs/quality/evidence-web-shell-sidebar-touch/` | 3 |

Además hay 3 PNG sin seguimiento en `docs/informes/evidence/mod05-plan-change-2026-10-30/`, con nombres de salida de Playwright (`…-google-chrome-local`). Son una corrida local con `--output` apuntando a `docs/`, y ninguna spec los genera.

## 2. Decisión

1. **Helper único** `e2e/tests/helpers/evidence.ts` (los helpers del E2E viven en esa carpeta):
   - `const EVIDENCIA = process.env.E2E_EVIDENCIA === '1'`.
   - `evidenceDir(docsRelativeDir: string): string` devuelve la ruta en `docs/` si `EVIDENCIA` es verdadero. Si no, devuelve `test-results/evidencia/<docsRelativeDir>`, que ya ignora `.gitignore:65`. Crea la carpeta si no existe.
   - `evidencePath(docsRelativeDir, file)`, para los casos de un solo archivo, como `evidencia-OTE-20260828-001.png`.
2. **Las 11 specs usan el helper.** Las capturas **se siguen tomando** en todas las corridas, para que el paso de la prueba no cambie, pero solo llegan a `docs/` con `E2E_EVIDENCIA=1`. `R3_EVIDENCIA` se sustituye por `E2E_EVIDENCIA` y el comentario de `portal-operations-consola-ot-r3.spec.ts:10` se actualiza.
3. **Ninguna aserción cambia.** Los `existsSync`/`mkdirSync` de `portal-commercial-ui-evidence.spec.ts:353,386` pasan a trabajar sobre la ruta que devuelve el helper.
4. **Guarda contra regresiones:** `scripts/e2e-evidence-guard.test.mjs` se añade a `test:tooling` (`package.json:27`). Falla si un archivo de `e2e/tests/**/*.ts`, salvo `helpers/evidence.ts`, contiene una ruta literal a `docs/` usada como destino de escritura (`screenshot`, `writeFile`, `mkdir`). Lleva un caso que pasa y otro que bloquea, como el resto de `test:tooling`.
5. **Versionar evidencia nueva** es un acto deliberado: se corre con `E2E_EVIDENCIA=1`, se revisa y se commitean las rutas explícitas en el commit de la ola que la aprueba (ADR-107 D1).
6. **CI no cambia.** No define `E2E_EVIDENCIA`, así que sus capturas van a `test-results/`, que es efímero.

## 3. Estado actual del árbol (no se descarta nada)

El ejecutor **no** restaura, borra ni mueve los 28 PNG del árbol (skill de checkpoint, regla 1). Los lista con su estado y deja la decisión al usuario. La recomendación es:

- Los 25 modificados son regeneraciones de evidencia ya aprobada: restaurarlos a `HEAD` con orden expresa del usuario (`git restore -- <ruta>`).
- Los 3 sin seguimiento de `mod05-plan-change-2026-10-30/` no los cita ningún documento como archivo: moverlos fuera del repo con la misma orden.

## 4. Criterios de hecho

1. `pnpm test:tooling` en verde, con la guarda nueva y su conteo.
2. `git grep -nE "['\"\`]docs/" -- 'e2e/tests/**/*.ts'` solo muestra el helper o rutas que no son destino de escritura, con su motivo.
3. Corrida local de una spec web (`web-audit-logs-historial`) y una del portal (`portal-shell-touch-a11y`) contra los servidores de desarrollo **que ya estén arriba**:
   - sin bandera, `git status --porcelain -- docs` no cambia y las capturas aparecen en `test-results/evidencia/`;
   - con `E2E_EVIDENCIA=1`, se reescriben en `docs/`.

   En ambos casos, pruebas con conteo real. Al terminar, el ejecutor deja esos PNG como estaban según §3.
4. Prettier de las rutas tocadas.

## 5. Fuera de alcance

- Las instantáneas de `toHaveScreenshot` (`*-snapshots/`). Son referencias de comparación, no evidencia, y viven junto a su spec.
- Los `.log` de `e2e/`, que ya ignora `.gitignore:39`.
- Mover a otro almacenamiento la evidencia ya versionada (227 PNG, 66 MB en `docs/`).
