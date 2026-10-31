# PROMPT — Transversal · Vulnerabilidades críticas en dependencias de desarrollo · v1.0

**Plan:** `docs/plans/2026-10-30-transversal-deps-criticas-dev.md` v1.0 · **Origen:** V3 de MOD05 Fase 09 (`docs/informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md` §13–§14)
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Base:** `main`. Se trabaja en `main`, sin ramas. El árbol tiene cambios sin commitear de la Fase 09 de MOD05 y de otros frentes: no los toques, no los incluyas y **no uses `git stash`**.

---

## Regla común

- Se corrigen las 2 críticas (`handlebars` 4.7.9 por `ts-jest`; GHSA-8r5x-fm3f-whwj y GHSA-p8wg-vrv2-v86f; corregida en 4.7.10) y dos altas de producción: `body-parser` < 2.4.0 (GHSA-27r3-jxmh-p828) y `multer` < 2.5.0 (GHSA-q7qp-rjg7-q26m).
- Archivos permitidos: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, la línea de `multer` en `apps/api/package.json` y el informe de este frente. Nada de código.
- `zod` queda fuera: no tiene parche en 3.x y migrar a Zod 4 pide ADR (plan §1). Se reporta, no se corrige.

---

## §D1 — plat-ops

1. En `pnpm-workspace.yaml`, bajo `overrides:`, añade `handlebars@<4.7.10: '>=4.7.10'` en orden alfabético, con el mismo formato que las entradas existentes.
2. `pnpm install`. Revisa `git diff --stat pnpm-lock.yaml` y `git diff pnpm-lock.yaml`: solo debe cambiar `handlebars` (y sus dependencias propias, si 4.7.10 las cambia). Si cambia otro paquete, para y reporta `[BLOQUEO]` con la lista.
3. Evidencia:
   - `pnpm why handlebars` muestra una sola versión, ≥ 4.7.10.
   - `pnpm audit --audit-level critical` da 0 críticas.
   - `pnpm audit --prod --audit-level critical` sigue en 0.
   - Reporta los totales de `pnpm audit` por severidad, antes (2/12/12/4) y después.
4. Informe `docs/informes/INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md`, con la ruta verificada libre antes de escribir: diagnóstico, cambio, evidencia con comandos y cifras, y la tabla de altas pendientes del plan §1 con su alcance (producción o desarrollo).

No corras suites como evidencia final (es de V1). No commitees.

## §D2 — plat-ops (a continuación de D1, en la misma sesión)

1. Antes de editar, confirma que `apps/api/package.json` no tiene cambios sin commitear (`git status --porcelain apps/api/package.json`). Si los tiene, `[BLOQUEO]`.
2. En `pnpm-workspace.yaml`, sustituye estos dos overrides, sin tocar los demás de `multer`:
   - `body-parser@>=2.0.0 <2.3.0: '>=2.3.0'` → `body-parser@>=2.0.0 <2.4.0: '>=2.4.0 <3.0.0'`
   - `multer@<2.4.0: '>=2.4.0 <3.0.0'` → `multer@<2.5.0: '>=2.5.0 <3.0.0'`
3. En `apps/api/package.json`, `multer` pasa de `^2.4.0` a `^2.5.0`.
4. `pnpm install`. En el diff del lockfile solo deben cambiar `handlebars`, `body-parser` y `multer`, más sus dependencias propias si estas versiones las cambian. Cualquier otro cambio es `[BLOQUEO]`. *Precisión de AI-EM-ARCH, 2026-10-30:* no cuenta como cambio ajeno la deduplicación de una dependencia transitiva del árbol de esos paquetes hacia una versión que ya estaba en el lockfile, dentro de su rango declarado. Fue el caso de `hasown` 2.0.2 → 2.0.4; ver el informe.
5. Evidencia: `pnpm why body-parser` y `pnpm why multer --filter @iwana/api` con una sola versión cada uno (≥ 2.4.0 y ≥ 2.5.0); `pnpm audit --prod` sin advisories de esos dos paquetes; totales de `pnpm audit --prod` antes (0 críticas, 3 altas) y después.
6. Lee las notas de versión de `body-parser` 2.4.0 y `multer` 2.5.0 y anota en el informe todo cambio de comportamiento: límites, mensajes de error, campos o encabezados.

No subas `@nestjs/platform-express` ni `express`. No commitees.

## §V1 — gate-verifier

Después de D1 y D2. Sin caché de turbo y con conteo real de suites y tests por paquete:

- jest completo de `@iwana/api`, `@iwana/db`, `@iwana/shared`, `@iwana/portal`, `@iwana/web` y `@iwana/worker` (todos usan `ts-jest`);
- lint y typecheck de esos paquetes;
- las pruebas de subida de archivos por nombre: `tenant.controller.http.spec.ts`, `execution-orders.controller.http.spec.ts` y `contracts.service.postgres.integration.spec.ts` (Postgres real, > 0 tests);
- E2E `portal-branding-upload.spec.ts` y `portal-commercial-ui-evidence.spec.ts` contra API y Portal reales, nunca con `tenant_iwana`;
- `pnpm audit --audit-level critical` y `pnpm audit --prod --audit-level critical`, ambos en 0 críticas; `pnpm audit --prod` sin `body-parser` ni `multer`.

Compara con las cifras de V3 de la Fase 09 (shared 28/268, db 77/423, API 439/5.852, Portal 333/3.359). Las diferencias deben explicarse por pruebas de la Fase 09 añadidas después, no por fallos. Entrega comandos y cifras; no corrijas código.

---

## Reglas

- Nadie commitea salvo AI-EM-ARCH al cierre, tras V1 en verde, y en un commit separado del de la Fase 09.
- Si el override rompe una suite, no lo «arregles» tocando pruebas: `[BLOQUEO]` a AI-EM-ARCH.
