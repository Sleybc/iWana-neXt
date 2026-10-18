# PLAT · nodemailer 10 · Informe de cierre (v1.0)

**Fecha:** 2026-10-18 · **Base:** `main` en `a6ca8e3f` (PLAT-DEPS-CRITICAS) · **Plan:** `docs/plans/2026-10-18-plat-deps-criticas.md` (§9 filas 1, 2 y 10; §11 punto 5) · **Ejecución:** sesión PLAT-DEPS-NODEMAILER, sobre `main`, sin ramas ni worktrees.

## 1. Resumen

- `nodemailer` pasa de `^9.1.1` (instalado 9.1.1) a `^10.0.9`, que resuelve a 10.1.6. Cierra las altas GHSA-v53p-9fqp-m79j y GHSA-prgh-xp8r-p3m5 y las moderadas GHSA-6vj9-mwq6-2f5v, GHSA-8vvx-rff5-p5rq y GHSA-g57g.
- `pnpm audit --prod --audit-level high` y `--audit-level critical` salen con código 0. Quedan 4 moderadas y 1 baja, todas del lote siguiente (§7).
- `MailerService.sendMail` valida el destinatario antes de enviar. `AuthService` añade `.catch` a sus tres envíos sin `await` (informe PLAT §8, O-1).
- Se retiran cinco overrides muertos de nodemailer en `pnpm-workspace.yaml` y la devDependency `@types/nodemailer`.
- Commit local en `main`. No hay push: requiere confirmación explícita del CTO (D3-A).

## 2. Seguridad: antes y después

| Métrica | Base (HEAD `a6ca8e3f`, informe PLAT §3) | Final |
| --- | --- | --- |
| Críticas | 0 | 0 |
| Altas | 2 (v53p, prgh) | 0 |
| Moderadas | 7 (6vj9, 8vvx, g57g, js-yaml r3ph, csv-parse 8cw4, qs x5fp, qs 4mjr) | 4 (js-yaml r3ph, csv-parse 8cw4, qs x5fp, qs 4mjr) |
| Bajas | 1 (@hapi/joi 6w3j) | 1 (@hapi/joi 6w3j) |
| Total | 10 | 5 |

Las cinco restantes son el lote siguiente (§7, punto 2).

## 3. Cambios

| Archivo | Cambio |
| --- | --- |
| `apps/api/package.json` | `nodemailer` `^9.1.1` → `^10.0.9`. Se retira la devDependency `@types/nodemailer`. |
| `pnpm-workspace.yaml` | Se retiran 5 overrides `nodemailer@…`. Con 10.x no coincidían con ninguna versión del árbol. |
| `pnpm-lock.yaml` | Regenerado con `pnpm install` y formateado con Prettier, como el lock de HEAD. Diff de 9 hunks: nodemailer 10.1.6, retirada de `@types/nodemailer` y de los overrides. |
| `apps/api/src/modules/mailer/mailer.service.ts` | Validación de `to` en `sendMail`, en ambos modos (detalle en §4). |
| `apps/api/src/modules/mailer/mailer.service.spec.ts` | 13 tests nuevos: aceptación, rechazos, listas, tope de longitud y ausencia de PII en el error. |
| `apps/api/src/modules/mailer/interfaces/mail-options.interface.ts` | Comentario de `to`: uno o varios correos separados por comas. |
| `apps/api/src/modules/auth/auth.service.ts` | Helper `fireAndForget` (mismo patrón que `UsersService`) en los tres `sendMail` sin `await`: recuperación, confirmación de cambio de contraseña y verificación de email. |
| `apps/api/src/modules/auth/auth.service.spec.ts` | 1 test nuevo: un rechazo de SMTP no se propaga y el log no incluye el destinatario. |

## 4. Decisiones

1. **Varios destinatarios.** El informe PLAT (§9, fila 1) describe `to` como un solo correo. Pero `privacy-due-alerts.processor.ts` envía a todos los titulares en un solo `to` separado por comas. Validar el campo como un único correo rompería esas alertas. Por eso se valida cada correo de la lista: texto, no vacío, ≤254 caracteres y formato de `@IsEmail`. El campo completo tiene un tope de 4096 caracteres. **Límite a confirmar por sr-backend.**
2. **Efecto de la lista.** Un solo correo inválido en la lista hace fallar la alerta completa. Antes, el SMTP podía aceptar a los destinatarios válidos. Los titulares tienen correo validado al crearse, así que el caso es poco probable. Filtrar y registrar los inválidos sería un cambio en el procesador: queda para sr-backend.
3. **Modo dev.** La validación se aplica en los dos modos, para que el contrato sea el mismo. Un destinatario inválido falla también en desarrollo.
4. **Validador.** `isEmail` de `class-validator`, el mismo que usan los DTO. Un correo que el DTO acepta no se rechaza en el servicio.
5. **PII en errores y logs.** El error de destinatario no incluye el valor. Los logs de fallo usan `summarizeErrorForLog`, que solo registra clase, sqlstate, código, constraint y tabla.
6. **`@types/nodemailer`.** nodemailer 10 trae sus propios tipos. Sin la devDependency, `typecheck` pasa.
7. **Overrides.** `pnpm why nodemailer -r` muestra una sola versión (10.1.6). Los overrides retirados no cambiaban nada.
8. **Helper duplicado.** `fireAndForget` se copia en `AuthService` en lugar de extraerse a un módulo común. Unificarlo queda como deuda menor.

