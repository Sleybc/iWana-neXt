# MOD11 G7 Production Readiness Implementation Plan

> **Estado 2026-08-02 — PLAN SUSPENDIDO. No ejecutar.**
>
> **Task 1 resuelta:** el CTO aprobó [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) el 2026-08-02 sin cambios de contenido. La ruta que este plan diseñó ("mantener en `Propuesto` y registrar la ruta de aprobación CTO") se ejecutó y cerró: G6.5 es norma vigente. Las menciones de *"ADR-069 (propuesto)"* que siguen abajo son **registro cronológico del 2026-08-01**, no estado vigente.
>
> **Tasks 2–5 suspendidas por [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md)** (Aprobado, CTO 2026-08-02): el programa está en construcción modular y no va a producción, así que la definición del dominio productivo, la emisión TLS, los ensayos de rollback y los restores quedan diferidos hasta el disparador de reactivación del ADR. **Este plan no se descarta**: su diseño es correcto y se retoma tal cual —incluidos el script de verificación TLS del Step 2 y los criterios de PASS del Step 4— cuando se reactive. Su Step 1 (insumos de decisión del CTO) es exactamente lo que ADR-070 difiere.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar G6.5 con evidencia Linux del HEAD a mergear y mantener G7 en NO-GO hasta que dominio, TLS, rollback por componente, restores y aprobacion CTO tengan evidencia ejecutable.

**Architecture:** G6, G6.5 y G7 son gates independientes: G6 acepta calidad, G6.5 permite merge con CI Linux y G7 autoriza produccion. La evidencia local 29/29 queda como diagnostico; solo los jobs Linux identificados por SHA certifican el HEAD que se mergea. TLS diferido no bloquea G6 ni G6.5, pero sigue bloqueando G7 cuando exista dominio productivo.

**Tech Stack:** GitHub Actions, Docker Compose/Nginx, NestJS, Next.js, PostgreSQL por schema, Redis/BullMQ, pnpm, Playwright.

---

## Contexto y decisión recomendada

**Opcion recomendada: preparar y someter ADR-069 (propuesto) a aprobación final del CTO, y normalizar QA-34 como "diferido para merge, bloqueante para produccion".**

Motivo: ADR-069 (propuesto) ya expresa la separacion necesaria entre calidad, merge y release. AI-EM-ARCH puede emitir la recomendación y custodiar la trazabilidad, pero la aprobación final del ADR está reservada al CTO. Afirmar que QA-34 no bloquea G7 contradice el gate de produccion y permitiria interpretar un diferimiento de dominio como aprobacion de TLS. La opcion recomendada permite merge solo tras CI Linux, mientras conserva G7 como NO-GO sin dominio, certificado, ensayos de rollback/restores, recomendación de AI-EM-ARCH y aprobación CTO.

No se reescriben los commits `a1245ee0` y `b7adcdac`. La configuracion CI viajo con el registro de gate porque formaliza la compuerta; se conserva esa trazabilidad. En cambios futuros, cualquier cambio funcional de `.github/workflows/ci.yml` que altere los checks del codigo debe viajar con el commit de codigo, y el registro de gate debe limitarse a la evidencia obtenida.

## Archivos y responsabilidades

- Modificar: documento de gates G6.5 ADR-069 (propuesto).
  - Preparar la taxonomia de gates para aprobación final del CTO, sin autorizar G7.
- Modificar: `docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md`.
  - Corregir QA-34 para que no bloquee G6/G6.5 y si bloquee G7.
- Modificar: `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md`.
  - Mantener el registro vivo de G6/G6.5/G7, incluir URLs/SHA del CI y conservar el residual contractual de evidencia.
- Modificar: `.github/workflows/ci.yml` solo si el job no expone un resumen sanitizado con SHA, conteos, flaky y cleanup para ambos jobs.
  - No cambiar piso de 29 ni aceptar retries/flaky.
- Modificar: `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md`.
  - Añadir pasos reproducibles de rollback por componente y restauracion global/tenant, con criterios de aceptacion antes de ejecutarlos.
- Crear: `docs/informes/INFORME-MOD11-G7-EVIDENCIA-PRODUCCION-v1.0.md` solo cuando exista una ejecucion real de los prerequisitos G7.
  - No crear este informe antes de tener dominio, TLS y ensayos reales.

