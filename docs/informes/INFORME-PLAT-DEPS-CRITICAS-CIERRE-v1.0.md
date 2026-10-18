# PLAT · Dependencias críticas · Informe de cierre (v1.0)

**Fecha:** 2026-10-18
**Estado:** cierre técnico completo; pendiente del commit y del push (§10 y §11)
**Plan:** `docs/plans/2026-10-18-plat-deps-criticas.md` (v1.0; §1 y §3.2 con la decisión final y la lista de overrides aplicada)
**Encargo:** `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-v1.0.md` · **Launcher:** `docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-LAUNCH-v1.0.md`
**ADR-096 (propuesto):** `docs/adrs/ADR-096-Configuracion-Next-16-4-Partial-Prefetching-y-Agent-Rules.md`; pendiente de aprobación del CTO
**Base:** `main` en `d9018071`. El árbol tenía WIP de MOD05 sin commitear, que no entra en este cierre.
**Autor:** AI-EM-ARCH, padre de consolidación. Agentes: plat-ops (B2, B2c, B3), fe-platform (B1b, B4), sec-eng (B1, B6), gate-verifier (B0, B5) y docs-governance (auditoría documental previa al commit).

## 1. Resumen

La fase deja `pnpm audit --prod --audit-level critical` en 0 críticas, que era el objetivo del plan. Next.js sube a 16.4.2 en portal y web, y el paso de auditoría crítica queda en el job `ci`.

Quedan dos altas, ambas de nodemailer 9.1.1. Son residual de D2-A, confirmada por el CTO el 2026-10-18, y tienen condición de cierre (§9).

Hay una excepción de calidad: la validación instant de Next 16.4 produce errores en el log de dev de portal y web. No afecta al build ni a las respuestas HTTP. Está registrada como deuda con dueño fe-platform (excepción C, aprobada por el CTO).

## 2. Estado de los gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G1 · Decisiones del CTO | Cumplido (2026-10-18): D1-A, D2-A, D3-A, D4-A; excepción C | Plan §1 |
| G3 · Factibilidad | Cumplido: B1 (GO con ajustes) y B1b (viable con ajustes) | §6 y §7.5 |
| G4 · Encargo y launcher | Cumplido | Encargo, launcher y plan |
| G5 · Gates técnicos | Cumplido en 1–10 y 12. Gate 11 con excepción C. Gate 15 cumplido | §7 |
| G6 · Calidad (dictamen de seguridad) | GO con ajustes (B6): ajustes 1 y 2 antes del commit | §8 |
| G6.5 · Merge readiness | Pendiente: requiere push (D3-A) | §10 y §11 |
| G7 · Producción | Fuera de alcance (ADR-095) | — |

## 3. Resultado de seguridad

| Métrica | Línea base (HEAD, 2026-10-18) | Final (lock de la fase) |
| --- | --- | --- |
| Críticas | 4 | 0 |
| Altas | 17 | 2 (nodemailer, residual D2-A) |
| Moderadas | 16 | 7 |
| Bajas | 5 | 1 |
| Advisorías totales | 42 | 10 |
| Dependencias de producción | 593 | 589 |

Las altas y moderadas residuales, con su condición de cierre, están en §4 y §9.

## 4. Triaje final

### 4.1 Altas (17 del plan y una nueva)