## 5. Gates

| Gate | Comando | Resultado |
| --- | --- | --- |
| 1 · Sin críticas | `pnpm audit --prod --audit-level critical` | Código 0 |
| 2 · Sin altas | `pnpm audit --prod --audit-level high` | Código 0 |
| 3 · Lockfile | `pnpm install --frozen-lockfile` | Código 0 |
| 4 · Lint | `pnpm exec turbo run lint --filter=@iwana/api --force --ui=stream` | Código 0; `Cached: 0 cached, 4 total`; 0 errores; 7 avisos ya existentes en archivos no tocados |
| 5 · Typecheck | `pnpm exec turbo run typecheck --filter=@iwana/api --force --ui=stream` | Código 0; `Cached: 0 cached, 4 total` |
| 6 · Build | `pnpm exec turbo run build --filter=@iwana/api --force --ui=stream` | Código 0; `Cached: 0 cached, 4 total` |
| 7 · Tests con cobertura | `pnpm exec turbo run test --filter=@iwana/api --force --ui=stream --concurrency=1 --only -- --coverage …`, con `MFA_ENCRYPTION_KEY` efímera | Código 0; `Cached: 0 cached, 1 total`; `Test Suites: 4 skipped, 394 passed, 394 of 398 total`; `Tests: 15 skipped, 5321 passed, 5336 total` |
| 8 · Sincronía | `pnpm sync:agents:check`, `pnpm sync:skills:check`, `pnpm sync:mcp:check`, `pnpm test:tooling` | Código 0 en los cuatro |
| 9 · Documental | `pnpm audit:adr-citations`, `pnpm audit:doc-locations` | `audit:doc-locations`: código 0. `audit:adr-citations`: su primera corrida dio 1 bloqueante en este informe (ADR-096 citado sin «(propuesto)»); corregido, código 0 en la repetición |
| 10 · Arranque real de la API | — | No ejecutado (ver §6) |
| 11 · Portal y web | — | No aplica: no hay cambios fuera de `apps/api` y del manifiesto del workspace |

**Cobertura de `@iwana/api`** (final frente a línea base): statements 62.95 % (25128/39915; base 25116/39903); branches 52.84 % (8644/16357; base 8637/16350); functions 60.69 % (3465/5709; base 3461/5705); lines 71.80 % (23741/33063; base 23729/33051). Los umbrales se cumplen y la cobertura no baja.

**Regresiones (gate 12):** todos los tests de la línea base pasan. Frente a la línea base (5307 pasados), el conteo sube en 14 tests nuevos: 13 en `mailer` y 1 en `auth`.

## 6. Revisión de sr-backend (autorrevisión)

- **Contrato de la librería.** `createTransport` y `Transporter` coinciden con los tipos de 10.1.6. El typecheck pasa sin `@types/nodemailer`.
- **Carga en runtime.** En Node 24.18.0, `require('nodemailer')` resuelve a 10.1.6 (build CJS). Un smoke test con `jsonTransport` devuelve el envelope y el asunto correctos.
- **Cobertura de los unit tests.** Los specs de `MailerService` mockean `nodemailer`. El smoke test es la única verificación del paquete real. Recomendado: una prueba de integración contra un SMTP local en una ola siguiente.
- **Arranque real de la API (gate 10).** No ejecutado. El bloque no cambia providers, variables de entorno ni rutas, y la carga del módulo ya se verificó.
- **Alcance de la revisión.** La hizo la sesión que ejecuta el bloque. No se lanzó un revisor independiente porque no se pidió.

## 7. Pendientes

1. **Push.** Requiere confirmación explícita del CTO (D3-A).
2. **Lote siguiente (PLAT §11, punto 5).** `qs@<6.16.0` y `js-yaml@<5.4.1` como overrides; `csv-parse` ≥7.0.2 (major); retirar `@hapi/joi` (sin uso en `apps/api/src`); limitar el detalle de `GET /api/v1/health` (O-2).
3. **O-3 (fe-platform).** Verificar el valor por defecto de `partialPrefetching` antes de reevaluar D4 de ADR-096 (propuesto).
4. **sr-backend.** Confirmar el tope de 4096 caracteres de `to` y el comportamiento de una lista con un correo inválido (decisiones 1 y 2).