### Task 1: Preparar la separación de gates para aprobación CTO

**Files:**

- Modify: ADR-069 gate document (propuesto), lines 3-5
- Modify: `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md:685-692`

- [ ] **Step 1: Mantener ADR-069 (propuesto) en `Propuesto` y registrar la ruta de aprobación CTO**

Conservar la cabecera con:

```markdown
**Version:** 1.0
**Estado:** Propuesto
**Propuesto por:** AI-EM-ARCH, 2026-08-01
**Aprobación final CTO:** pendiente
```

- [ ] **Step 2: Registrar el efecto limitado de la recomendación**

En el registro vigente, conservar exactamente estas condiciones:

```markdown
| G6.5 Merge readiness | PENDIENTE | Requiere `production-images` y `execution-orders-e2e` verdes en Linux, identificados por SHA; la evidencia local no sustituye esos jobs. |
| G7 Production authorization | NO-GO | AI-EM-ARCH recomienda; CTO aprueba; requiere dominio, TLS efectivo, rollback por componente y restore global/tenant. |
```

- [ ] **Step 3: Verificar el diff documental**

Run: `git diff --check`

Expected: exit code 0.

- [ ] **Step 4: Commit de decisión de gobierno**

```text
git add docs/adrs docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md docs/plans/2026-08-01-mod11-g7-cierre-produccion.md
git commit -m "docs(operations): defer ADR-069 (propuesto) approval to CTO"
```

### Task 2: Corregir la semántica de QA-34/TLS

**Files:**

- Modify: `docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md:56, 151, 227`
- Modify: `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md:437, 614, 667, 692`
- Modify: `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md:532`
- Modify: `docs/quality/evidence-fase-06-g6/README.md`

- [ ] **Step 1: Identificar los textos vigentes, excluyendo secciones históricas**

Run: `rg -n "No bloquea G6/G7|no bloquea G7|QA-34|TLS" docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md`

Expected: las fotos históricas permanecen intactas; solo se corrigen la fila QA-34, el veredicto vigente y la matriz de dependencias.

- [ ] **Step 2: Aplicar la redacción canónica**

Usar esta frase en los registros vigentes:

```markdown
QA-34/TLS está diferido por CTO hasta que exista un dominio productivo definido y provisionado. No bloquea G6 ni G6.5; bloquea G7 hasta que se verifique un certificado de CA reconocida, terminación TLS efectiva y redirección HTTPS sobre el dominio aprobado.
```

- [ ] **Step 3: Verificar consistencia entre ADR, checklist e informe vivo**

Run: `rg -n "No bloquea G6/G7|no bloquea G7" docs/adrs docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md # ADR-069 (propuesto)`

Expected: no coincidencias en registros vigentes; las fotos históricas pueden conservar su contexto fechado.

- [ ] **Step 4: Commit de corrección documental**

```text
git add docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md
git commit -m "docs(operations): clarify TLS as G7 prerequisite"
```

### Task 3: Certificar G6.5 contra el HEAD a mergear

**Files:**

- Modify: `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md:685-704`
- Modify: `docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md:145-151`
- Modify: `.github/workflows/ci.yml` only if the summary artifact is missing required markers.

- [x] **Step 1: Publicar los commits de código, compuerta y gobierno en la rama a evaluar**

Run:

```text
git status --short
git log --oneline -5
$branch = git branch --show-current
git push origin $branch
```

Expected: árbol limpio; el SHA remoto contiene `a1245ee0`, `b7adcdac` y los commits documentales posteriores.

- [x] **Step 2: Ejecutar los dos jobs Linux sobre el mismo SHA**

Run:

```text
$branch = git branch --show-current
$runId = gh run list --branch $branch --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --exit-status
```

Expected: `production-images` y `execution-orders-e2e` finalizan `success` en el mismo run/SHA.

- [x] **Step 3: Validar el resumen sanitizado del E2E**

Obtener el artefacto o log del job y comprobar literalmente:

```text
E2E_SETUP=OK
E2E_PLAYWRIGHT_PASSED=29
E2E_PLAYWRIGHT_FAILED=0
E2E_PLAYWRIGHT_SKIPPED=0
E2E_PLAYWRIGHT_DID_NOT_RUN=0
E2E_PLAYWRIGHT_FLAKY=0
E2E_PLAYWRIGHT_EXIT=0
E2E_CLEANUP=OK
```

Expected: los nueve marcadores aparecen una sola vez, sin credenciales, tokens, cookies ni payloads.

- [x] **Step 4: Registrar evidencia de CI sin convertirla en autorización productiva**

Actualizar el informe vivo y checklist con SHA, URL del run, nombres de jobs y los conteos sanitizados. Cambiar G6.5 a `GO` solo si ambos jobs son verdes para el mismo SHA.

- [x] **Step 5: Commit de evidencia de G6.5**

```text
git add docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md
git commit -m "docs(operations): record Linux G6.5 evidence"
```

### Task 4: Mantener la laguna de errores de evidencia fuera de este cierre

**Files:**

- Modify: `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md:663-672`
- Future modify, not in this plan: `apps/api/openapi/tasks-execution-orders.v1.json`
- Future modify, not in this plan: `packages/shared/src/contracts/operations/execution-orders.ts`
- Future modify, not in this plan: cliente del portal que traduce errores de OT.

- [ ] **Step 1: Conservar el residual ya registrado**

Confirmar que el informe vivo dice que `EVIDENCE_UPLOAD_EXPIRED` y los demás `EVIDENCE_UPLOAD_*` no se publican aún en OpenAPI ni en `@iwana/shared`, y que el portal usa mensaje genérico.

- [ ] **Step 2: No modificar contrato ni UI en este cierre**

Run: `git diff -- apps/api/openapi packages/shared apps/portal`

Expected: no cambios destinados a materializar códigos de evidencia durante este plan.

- [ ] **Step 3: Abrirlo como alcance de la próxima descongelación de contrato**

La próxima fase debe incluir en una única unidad: enum tipado compartido, schemas OpenAPI, mapeo visible en español del portal y pruebas HTTP/UI. No se parchea un único código para evitar un contrato parcialmente tipado.

### Task 5: Ejecutar G7 solo con prerequisitos productivos disponibles

**Files:**

- Modify: `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md`
- Create: `docs/informes/INFORME-MOD11-G7-EVIDENCIA-PRODUCCION-v1.0.md`
- Modify: `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md:685-692`

- [ ] **Step 1: Obtener decisiones e insumos de producción**

Requerir antes de ejecutar: FQDN productivo aprobado, propietario DNS, método de emisión de certificado CA, ventana de mantenimiento, responsable de operación y objetivos RPO/RTO aprobados. Si falta cualquiera, mantener G7 `NO-GO` y no crear evidencia ficticia.

- [ ] **Step 2: Verificar TLS sobre el dominio real**

Run:

```text
if (-not $env:PRODUCTION_FQDN) { throw 'PRODUCTION_FQDN debe estar definido por la decisión de dominio.' }
$fqdnPattern = [regex]::Escape($env:PRODUCTION_FQDN)
$httpHeaders = @(curl.exe --silent --show-error --max-redirs 0 --dump-header - --output NUL "http://$env:PRODUCTION_FQDN")
if ($LASTEXITCODE -ne 0) { throw 'La respuesta HTTP no pudo obtenerse.' }
$httpText = [string]::Join("`n", $httpHeaders)
if ($httpText -notmatch '(?im)^HTTP/\S+\s+3\d\d\b') { throw 'La respuesta HTTP no es un redirect 3xx.' }
if ($httpText -notmatch "(?im)^Location:\s*https://$fqdnPattern(?::443)?(?:/|$)") { throw 'El redirect no apunta al FQDN productivo por HTTPS.' }
$healthHeaders = @(curl.exe --silent --show-error --max-redirs 0 --dump-header - --output NUL "https://$env:PRODUCTION_FQDN/api/v1/health")
if ($LASTEXITCODE -ne 0) { throw 'El health HTTPS no pudo obtenerse.' }
$healthText = [string]::Join("`n", $healthHeaders)
if ($healthText -notmatch '(?im)^HTTP/\S+\s+200\b') { throw 'El health HTTPS no respondió con HTTP 200 sin redirect.' }
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) { throw 'OpenSSL no está disponible; registrar versión antes de ejecutar la prueba.' }
$opensslVersion = (& openssl version 2>&1 | Out-String).Trim()
if ($opensslVersion -notmatch '^OpenSSL (?:1\.1\.1|[3-9]\.)') { throw "Se requiere OpenSSL 1.1.1 o posterior con -verify_hostname. Detectado: $opensslVersion" }
$handshake = "Q" | & openssl s_client -connect "$env:PRODUCTION_FQDN`:443" -servername $env:PRODUCTION_FQDN -verify_hostname $env:PRODUCTION_FQDN -verify_return_error 2>&1 | Out-String
$handshakeExitCode = $LASTEXITCODE
if ($handshakeExitCode -ne 0 -or $handshake -notmatch 'Verify return code: 0 \(ok\)') { throw "El handshake no validó certificado, hostname y cadena de CA. OpenSSL: $opensslVersion" }
```

Expected: la respuesta HTTP es 3xx, no se sigue y contiene `Location: https://PRODUCTION_FQDN`; el health HTTPS responde HTTP 200 sin redirect; el handshake público valida certificado, hostname y cadena de CA reconocida. Registrar versión de OpenSSL. HSTS no se evalúa, habilita ni modifica en este paso; queda para una decisión controlada posterior.