| # | GHSA | Paquete | Estado | Mecanismo |
| --- | --- | --- | --- | --- |
| 1 | GHSA-cjq9-62q9-8jv4 | next | Cerrada | next 16.4.2 |
| 2 | GHSA-2v37-7h3g-55p8 | nanoid | Cerrada | nanoid 3.3.20; override con tope `<4.0.0` |
| 3 | GHSA-68fv-2mgg-jv7q | source-map-js | Cerrada | source-map-js 1.2.2 (override) |
| 4 | GHSA-c83g-rgw3-j3cx | browserslist | Cerrada | browserslist 4.28.9 (override con tope `<4.29.0`) |
| 5 | GHSA-73wf-gq98-2v4g | browserslist | Cerrada | Igual que 4 |
| 6 | GHSA-qhr7-859c-m2p7 | brace-expansion | Cerrada | brace-expansion 5.0.12 (override `>=4.0.0 <5.0.12`) |
| 7 | GHSA-6j4f-fj2g-mc7p | brace-expansion | Cerrada | Igual que 6 |
| 8 | GHSA-5p2g-fcmc-qvqq | image-size | Cerrada | image-size 2.0.4 |
| 9 | GHSA-w3rx-r6r6-pgpr | image-size | Cerrada | Igual que 8 |
| 10 | GHSA-6h2x-m376-mqjq | joi | Cerrada | joi 18.3.0 |
| 11 | GHSA-wc9g-mqfw-jrwm | multer | Cerrada | multer 2.4.0 (override transitivo `<2.4.0`, §5.2) |
| 12 | GHSA-qfvm-cv95-jqjf | multer | Cerrada | Igual que 11 |
| 13 | GHSA-535w-7cp7-47q4 | multer | Cerrada | Igual que 11 |
| 14 | GHSA-2x7j-588g-ccc2 | nodemailer | Cerrada | nodemailer 9.1.1 |
| 15 | GHSA-v53p-9fqp-m79j | nodemailer | **Residual (D2-A)** | Corrige en 10.0.6. Ver §9, fila 1 |
| 16 | GHSA-rgj7-g3m4-5g8c | sharp | Cerrada | sharp 0.35.5 (lo pide next 16.4.x) |
| 17 | GHSA-wq5f-xc86-pv6w | sharp | Cerrada | Igual que 16 |
| Nueva | GHSA-prgh-xp8r-p3m5 | nodemailer | **Residual (D2-A)** | Aparece con 9.1.1 (rango 9.1.0 a 10.0.4); corrige en 10.0.5 |

Resultado: 16 de las 17 altas del triaje están cerradas. La 15 queda residual por D2-A. Aparece además una alta nueva, GHSA-prgh-xp8r-p3m5, que no estaba en el triaje y pertenece a la misma rama de nodemailer. D2-A sustituye 2x7j (cerrada en la fila 14) por prgh: el saldo de altas de nodemailer no baja respecto de HEAD, pero las moderadas pasan de cinco a tres.

### 4.2 Moderadas (16 del plan, más 1 nueva)
- **Cerradas (10):** next 4jqv, f87g y mcj8; joi wr44; multer 3pph; nodemailer 8m3c, wmmp y cc9r; brace-expansion q2hr; baseline-browser-mapping w5vr.
- **Residuales (7):** nodemailer 6vj9 y 8vvx (corrigen en 10.0.2) y g57g (nueva con 9.1.1; corrige en 10.0.9); js-yaml r3ph (vía `@nestjs/swagger`); csv-parse 8cw4 (portal; corrige en la major 7); qs x5fp y 4mjr (vía express).

### 4.3 Bajas (5 del plan)
- **Cerradas (4):** next 39w2; joi 6w3j (en el paquete `joi`) y gg4h; multer qvfw.
- **Residual (1):** `@hapi/joi` 6w3j, sin parche publicado.

## 5. Cambios aplicados

### 5.1 Manifiestos

| Archivo | Cambio | Versión resuelta |
| --- | --- | --- |
| `apps/portal/package.json` | `next` `^16.2.11` → `^16.4.2` | 16.4.2 |
| `apps/web/package.json` | `next` `^16.2.11` → `^16.4.2` | 16.4.2 |
| `apps/api/package.json` | `image-size` `^2.0.2` → `^2.0.3` | 2.0.4 |
| `apps/api/package.json` | `joi` `^18.2.1` → `^18.2.9` | 18.3.0 |
| `apps/api/package.json` | `multer` `^2.2.0` → `^2.4.0` | 2.4.0 |
| `apps/api/package.json` | `nodemailer` `^9.0.1` → `^9.1.1` | 9.1.1 |

