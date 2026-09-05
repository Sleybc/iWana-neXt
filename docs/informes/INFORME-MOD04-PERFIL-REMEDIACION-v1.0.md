# INFORME-MOD04-PERFIL-REMEDIACION-v1.0

**Módulo:** MOD04 Usuarios internos — superficie frontend de perfil propio (`apps/portal/src/components/profile`) + backend de perfil/credenciales
**Fase:** Remediación — plan [2026-09-03-mod04-perfil-remediacion](../plans/2026-09-03-mod04-perfil-remediacion.md)
**Modo de operación:** AI-EM-ARCH — EM + Orchestrator ( + Architect para veredictos de contrato)
**Fecha:** 2026-09-04 (v1.0) · **Adenda de cierre §10:** 2026-09-04 (todos los pendientes saldados salvo firma CTO)
**Estado:** Vigente
**Origen:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md) — 17 hallazgos (3 Altos, 7 Medios, 7 Bajos, 0 críticos)
**Prompts G4:** PERFIL-TESTS (SR-QA) · PERFIL-P0 (FE-PLATFORM) · PERFIL-SEGURIDAD (SR-FULL + SEC-ENG) · PERFIL-CONSOLIDACION-DS (FE-PLATFORM) · TRANSVERSAL-AVATAR (DS-OWNER → FE-PLATFORM)
**Contratos congelados:** [contrato-formstatus-sectionheader](../specs/2026-09-03-contrato-formstatus-sectionheader.md) v1.0 · [contrato-avatar](../specs/2026-09-04-contrato-avatar.md) v1.0 (Acto 1)
**Normativa:** [PRD-MOD04 v1.2](../prds/PRD-MOD04-USUARIOS-INTERNOS-v1.2.md) · [HLD-MOD04 v1.2](../hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.2.md) · [ADR-086](../adrs/ADR-086-Acceso-Titular-Documento-Perfil-Propio.md) (`Aprobado` 2026-09-04)

---

## 0. Encuadre — qué se encontró al entrar

El árbol ya traía trabajo en vuelo de los cinco tracks: 2 commits (`26683d50` consolidación DS, `053e7882` política de contraseñas) más working copy sin commitear en `apps/portal` (compuerta, `AuthProvider`, 4 specs de perfil), `apps/api` (P-02/P-05/P-07/P-09/P-17/Paso 7), `packages/shared` (constantes + schemas), `e2e/portal-profile.spec.ts` y el contrato Avatar v1.0. Esta fase no reabrió nada ya mergeado: verificó, cerró cruces y registró lo pendiente.

**Delegación (sin prompt no hay implementación):** 5 agentes expertos en paralelo sobre superficies disjuntas — SR-QA (T1), FE-PLATFORM (T2), SR-FULL (T3), SEC-ENG (revisión reforzada de autenticación), DS-OWNER (contratos). **Verificación propia del gate (§7.4 anti-alucinación):** EM-ARCH ejecutó de primera mano el gate de perfil (4 suites, 46 passed, cobertura 98.74/87.12 — §2), leyó `PersonalInfoForm.tsx:150-210`, `ProfileClient`/`AuthProvider` (`getMe()` sin args), `users.service.ts:1100-1260,1626-1710`, el diff de `tenant.middleware`/`rate-limit-tracker`/DTOs, ambos contratos y el HLD §15. Dos discrepancias documentales detectadas por agentes quedaron registradas (§4), ninguna afirmación de consecuencia se firma sin abrir.

## 1. Veredicto por track