- [ ] **Step 3: Ensayar rollback por componente en entorno equivalente a producción**

Para API, worker, web, portal y Nginx: desplegar una versión candidata, volver a la imagen anterior identificada por digest y comprobar healthcheck, consumo BullMQ y compatibilidad de la base migrada. Registrar digest origen/destino, ventana y resultado, sin secretos.

Para el componente TLS: conservar de forma segura el material actualmente servido, instalar el certificado candidato, ejecutar `nginx -t`, recargar Nginx con `nginx -s reload`, repetir el handshake público y volver al certificado anterior por digest/versión si cualquier comprobación falla. Registrar ambos resultados sin copiar claves privadas.

- Ejecutar `certbot renew --dry-run` o el comando equivalente del cliente ACME aprobado y archivar su salida.
- Ejecutar `docker compose --profile production --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx-prod nginx -t` antes de cada recarga.
- Ejecutar la recarga controlada y repetir el handshake; archivar el resultado previo y posterior.
- Comprobar que la clave privada existe únicamente en el secret store o volumen protegido aprobado, fuera de Git, imágenes, workflows y logs.

- [ ] **Step 4: Ensayar restores global y por tenant**

Restaurar un backup global en entorno aislado y comprobar `public.tenants`, roles y migraciones. Restaurar un schema tenant en un entorno aislado, ejecutar migraciones requeridas y verificar acceso solo para ese tenant. Comparar el resultado con RPO/RTO aprobados; si no existen objetivos aprobados, G7 sigue NO-GO.

- [ ] **Step 5: Solicitar la decisión CTO con evidencia completa**

El informe G7 debe contener: SHA/release, dominio, evidencia TLS, resultados de rollback y restores, responsables, RPO/RTO, riesgos residuales y veredicto recomendado. Solo el CTO cambia G7 de `NO-GO` a `GO`.

## Verificación final

- [ ] `git status --short` no muestra cambios no intencionales.
- [ ] `git diff --check` termina en 0.
- [ ] ADR-069 (propuesto) permanece `Propuesto`, con recomendación de AI-EM-ARCH y aprobación final CTO pendiente.
- [ ] La evidencia Linux corresponde al SHA que se mergea y confirma 29/0/0/0/0, exit 0 y cleanup OK.
- [ ] QA-34 no bloquea G6/G6.5 y sí bloquea G7.
- [ ] G7 permanece `NO-GO` hasta completar Task 5, emitir recomendación AI-EM-ARCH y obtener aprobación CTO.

## Cobertura del plan

- Separación código/compuerta/registro: Tasks 1 y 3.
- Evidencia local no atribuida al HEAD a mergear: Task 3.
- Laguna `EVIDENCE_UPLOAD_EXPIRED`: Task 4.
- ADR-069 (propuesto) pendiente de aprobación CTO: Task 1.
- QA-34/TLS como prerequisito productivo: Tasks 2 y 5.
- No autorización implícita de G7: Tasks 3 y 5.