### 5.2 Overrides de pnpm (`pnpm-workspace.yaml`)

Lista final aplicada:
- `proxy-addr@<2.0.8: '>=2.0.8'`
- `brace-expansion@>=4.0.0 <5.0.12: '>=5.0.12'`
- `browserslist@<=4.28.6: '>=4.28.7 <4.29.0'`
- `nanoid@<3.3.18: '>=3.3.18 <4.0.0'`
- `source-map-js@<1.2.2: '>=1.2.2'`
- `baseline-browser-mapping@<2.11.0: '>=2.11.0 <3.0.0'` (opcional, confirmado por B2)
- `multer@<2.4.0: '>=2.4.0 <3.0.0'` (no previsto en la tabla del plan)

Retirados por no tener efecto: `next@<16.4.2` y `sharp@<0.35.5`. Se conservan las líneas de HEAD de brace-expansion (1.x, 2.x y 3.x a 5.x), `sharp@<0.35.0`, `qs`, `js-yaml` y el resto de overrides.

### 5.3 CI
Job `ci`, después de `Install dependencies`: `pnpm audit --prod --audit-level critical`. Sin `continue-on-error`. El nombre del job y los pasos existentes no cambian.

### 5.4 Configuración de Next (D4-A)
- `apps/web/next.config.ts`: `partialPrefetching: false` y `agentRules: false` dentro de `nextConfig`. `cacheComponents: true`, CSP, cabeceras y rewrites sin cambios.
- `apps/portal/next.config.ts`: `cacheComponents` pasa a constante con la misma expresión (`IWANA_DISABLE_CACHE_COMPONENTS !== '1'`). `partialPrefetching: false` solo cuando `cacheComponents` está activo, porque la clave exige Cache Components. `agentRules: false`. CSP, cabeceras y rewrites sin cambios.
- Justificación y alternativas en ADR-096 (Propuesto).

## 6. Desviaciones respecto del plan

1. **Override transitivo de multer.** El plan solo subía la dependencia directa de `apps/api`. La copia 2.2.0 que trae `@nestjs/platform-express@11.1.16` no la alcanzaba. Se añade `multer@<2.4.0` (§5.2).
2. **Topes superiores** en nanoid (`<4.0.0`), browserslist (`<4.29.0`) y baseline-browser-mapping (`<3.0.0`). Sin tope, pnpm elegía 6.0.2, 4.29.3 y ramas mayores. El plan decía «solo ramas 3.x».
3. **Overrides retirados:** `next@<16.4.2` y `sharp@<0.35.5`. No cambiaban nada (plan §3.2).
4. **Altas de nodemailer.** El plan esperaba una (v53p). Con 9.1.1 aparece GHSA-prgh-xp8r-p3m5 y la moderada g57g. Con 9.0.3 (HEAD) había dos altas (2x7j y v53p) y cinco moderadas. Con 9.1.1 hay dos altas (v53p y prgh) y tres moderadas. El CTO confirmó D2-A con este dato el 2026-10-18.
5. **brace-expansion.** Las líneas 1.x y 2.x de HEAD no se tocaron. El cruce de minimatch 3 a brace-expansion 5.x ya existía en HEAD (5.0.9). Ahora resuelve 5.0.12, dentro de la misma major.
6. **Excepción de calidad en dev (C).** La validación instant de Next 16.4 produce errores en dev. Ver §7.4 y la fila 5 de §9.

### Dictamen B1 (sec-eng): ajustes y cierre