| Track | Dueño | Veredicto | Detalle |
| --- | --- | --- | --- |
| T1 · Compuerta y pruebas | SR-QA | **GO unitario · STOP E2E-entorno** | Ola 0 cerrada (script sin bandera + threshold 80% por glob). 9 bloqueantes existen y pasan (§2). a11y unitario en verde. E2E no ejecutado: puerto 3002 ocupado → [BLOQUEO] E2E-ENTORNO (§4) |
| T2 · Defectos funcionales | FE-PLATFORM | **GO** | P-01 (2 call sites, sin tercero; `TenantSlug` acotado a `userApi`, declarado), P-03, P-06 + C-1, P-15 (4 bordes), Paso 5 (documento visible), C-2/C-3 cerrados en FE. Cero archivos editados en la verificación: todo ya estaba en el árbol |
| T3 · Credenciales y auditoría | SR-FULL | **GO técnico de superficie** | P-02 (3 controles), P-05 (paridad jti + cookie), P-07 (`await` + `changedFields`, decisión justificada), P-09 (bucket por `sub` + lockout + barrido de rutas), P-17 (sin eco ni estado, códigos conservados), Paso 7 (NIST + `currentPassword` sin longitud), P-10 intacto. 8 suites propias 170/170. STOP a nivel de suite global por causa ajena (§4) |
| Revisión reforzada | SEC-ENG | **SIN BLOQUEANTES** | Merge autorizado desde seguridad; 5 residuales aceptados explícitos (§7) |
| T4 · Consolidación DS | DS-OWNER | **FIEL al contrato v1.0** | `FormStatus` (idle = contenedor vivo) y `SectionHeader` (`headingLevel` sin default) fieles; cero tokens/radios nuevos; `gravatar.ts` + superficie CSP retirados; sin cambios de avatar/iniciales en el diff |
| T5 acto 1 · Contrato Avatar | DS-OWNER | **FIEL, CONGELADA v1.0** | API, `getInitials` canónico, privacidad (nunca email), tokens, a11y y matriz de 7 sitios cubren el prompt §4. Sin [BLOQUEO]. [CONSULTA→PROD-UX] registrada como no bloqueante |

## 2. Evidencia de gates

**Portal perfil — corrida propia de EM-ARCH (jest directo, sin Turbo → sin caché posible):**

```bash
pnpm --filter @iwana/portal exec jest --ci --runInBand --coverage \
  --collectCoverageFrom='components/profile/**/*.tsx' \
  --coverageReporters=text \
  --testPathPattern='components/profile/.*\.spec\.tsx$'
```

`Test Suites: 4 passed, 4 total` · `Tests: 46 passed, 46 total` (exigido ≥ 26) · statements 98.74 / branches 87.12, ningún archivo bajo 80% ni al 0% · sin `No tests found` ni `passWithNoTests`. Ruido no bloqueante: 4 warnings `act(...)` en `ProfileClient.spec` (limpieza opcional, dueña QA).

**Los 9 bloqueantes (todos en verde):** PC-01/PC-02 (P-01, aridad `getMe`), PIF-01/PIF-02 (P-03, vacío + E.164), PIF-03 (P-06, `null` nunca `''`), PIF-04 (P-02/C-2, sin `syncCompanyContactEmail`), PIF-05 (P-08, regiones vivas), CPF-01 (P-14, 400 con mensaje), CPF-02 (P-05/C-3, `logout` tras cambio).

**API (reportado por SR-FULL, superficie Ola 2):** 8 suites 170/170 (`login-email`, `update-me`, `auth.dto`, `users.dto`, `rate-limit-tracker`, `tenant.middleware`, `auth.service`, `auth.controller.http`); `tsc` y `eslint` de superficie limpios; sin migraciones (cero cambios de entidad). **UI (T4, declarativo DS-OWNER):** `FormStatus.spec` idle-con-región-viva + `jest-axe` sin violaciones; gates `ui` + perfil + `lint`/`typecheck` por adjuntar al commitear (jest directo, nunca script `test`).

## 3. Cruces entre agentes — los tres cerrados

| # | Cruce | Estado |
| --- | --- | --- |
| C-1 | `phone: null` ante `@Matches` | **Cerrado en ambas puntas**: `UpdateProfilePhoneDto` con `ValidateIf(v !== null && v !== undefined)` + servicio `?? null`; cliente emite `null` al vaciar con valor previo. Micro-caso FE nominal pendiente como deuda menor (§4) |
| C-2 | Retirar `syncCompanyContactEmail` del cliente | **Cerrado**: dto FE solo `{email, currentPassword}` (spec PIF-04 lo fija); servidor ignora el flag y decide por admin principal |
| C-3 | Logout tras cambio voluntario | **Cerrado**: `await logout()` en `ChangePasswordForm` (spec CPF-02), espejo de `change-password/page.tsx:66`; servidor con blacklist `jti` + limpieza de cookie |

