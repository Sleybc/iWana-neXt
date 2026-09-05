# PROMPT — MOD04 Perfil: cobertura de pruebas y reparacion del gate

**Agente destinatario:** AI-SR-QA
**Modulo:** MOD04 Usuarios internos — superficie frontend de perfil propio
**Emitido por:** AI-EM-ARCH · 2026-09-03 · gate G4
**Origen:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](../informes/INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md) — hallazgo P-04 y la matriz de trazabilidad

---

## 1. Objetivo exacto de la fase

La pantalla de perfil tiene **cero tests**, y el comando de gate que un plan vigente usa para verificarla **ejecuta cero tests y sale 0**. Esta fase repara la compuerta y escribe la red que habria cazado los tres defectos Altos.

El orden importa: **primero el Paso 1**. Escribir tests bajo un script que aprueba corridas vacias es construir sobre el mismo suelo que fallo.

## 2. Artefactos de entrada obligatorios

1. `AGENTS.md` — Testing Guidelines y Gates Before Merge.
2. El informe de origen: §2 (defectos que la red debe cazar) y §3.3 (la semantica de borrado, ya decidida — el `[BLOQUEO]` que emitiste esta resuelto, ver Paso 3).
3. Convencion vigente a calcar, **no reinventar**: `apps/portal/src/components/dashboard/DashboardClient.spec.tsx:38-90` para el idioma de mock que **preserva los argumentos**, y `e2e/tests/portal-settings-federated-shell.spec.ts:105-114` para el helper de asercion de cabecera de tenant.
4. Skills: `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `wcag-audit-patterns`.

---

## 3. Instrucciones

### Paso 1 — P-04: reparar la compuerta fantasma

`apps/portal/package.json:10` define `"test": "jest --passWithNoTests"`. Con esa bandera, `pnpm --filter @iwana/portal test -- ProfileClient.spec.tsx` — el comando de verificacion que usan `docs/plans/2026-05-27-mod00-consolidacion-politica-mfa-en-access.md:198,292` — ejecuta **cero tests y sale 0** sobre un archivo que no existe. El plan se dio por verificado con una corrida vacia.

Resuelvelo de raiz, no solo en este modulo:

1. Retira `--passWithNoTests` del script, o acotalo a la invocacion de CI donde tenga sentido. **Comprueba antes** que ningun paquete del monorepo depende de esa bandera para pasar hoy; si alguno lo hace, ese es un segundo hallazgo y debe reportarse, no taparse.
2. Anade un `coverageThreshold` por glob para `components/profile/**`. El umbral global (statements 55 / branches 47, `jest.config.js:59-66`) es un trinquete correcto, pero un modulo nuevo al 0% se diluye en 24.402 statements y no mueve la aguja.
3. Corrige el comando de verificacion en el plan citado, o marcalo como superado. Un plan cuyo gate no puede fallar es un artefacto que miente.

### Paso 2 — la asercion que caza P-01

El defecto no vive en la URL sino en el argumento: `userApi.getMe(user.id)` pasa un UUID donde va el slug de tenant. La asercion primaria es **unitaria** y afirma la aridad, que es el contrato real:

```ts
expect(getMe).toHaveBeenCalledWith();
expect(getMe.mock.calls[0]).toHaveLength(0);
```

No mira URLs, headers, DOM ni orden de efectos. Si manana `getMe` cambia de firma, este test falla — y **debe** fallar: esa es exactamente la revision que hay que forzar.

La red E2E es **secundaria, no primaria**: si alguien exporta `NEXT_PUBLIC_TENANT_SLUG` en su shell, `tenant-resolution.ts:74-81` cortocircuita el input y la asercion de cabecera pasa en verde con el bug presente. Escribela igual, portando el helper que ya existe, pero no la trates como la red que sostiene el invariante.

### Paso 3 — matriz de pruebas

Escribe los cuatro specs co-locados en `apps/portal/src/components/profile/` mas el E2E dedicado `e2e/tests/portal-profile.spec.ts`, segun la matriz que produjiste: **9 casos bloqueantes + 17 complementarios + 3 E2E**.

> **Los 9 bloqueantes se escriben ANTES de la remediacion y deben FALLAR** (plan de fase §3, Ola 1). Ese rojo es tu entregable, no un problema: un test escrito *despues* del fix demuestra que el codigo pasa; escrito *antes*, demuestra que **caza el defecto**. Adjunta la salida de jest con los 9 fallos nombrados y su hallazgo asociado; AI-FE-PLATFORM y AI-SR-FULL los ponen en verde en la Ola 2.
>
> **Los `*.spec.tsx` son tuyos en exclusiva** (plan §8.1). Ningun otro track crea archivos de test en esta fase: si FE o SR-FULL necesitan un caso que no esta en la matriz, te lo piden.

**Tu `[BLOQUEO]` sobre PIF-03 esta resuelto.** La semantica de borrado quedo decidida (informe §3.3):

> `undefined` = no tocar · `null` = borrar · `''` no es un valor valido y no se envia.

Escribe PIF-03 contra ese criterio. Si al implementarlo AI-FE-PLATFORM y AI-SR-FULL aun no han cerrado la parte de `phone: null` en el DTO, marca ese caso como pendiente con referencia al prompt correspondiente — **no lo omitas silenciosamente**.

Prioridad si la fase se queda corta: los 9 bloqueantes primero (PC-01, PC-02, PIF-01 a PIF-05, CPF-01, CPF-02). Cada uno fija un invariante roto; los complementarios cubren caminos felices y bordes.

### Paso 4 — a11y y trazabilidad

- `jest-axe` ya esta registrado globalmente (`apps/portal/src/jest.setup.ts:4-6`) y hoy no se usa en el perfil. Cubre el perfil renderizado y el formulario con errores visibles.
- El HLD declara "Dark mode completo. WCAG 2.2 AA" sin un solo test que lo respalde, y `portal-users.spec.ts` no tiene carpeta de snapshots, a diferencia de `portal-settings-access-ui`. Evalua si procede regresion visual aqui; si concluyes que no, **declaralo con criterio**, no por omision.
- Registra la trazabilidad criterio↔test. De los 7 criterios que el HLD deja rastrear para el perfil, **6 no tienen test que pase**. Ese recuento debe quedar en tu reporte, y es entrada del bump del HLD que hace EM-ARCH.

### Paso 5 — el helper de cabecera en `portal-users.spec.ts`

Porta `assertTenantHeader` a ese archivo. Los **otros 15 specs ciegos** del portal (ni cabecera ni payload, la mitad de la superficie E2E) son trabajo aparte con deuda ya registrada: **no bloquean este modulo y no los abordes aqui**.

---

## 4. Restricciones no negociables

1. **No implementes features ni corrijas defectos de produccion.** Si un test falla porque el fix aun no llego, ese es su estado correcto: coordina con FE-PLATFORM, no parchees el componente.
2. Sin PII real en fixtures. Builders locales y datos sinteticos, como el resto del repo.
3. Calca la convencion existente: Jest + ts-jest, jsdom, `@testing-library/react`, consultas por rol y label — nunca por clase CSS —, mock de `@/lib/api-client` con spies nombrados fuera del factory que **preserven los argumentos**, y mock parcial de `@iwana/ui` con `jest.requireActual` solo donde haga falta.
4. No acoples las aserciones a detalles fragiles: nada de textos completos de parrafo ni de estructuras DOM internas del design system, que la fase de consolidacion va a cambiar.

## 5. Entregables

- `ProfileClient.spec.tsx`, `PersonalInfoForm.spec.tsx`, `ChangePasswordForm.spec.tsx`, `ProfileHeader.spec.tsx`, `e2e/tests/portal-profile.spec.ts`.
- Script `test` reparado y `coverageThreshold` por glob.
- Reporte de calidad con: recuento de criterios sin test, casos marcados como pendientes y por que, y la evidencia de gate del §6.

## 6. Evidencia de gate exigida

**El script del paquete no sirve como gate.** Invoca jest directo:

```bash
pnpm --filter @iwana/portal exec jest --ci --runInBand --coverage --collectCoverageFrom='components/profile/**/*.tsx' --coverageReporters=text --testPathPattern='components/profile/.*\.spec\.tsx$'
```

`rootDir` es `src`, asi que los patrones van **relativos a `src/`**, sin ese prefijo. Jest invocado directo no pasa por Turbo: no hay cache posible.

Evidencia exigida, las tres en el log:

- `Tests: N passed` con **N ≥ 26** y `Suites: 4 passed`.
- Cobertura de `components/profile` **≥ 80%** en statements y branches, sin ninguna fila al 0%.
- **Ausencia** de `No tests found` o de cualquier rastro de `passWithNoTests`.

Si el gate se corre por Turbo sobre la suite completa:

```bash
pnpm exec turbo run test --filter=@iwana/portal --force --ui=stream --concurrency=1
```

`--force` es obligatorio (`test` es cacheable en `turbo.json`) y `--ui=stream` tambien: el modo TUI por defecto no deja la linea `Cached:` en un log capturable, y sin ella la evidencia no es auditable. Adjunta la linea `Cached: 0`.

E2E del portal:

```bash
PW_FORCE_FRESH_SERVER=1 pnpm exec playwright test e2e/tests/portal-users.spec.ts e2e/tests/portal-profile.spec.ts --config e2e/playwright.portal.config.ts --forbid-only --reporter=list
```

`PW_FORCE_FRESH_SERVER=1` no es opcional: `playwright.portal.config.ts:67` reutiliza servidor fuera de CI, y un dev server viejo en el 3002 sirve codigo anterior — el equivalente E2E exacto de la cache de Turbo, y una segunda via de evidencia falsa.

## 7. Criterio de stop/go

**STOP y emite `[BLOQUEO]` a AI-EM-ARCH si:**

- Retirar `--passWithNoTests` deja en rojo otro paquete del monorepo. Reportalo, no lo tapes.
- Un caso bloqueante no se puede escribir sin decidir un criterio de aceptacion que no existe. Emite el `[BLOQUEO]` **antes** de codificar una suposicion propia como criterio — hiciste bien la vez anterior.
- La cobertura no alcanza el 80% sin escribir tests que solo suban el numero.

**GO si:** los 9 bloqueantes en verde, cobertura ≥80% con evidencia sin cache, a11y sin violaciones, E2E en verde con servidor fresco, y el script de gate reparado.

## 8. Fuera de alcance

Los 15 specs E2E ciegos restantes, `apps/web`, y cualquier correccion de codigo de produccion.