| # | Ajuste | Estado |
| --- | --- | --- |
| 1 | Override de brace-expansion desde `>=4.0.0` (no `>=3.0.0`) | Aplicado en el plan y en el workspace (§5.2) |
| 2 | Resultados esperados de `pnpm why` antes de cerrar B2 | Verificados en B2 (§7.1) |
| 3 | Matriz de proxy-addr tras instalar | Idéntica a la base 2.0.7 (§7.1) |
| 4 | Matriz de proxy-addr en B6, con el lock final | Idéntica (§8) |
| 5 | Plan §3.1 y R8: el riesgo de `req.ip` no aplica a la rama numérica | Corregido en el plan |
| 6 | Plan R2: el override de brace-expansion no cruza major frente a HEAD | Corregido en el plan |
| 7 | Plan §2.2: las filas 1 a 5, 16 y 17 también afectan a `apps/web` | Corregido en el plan |
| 8 | Plan R7 y §7: residual de D2-A con dos altas y tres moderadas | Corregido en el plan |
| 9 | Fuera de fase: comentarios de `main.ts` y la discrepancia de `trust proxy` en `INFORME-USUARIOS-AUDITORIA-BACKEND-v1.0.md` (línea 153) | Pendiente de registro, dueño sr-backend; no bloquea |

## 7. Verificación de gates técnicos

### 7.1 Auditoría y lockfile (B2, B2c y B5)
- `pnpm audit --prod --audit-level critical`: código 0 (B2 y B5), y de nuevo justo antes del commit, con 0 críticas.
- `pnpm audit --prod --audit-level high`: código 1, con dos altas de nodemailer. Es lo esperado con D2-A. El JSON de `pnpm audit --prod --json` sale también con código 1 por la misma razón.
- `pnpm install --frozen-lockfile`: código 0 (B2, B2c y B5). `pnpm-lock.yaml` con sha256 `eb6ba660f35ea2b5…fd7e`, sin cambios desde B2c.
- `pnpm why` (B2): proxy-addr 2.0.8 (única copia); nanoid 3.3.20; browserslist 4.28.9; baseline-browser-mapping 2.11.29; multer 2.4.0; sharp 0.35.5 (única copia); next 16.4.2 en portal y web; brace-expansion 5.0.12.
- Matriz de `req.ip` con proxy-addr 2.0.8 frente a 2.0.7 (`pa-matrix`): 9 de 9 casos idénticos (B2). B6 la repite con el lock final.

### 7.2 Lint, typecheck, build y tests (B5)

| Gate | Comando | Código | Líneas literales |
| --- | --- | --- | --- |
| 4 | `pnpm exec turbo run lint --force --ui=stream` | 0 | `Tasks: 8 successful, 8 total`; `Cached: 0 cached, 8 total` |
| 5 | `pnpm exec turbo run typecheck --force --ui=stream` | 0 | `Tasks: 8 successful, 8 total`; `Cached: 0 cached, 8 total` |
| 6 | `pnpm exec turbo run build --force --ui=stream` | 0 | `Tasks: 7 successful, 7 total`; `Cached: 0 cached, 7 total` |
| 7 | `turbo run test --force … -- --coverage …`, con clave MFA efímera | 0 | `Tasks: 7 successful, 7 total`; `Cached: 0 cached, 7 total` |

Líneas literales `Tests:` y `Test Suites:` de cada paquete en `b5-gate07-test.log`. Tests por paquete (B5, igual que B0): ui 34; shared 200; db 417; portal 3 121 (1 omitido); worker 171; api 5 307 (15 omitidos); web 229. Total: 9 479 passed, 0 fallidos y 16 omitidos.

Trampas descartadas: cero coincidencias de `cache hit`, `FULL TURBO`, `passWithNoTests`, `No tests found` y `Tests: 0 total`. Cada paquete muestra `cache bypass, force executing`.

Cobertura: umbrales cumplidos. api `serialized-asset-useful-life.util.ts` al 100 %; web 55.34 / 46.14 / 51.54 / 56.33 (mínimo 36 / 29 / 32 / 37); portal global 70.01 / 63.35 / 63.43 / 71.04 (mínimo 55 / 47 / 49 / 57).