## 4. Bloqueos y pendientes vivos

| # | Asunto | Tipo | Desbloqueo | Bloquea |
| --- | --- | --- | --- | --- |
| B-1 | **[BLOQUEO] E2E-ENTORNO** — puerto 3002 ocupado (PID 5856); con `PW_FORCE_FRESH_SERVER=1` Playwright abortaba antes del primer test | Entorno | **CERRADO 2026-09-04 (SR-QA):** el PID ya no existía al reintentar (puerto libre, ningún proceso detenido). E2E fresco: `13 passed (51.4s)` — profile 3/3 · users 10/10. Evidencia en §10 | ✅ saldado |
| B-2 | Suite global `@iwana/api`: 272 pass / 16 fail en CRM/commercial/assurance/inventory, causa atribuida a otro track en vuelo | Causa ajena | **CERRADO 2026-09-04 (SR-FULL):** causa raíz única — 16 dobles desactualizados (falta stub `EffectivePermissionsService`; +1 capa `ExecutorCustodyService` en 2 suites). Solo specs, cero producto. Post-fix: `288 passed, 0 failed` (82 recuperados). Evidencia en §10 | ✅ saldado |
| B-3 | **ADR-086 sin firma del CTO** (estaba `Propuesto`) | CTO | **CERRADO 2026-09-04: firmado — ADR-086 `Aprobado`, con laudo (opción 1: `changedFields` cumple §5). Resolución en §10.4** | ✅ saldado |
| P-4 | CA-P08 sin test + micro-caso FE `phone:null` nominal | Deuda menor | **CERRADO 2026-09-04 (SR-QA):** `PIF-03b` + caso CA-P08 (las 3 entradas coinciden en min 10 + NIST). Gate perfil: 48 passed | ✅ saldado |
| P-5 | `--passWithNoTests` en 5 `package.json` — segundo hallazgo de QA | Deuda | **CERRADO 2026-09-04 (SR-FULL api + PLAT-OPS resto):** bandera retirada en los 6 paquetes; suites verificadas sin caché (shared 84 · database 248 · worker 105 · web 229 · api 3543). **No hay segundo P-04** | ✅ saldado |
| P-6 | HLD §15 decía "6 de los 7" con tabla de 8 — **corregido en esta fase** ("7 de los 8", con nota de corrección). EM-ARCH accountable (linaje P-16) | Cerrado | — | — |

## 5. Superficies del HLD — condición del plan §11

| Superficie HLD §3.3 | Turno que la cubrió | Estado |
| --- | --- | --- |
| `components/users/` (gestión, `/dashboard/users`) | UI/UX 2026-07-23 ([informe](INFORME-USUARIOS-UIUX-AUDITORIA-v1.0.md)) + backend 2026-07-23 | Cubierta (GO vigente sobre lo cubierto) |
| `components/profile/` (perfil propio, `/dashboard/profile`) | **Esta fase** (T1–T4 verificados, §1–§2; adenda §10) | Cubierta; cierre reemitido con GO (§6, §10.4) |

## 6. Decisión de EM-ARCH — reemisión del cierre de MOD04 (actualizada 2026-09-04)

**Cierre de MOD04: REEMITIDO — GO.** Las cuatro condiciones quedaron saldadas (B-1 y B-2 con evidencia en §10.1; B-3 firmado, §10.4; commits por ola en manos del usuario, sets en §10.2). El GO del 2026-07-23 conserva su validez sobre lo que sí cubrió (backend + `components/users/`); este acto lo restituye como cierre de módulo completo, cubriendo además `components/profile/`.

Registro por gate (ADR-069: G6, G6.5 y G7 por separado):

- **G6 (funcional + calidad): GO** — 9 bloqueantes en verde, cobertura perfil 98.76/86.92, E2E 13/13 con servidor fresco, a11y sin violaciones, dictamen SEC-ENG sin bloqueantes, contratos DS fieles.
- **G6.5 (merge readiness): PENDIENTE de corrida Linux por SHA al momento del merge** — autoriza merge, nunca despliegue. La suite api local está en verde (288/288); la corrida CI es el acto que lo acredita.
- **G7 (despliegue): fuera de alcance de esta fase** — DT-01 (cifrado at-rest de PII) sigue abierto como gate de pre-producción independiente y ninguna decisión de esta fase lo relaja.

Al reemitir, el cierre registra G6, G6.5 y G7 por separado. La **Ola 4 (Avatar Acto 2) quedó CERRADA en esta adenda** (no como deuda): `Avatar` + `getInitials` + `formatFullName` implementados contra contrato v1.0, 7 sitios migrados, gates ui/shared/web/portal en verde salvo 4 fails de `SchedulingClient` ajenos al diff (superficie de otro track en vuelo, plan §8.1 — no se tocan). Veredicto PROD-UX: confirma icono genérico, sin follow-up de diseño.

## 7. Contabilidad de deuda por severidad

| Severidad | Estado al cierre de fase |
| --- | --- |
| Alto (P-01, P-02, P-03) | **Remediados y fijados con test** (PC-01/02, PIF-01/02/04 + backend `login-email`) |
| Medio (P-04 … P-10) | P-04 compuerta reparada · P-05/P-06/P-07/P-09 cerrados con test · P-08 regiones vivas + `jest-axe` · P-10 cerrado con B-3 (ADR-086 `Aprobado`, §10.4) |
| Bajo (P-11 … P-17) | P-11/P-13/P-14 en T4-T2 verificados · **P-12 CERRADO (§10: contrato v1.0 + 7 sitios migrados)** · P-15 cuatro bordes · P-16 HLD corregido en P-6 · P-17 unificado (oráculo por código subsiste, aceptado como Bajo diferible) |
| Residuales aceptados (SEC-ENG) | Oráculo P-17 por código · auditoría best-effort sin fail-closed (diseño transversal; atomicidad exigiría outbox) · tokens de verificación sin expiración (deuda heredada) · plataforma sin lockout por cuenta · ventana 15 min de otros access tokens · `LoginDto`/`MfaDisableDto` con `MinLength` en verificación (preexistente, sin impacto) |
| Deuda diferida con dueño | ~~Avatar Acto 2~~ ✅ cerrado · ~~15 specs E2E ciegos~~ ✅ cerrados (helper + payload en los 15; `playwright --list`: 231 tests, 0 errores) · ~~CA-P08 + micro `phone:null`~~ ✅ cerrados · ~~`--passWithNoTests` en 5 paquetes~~ ✅ cerrado (6/6 paquetes; no hay segundo P-04) · ~~banners fuera de `profile/`~~ ✅ migrados 10 error + 3 éxito en 9 archivos (resto en archivos con otros tracks en vuelo: commercial, scheduling, inventory, CRM, BulkImport — dueño FE-PLATFORM, fuera de este módulo) · ~6 copias backend de `formatFullName` (dueño SR-FULL, fuera de superficie FE) |

## 8. Instrumentación de KPIs (unidad: fase)

Reescrituras PRD/HLD: 1 (HLD §15, P-6) + las 2 previstas del turno de auditoría. Desempates emitidos: 0; refutaciones resueltas por consolidación en auditoría: 2. Latencia de gates: B-1 saldado en la sesión siguiente (puerto ya libre); B-2 saldado en la sesión siguiente (dobles, no regresión) — ambas registradas, no estimadas. Deuda crítica al cierre: 0; deuda alta: 0 pendiente (3 Altos remediados). Trazabilidad criterios↔test HLD §15: **8/8 con test** (era 1/8 pre-T1; CA-P08 cerró la última).

## 9. Trazabilidad

Plan → este informe. Informe de auditoría §2 (hallazgos), §3.3 (semántica de borrado), §3.4 (punto verde), §4 (escalaciones CTO 2026-09-03), §5 (reapertura), §6 (prompts). PRD-MOD04 v1.2 + HLD-MOD04 v1.2 + ADR-086 (`Aprobado` 2026-09-04) + Stack_Tecnologico (versiones de stack, nunca fijadas aquí). Protocolo v1.5: §3bis (contratos congelados citados por ruta y versión), §3bis.3 (carril rápido DS), G1 no aplica (fase de remediación, no de definición), G4 (los 5 prompts emitidos), G6 GO / G6.5 pendiente al merge / G7 fuera de alcance (§6).