### 7.3 Sincronía, documentos y API (B5)
- `pnpm sync:agents:check`: OK, 13 agentes. `pnpm sync:skills:check`: OK, 51 skills. `pnpm sync:mcp:check`: OK, 4 y 6 servidores. `pnpm test:tooling`: 165 pass, 0 fail.
- `pnpm audit:adr-citations`: 0 bloqueantes. `pnpm audit:doc-locations`: 0 bloqueantes.
- API: `pnpm --filter @iwana/api build`, código 0. Arranque con `NODE_ENV=development` y Joi activo. El cuerpo de `GET /api/v1/health` tiene `db: ok` y `redis: ok`. Reintento del 2026-10-18 a las 10:59: tres `GET` con HTTP 200 (`b7-gate10-health-code.txt`), con `db: ok` y `redis: ok` en cada uno. El `exit 1` del meta de B5 es el código que Windows asigna a un proceso terminado con `taskkill /F`; el criterio del gate es HTTP 200, log sin ERROR y puerto libre (ajuste 2 de B6). La infraestructura de dev usa PostgreSQL en 5433 y Redis en 6380, según `.env.development`.

### 7.4 Build y dev de portal y web (B4, gate 11 con excepción C)
- Build de portal y web: código 0 con Next.js 16.4.2 (Turbopack) y Cache Components activo. Sin aviso de `partialPrefetching`. Standalone verificado en `apps/portal/.next/standalone/apps/portal/server.js` y `apps/web/.next/standalone/apps/web/server.js`.
- Dev: `/` responde 200 en el puerto 3002 (HTML con meta refresh hacia `/auth/login`) y en el 3001 (HTML con meta refresh hacia `/auth/login?next=%2Fdashboard`). `/auth/login` y `/dashboard` responden 200.
- `AGENTS.md` y `CLAUDE.md` sin cambios tras `next dev` (gate 15).
- **Excepción C.** El log de dev muestra errores de validación instant de Next 16.4 en `/` (ambas apps), en `/dashboard` (web, una vez) y en `/auth/login` (web, porque lee `searchParams` fuera de `Suspense`). No hay log de dev de B0 para compararlo literalmente. Se trata como nuevo porque 16.2 no tenía esa validación. Ver fila 5 de §9.

### 7.5 Configuración de Next (B2c y B1b)
- `pnpm --filter @iwana/web typecheck` y `pnpm --filter @iwana/portal typecheck`: código 0, 0 errores TS. Ambos `tsconfig` incluyen `next.config.ts`, y las claves `partialPrefetching` y `agentRules` están tipadas en la `NextConfig` de 16.4.2.
- B1b: viable con ajustes. Ninguna API retirada en la guía de upgrade 16 se usa en `apps/`. Los ajustes son la configuración de §5.4 y la verificación de dev de §7.4.

### 7.6 Regresiones frente a B0 (gate 12)
- Tests: 9 479 passed en B0 y en B5; omitidos 16 en ambos (mismas suites); fallidos 0.
- Lint: avisos idénticos (portal 43, web 10, api 7, db 5) y 0 errores.
- Cobertura: idéntica salvo portal (funciones 4 840 a 4 839; líneas 22 586 a 22 587). No afecta a umbrales.
- WIP de MOD05: 28 archivos con sha256 idénticos antes y después de B5.

### 7.7 Observaciones (no bloquean)
1. **Aviso de Turbo en el build**: `IO error: provided value is too long when setting link name`, en web y portal. Hipótesis sin verificar: junctions de Windows con ruta absoluta de más de 100 caracteres. Se confirma o descarta en CI Linux (G6.5). B0 no tenía este aviso.
2. **Aviso de arranque de la API**: `PII_ENCRYPTION_KEY` no definida; se usa `MFA_ENCRYPTION_KEY` como fallback no productivo. Es configuración de desarrollo.
3. **`next-env.d.ts`**: los builds y el dev lo reescriben. Se restauró al cierre (§10).

## 8. Dictamen de seguridad (B6)

Dictamen de sec-eng (B6): **GO con ajustes**. No hay críticas ni escalación de seguridad.