---

## 10. Adenda de cierre de pendientes (2026-09-04)

Cinco agentes expertos en paralelo (SR-QA, SR-FULL, PLAT-OPS, FE-PLATFORM, PROD-UX) sobre superficies disjuntas, plan §8.1 respetado (cero colisiones de merge entre tracks de esta adenda). Verificación propia del gate de perfil por EM-ARCH (§2 de v1.0, re-ejecutado: 4 suites, **48 passed**, cobertura 98.76/86.92).

### 10.1 Evidencia por pendiente

- **B-1 (E2E):** `$env:PW_FORCE_FRESH_SERVER="1"; pnpm exec playwright test e2e/tests/portal-users.spec.ts e2e/tests/portal-profile.spec.ts --config e2e/playwright.portal.config.ts --forbid-only --reporter=list` → `13 passed (51.4s)`, profile 3/3 · users 10/10. El PID 5856 ya no existía; ningún proceso detenido.
- **B-2 (api):** 16 suites en rojo por dobles desactualizados (stub `EffectivePermissionsService` ausente desde la convergencia RBAC; `ExecutorCustodyService` en 2 suites) — solo specs, cero producto. Post-fix: `Test Suites: 4 skipped, 288 passed` · `Tests: 15 skipped, 3543 passed` — **0 en rojo**. `lint` 0 errors · `typecheck` limpio · sin migraciones.
- **P-4:** `PIF-03b` (`phone:null` nominal, misma ruta `trackText`) + caso CA-P08 (vectores sobre `changePasswordSchema` compartido; `change-password/page.tsx` lo importa, `reset-password/page.tsx` conserva el núcleo min 10 + 4 clases NIST). Gate perfil 48/48.
- **P-5:** `test: jest` sin bandera en los 6 `package.json` (verificado por EM-ARCH). Suites sin caché: shared 84 · database 248 · worker 105 · web 229 · api 3543 — todas con tests reales, cero `No tests found`.
- **15 E2E ciegos:** `assertTenantHeader` + payload mínimo en los 15 specs (tabla criterio↔spec en el reporte de QA). `playwright --list`: 231 tests en 33 files, cero errores de carga; `eslint` limpio en los 17 editados.
- **Avatar Acto 2:** `Avatar` + `getInitials` (`packages/ui`, barrel plano) + `formatFullName` (`@iwana/shared`, 0 copias del patrón en frontends); 7 sitios de la matriz §8 migrados (+ `web/.../profile/page.tsx`, misma lógica que #5, declarado — no es 8.º sitio); tests `Avatar.spec` 15 + `person-name.spec` 13. Gates: ui 29 · shared 102 · web 229 · `lint` 0 errors · `typecheck` 8/8. Portal: verde salvo 4 fails de `SchedulingClient` **ajenos al diff** (toolbar/OT/rail/visit-language; el spec solo menciona `avatarUrl: null` como fixture — causa: otro track WFM en vuelo sobre `SchedulingClient.tsx`; plan §8.1, no se toca).
- **Conflicto `ProfileHeader.spec` resuelto:** el spec QA fijaba el comportamiento pre-contrato (`'?'` + `role="img"`); FE migró a decorativo `aria-hidden` + icono. SR-QA reescribió las 2 aserciones al contrato v1.0 — suite 5/5 con `jest-axe` sin ajuste (el patrón es correcto WCAG, no violación).
- **Banners fuera de `profile/`:** 10 de error + 3 de éxito migrados a `FormStatus` siempre montado en 9 archivos (users/settings/operations/assurance); `PortalAlert` conservado donde es alerta de página (declarado por archivo). 2 tests de región siempre montada añadidos.
- **PROD-UX ([CONSULTA] contrato §5):** CONFIRMA icono genérico — sin degradación de tarea (texto adyacente identifica), privacidad no negociable, variante color-por-hash rechazada (ruido, Firma iWana §2, WCAG 1.4.1). Sin follow-up de diseño.

### 10.2 Sets de commit propuestos (plan §8.2 — los hace el usuario)

1. `test(portal): compuerta P-04 + red T1 en rojo→verde` — `apps/portal/package.json`, `jest.config.js`, 4 specs `profile/`, `e2e/portal-profile.spec.ts`, fix plan mod00 `:198,292`, corrección HLD §15.
2. `feat(perfil): defectos funcionales T2 (P-01/P-03/P-06/P-15 + documento)` — `components/profile/*.tsx` (no specs), `AuthProvider.tsx`, `userApi` en `api-client.ts`, `packages/shared` phone-constraints. Incluye el diff en vuelo `updateMe(dto)`.
3. `feat(api): endurecimiento T3 (P-02/P-05/P-07/P-09/P-17/Paso 7)` — `apps/api` users/auth/tenant/rate-limit/mailer + `password-policy`/`account-lockout` + specs T3. Dictamen SEC-ENG: sin bloqueantes.
4. `refactor(perfil): consolidación DS T4` — ya commiteado (`26683d50`, `053e7882`).
5. `test(e2e): cabecera tenant + payload en 15 specs` — solo `e2e/tests/portal-*.spec.ts` + 2 casos P-4 en specs `profile/`.
6. `fix(api): dobles desactualizados B-2 + flag P-5` — 16 specs + `apps/api/package.json`.
7. `chore: retirar --passWithNoTests` — `package.json` de web/worker/database/shared.
8. `feat(ui): Avatar Acto 2 + banners` — `packages/ui` Avatar, `shared` person-name, 7 sitios, 9 archivos de banners + specs. (En dos commits si se prefiere: Avatar, luego banners.)

### 10.3 Escalación al CTO — firma ADR-086 (B-3, único pendiente)

```text
[ESCALACIÓN AL CTO]
Prioridad: Media (cumplimiento; la remediación técnica está cerrada y verificada)
Contexto: ADR-086 (propuesto) autoriza al titular a ver/editar su documento en
  el perfil propio. Sus dos condiciones están cumplidas en código: la UI lo
  renderiza (Paso 5 T2, verificado) y la auditoría registra qué cambió (P-07
  con `changedFields`, verificado + dictamen SEC-ENG sin bloqueantes).
  Tensión a laudar: ADR-086 §5 dice "valor anterior y nuevo", pero la denylist
  SEC-P1 vigente redacta cualquier valor o marcador bajo clave PII — persistir
  valores sería falsa trazabilidad (el saneado los vacía al persistir; hay test
  que lo demuestra). SR-FULL y SEC-ENG resuelven a favor de `changedFields`
  (lista de campos bajo clave no-PII: máxima fidelidad posible sin relajar
  SEC-P1).
Opciones (máx. 3):
  1. Firmar ADR-086 con `changedFields` como cumplimiento de §5 (recomendada:
     no relaja ningún control y deja trazabilidad verificable).
  2. Firmar exigiendo valores literales → requiere enmienda previa a la
     denylist (turno propio de seguridad, pre-producción).
  3. No firmar → retirar `documentNumber` de la proyección de `/users/me` y de
     la UI (revierte el Paso 5 T2; PRD v1.2 vuelve a superado).
Recomendación: Opción 1.
Decisión requerida antes de: reemitir el cierre de MOD04 (última condición).
```

### 10.4 Resolución B-3 — firma del CTO (2026-09-04)

**ADR-086 `Aprobado`.** El CTO firmó sin cualificación; se registra con la recomendación adoptada (opción 1): `changedFields` cumple §5, porque la denylist SEC-P1 vigente hace impersistibles los valores literales (verificado con test; SEC-ENG sin bloqueantes). Laudo y estado inscritos en el propio ADR (§Escalación). Todas las citas del corpus dejan el marcador `(propuesto)`: PRD-MOD04 v1.2 (7 citas), plan de fase (§DoR, §9, condición de cédula) y este informe. Los prompts G4 ya emitidos y el informe de auditoría v1.0 conservan su marcador como registro histórico del estado al momento de emisión — no se reescriben artefactos cerrados.

Con B-3 firmado, la última condición de §6 quedó saldada: **cierre de MOD04 reemitido (GO)** con G6 GO, G6.5 pendiente de corrida Linux por SHA al merge y G7 fuera de alcance.