Ajustes antes del commit:
1. Informe: declarar las dos altas residuales de nodemailer (v53p y prgh) y las tres moderadas (6vj9, 8vvx y g57g) bajo D2-A. Hecho en §4.1 y §9.
2. Gate 10: repetido `GET /api/v1/health` con el código HTTP registrado (200 en tres intentos) y explicado el exit 1 del meta de B5. Confirmado en §7.3.

Tabla de verificación (11 puntos de la consigna de B6):

| # | Punto | Resultado |
| --- | --- | --- |
| 1 | Diff de manifiestos | OK. Diff vacío en `apps/api/src` y `nginx`. |
| 2 | Overrides y advisorías | OK. Ningún override baja una versión parcheada. Críticas 4 a 0, altas 17 a 2, moderadas 16 a 7, bajas 5 a 1. |
| 3 | Matriz de proxy-addr con el lock final | OK. 9 de 9 casos idénticos a la base 2.0.7. |
| 4 | `trust proxy` | OK. `apps/api/src/main.ts:89` sin cambios. El parche no es alcanzable con un `trust` numérico. |
| 5 | Residual de nodemailer | OK con condición. Los destinatarios se validan en DTO antes de `sendMail`, y `ValidationPipe` usa `whitelist`. `MailerService` no valida (ver O-1 y el lote siguiente). |
| 6 | Paso de CI | OK. El paso está en el job `ci` sin `continue-on-error`. |
| 7 | Configuración de Next | OK. CSP, cabeceras, rewrites y origen de API sin cambios. |
| 8 | Origen del campo de login | Clasificado: riesgo bajo de higiene del navegador de prueba (autocompletado y slug guardado en localStorage). Sin credenciales en el código de la fase. |
| 9 | Moderadas residuales | Riesgo bajo en las cuatro (qs, js-yaml, csv-parse y nodemailer). |
| 10 | `@hapi/joi` 6w3j | Sin uso en `apps/api/src`. Retirarla en el lote siguiente. |
| 11 | Logs y PII | OK. La fase no añade código de aplicación ni logs. |

Hallazgos fuera de fase (no bloquean; se registran en §9):
- O-1 (sr-backend, media por disponibilidad): `void this.mailerService.sendMail(...)` sin `catch` en `auth.service.ts` (líneas 948, 1009 y 1258). Un rechazo de SMTP no manejado termina el proceso; sec-eng lo probó con Node 24.
- O-2 (sr-backend, baja): `GET /api/v1/health` es público y devuelve telemetría de relay.
- O-3 (fe-platform, baja): según el `.d.ts` instalado, `partialPrefetching: false` es el valor por defecto; la lectura de B1b decía lo contrario. Revisarlo antes de reevaluar D4 de ADR-096 (propuesto).

## 9. Riesgos residuales y condiciones

| # | Riesgo | Condición de cierre | Dueño |
| --- | --- | --- | --- |
| 1 | Altas de nodemailer GHSA-v53p-9fqp-m79j y GHSA-prgh-xp8r-p3m5 (DoS remoto en `addressparser`, rango 9.1.x) | PLAT-DEPS-NODEMAILER: nodemailer 10.0.9 o superior, con revisión de los correos de re-verificación y de contraseña; mientras tanto, validar `to` en `MailerService.sendMail` (string, formato email, ≤254 caracteres) | sr-backend (sesión PLAT-DEPS-NODEMAILER) |
| 2 | Moderadas de nodemailer 6vj9, 8vvx y g57g | Mismo bloque (10.0.9 o superior) | sr-backend |
| 3 | Moderadas js-yaml r3ph, csv-parse 8cw4, qs x5fp y 4mjr | Lote siguiente: overrides `qs@<6.16.0` y `js-yaml@<5.4.1`; `csv-parse` ≥7.0.2 (major). Sin ruta en esta app (dictamen B6) | plat-ops y fe-platform |
| 4 | Baja `@hapi/joi` 6w3j, sin parche | Retirar la dependencia en el lote siguiente (B6 confirma que no se usa; cambia el lock) | plat-ops |
| 5 | Validación instant de Next 16.4 en dev (excepción C, R9) | Corregir en código (`instant` o `Suspense`) o configurar la validación; antes de la beta | fe-platform |
| 6 | Defaults de Cache Components (`cachedNavigations`, `appShells`) con `partialPrefetching: false` | Smoke de navegación en G6.5, porque la suite E2E local del portal desactiva Cache Components | fe-platform y prod-ux |
| 7 | Preservación de estado con Activity (Next 16.3) | Validar formularios y diálogos de portal y web antes del cierre de la beta | prod-ux |
| 8 | Aviso de Turbo en el build (§7.7) | Confirmar o descartar en CI Linux | plat-ops |
| 9 | Riesgos previos a la fase (B1): límites de rate limit por ruta inactivos (decorador `default` frente al throttler `global`), e IP de consentimiento tomada de `X-Forwarded-For` crudo en `expedientes.controller.ts` | Registrar como deuda con dueño sr-backend; no se corrigen en esta fase | sr-backend |
| 10 | O-1: `void this.mailerService.sendMail(...)` sin `catch` en `auth.service.ts` (líneas 948, 1009 y 1258). Un rechazo de SMTP no manejado termina el proceso; previo a la fase | Añadir `.catch` con el patrón `fireAndForget` de `users.service.ts`, sin PII en el log | sr-backend; prioritario antes de la beta |
| 11 | O-2: `GET /api/v1/health` es público y devuelve telemetría de relay (dlqSize, discrepancias de conciliación, lag) | Limitar el detalle a uso interno | sr-backend |
| 12 | O-3: según el `.d.ts` instalado, `partialPrefetching: false` es el valor por defecto; la lectura de B1b decía lo contrario | Verificar antes de reevaluar la decisión D4 de ADR-096 (propuesto) | fe-platform |

## 10. Cierre del árbol y commit
- `apps/portal/next-env.d.ts` restaurado desde la copia previa a la fase (sha256 `7ad303…`, igual que el registro de B0). `apps/web/next-env.d.ts` restaurado a HEAD.
- `AGENTS.md` y `CLAUDE.md` sin cambios. `.gitignore` tiene WIP previo a la fase, que no se toca; el WIP de MOD05 y las entradas de otros encargos no cambian por esta fase.
- Commit con pathspec explícito (plan §8). Mensaje en inglés, como los commits recientes de `main`.
- Push: pendiente de confirmación del CTO (D3-A).

## 11. Pendientes después del commit
1. G6.5: push con confirmación del CTO; corrida de `ci`, `production-images` y `execution-orders-e2e` sobre el SHA; y `e2e-portal-debt-counter` con 100 fallos o menos.
2. PLAT-DEPS-NODEMAILER (sr-backend): nodemailer 10.0.9 o superior.
3. Corrección de la validación instant (fe-platform) antes de la beta.
4. MOD05 Suscriptores UX: reabrir V4 y G6 con este commit en `main`. Su WIP se commitea en su propio encargo.
5. Lote siguiente (dictamen B6): nodemailer ≥10.0.9, con validación de `to` mientras tanto; `.catch` en los tres `sendMail`; overrides `qs@<6.16.0` y `js-yaml@<5.4.1`; retirar `@hapi/joi`; `csv-parse` ≥7.0.2 (major); limitar el detalle de `/api/v1/health`. Los cambios de lock necesitan evidencia nueva de B5.

## 12. Evidencia
Scratchpad de la sesión, fuera del repositorio: logs `b0-*`, `b1-*`, `b2-*`, `b2c-*`, `b4-*`, `b5-*`, `b6-*` y `b7-*` (reintento del gate 10: `b7-gate10-retry.meta`, `b7-gate10-health-code.txt` y `b7-gate10-retry-control.txt`), los de `b0-*`, `b4-*`, `b5-*` y `b7-*` con su `.meta` de código de salida; el resto (`b1-*`, `b2-*`, `b2c-*` y `b6-*`) con la salida del comando registrada en la sesión.
