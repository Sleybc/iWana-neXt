# PROMPT-TRANSVERSAL-E2E-R41-INESTABLE-v1.0

Rol: AI-SR-QA (`sr-qa`). Skills: `e2e-testing-patterns`, `systematic-debugging`, `iwana-test-evidence`; clasificación según `e2e-triage`. Lee `AGENTS.md` y `e2e/QUARANTINE.md`. Responde en español; todo en `main`, sin ramas.

**Objetivo:** identificar el test inestable de R4.1 (job «E2E operativo R4.1» de `.github/workflows/ci.yml`), clasificar su causa y, si es del test, corregirlo con evidencia.

**Hecho conocido:** el CI 40613811198 (`a37f3e3b`) dio 305/1/18 en el intento 1 y 306/0/18 en el 2, sin cambios de código. El título no quedó en el log: hasta `d74df717` el provisioner filtraba `E2E_PLAYWRIGHT_FAILED_TEST`. Desde ese commit, R4.1 corre además 17 specs live de MOD05 (322/0/2).

**Pasos:**
1. **Historial.** Revisa las corridas de `main` con R4.1 rojo (`gh run list --branch main --workflow ci.yml`, `gh run view <id> --attempt <n> --log`). Anota por corrida: SHA, intento, marcadores `E2E_PLAYWRIGHT_*` y cualquier título o spec visible. Si una corrida posterior a `d74df717` falló, su `E2E_PLAYWRIGHT_FAILED_TEST=` ya identifica el test: salta al paso 3.
2. **Reproducción local de R4.1**, hasta 3 corridas completas (~30 min cada una):
   - Requisitos: Docker activo; puertos 3000 y 3002 libres. Si los ocupa un proceso de la persona, **pregunta antes de detenerlo**. Build fresco del portal (`pnpm --filter @iwana/portal build`) si su fuente cambió después del último build.
   - Comando (bash): `E2E_TENANT_SLUG="e2e-r1-r41-local$(date +%H%M)" E2E_KEEP_FAILED_PORTAL_REPORT=true E2E_API_LOG=<scratch>/api.log node scripts/e2e-provision-operational.mjs > <scratch>/r41.log 2>&1`. El slug propio es obligatorio: el de `.env.development.local` provocó 500 en cascada.
   - Extrae `E2E_PLAYWRIGHT_FAILED_TEST=` y el error de cada fallo del JSON de `E2E_PLAYWRIGHT_REPORT_PATH`.
   - Ruido local conocido (no es el objetivo): las capturas de `portal-settings-access-ui` y `portal-settings-organization-ui` difieren unos píxeles en Windows; en CI pasan.
3. **Aislamiento.** Si el candidato es un spec con mocks, repítelo solo: `pnpm test:e2e:portal <spec> -g "<título>" --repeat-each=40 --retries=0`. Si es live, compara las 3 corridas y la traza. Reporta la tasa de fallo observada.
4. **Clasificación:** regresión, inestabilidad del test (con su carrera concreta) o entorno. Lee el diff antes de tocar el test (memoria `fixture-obsoleto-puede-ocultar-regresion`).
5. **Corrección**, solo si la causa es del test: espera la señal real (respuesta de red o estado persistido), como en `6a88b320`. Prohibido: esperas fijas, reintentos, `test.fixme`, cuarentena (tope 0). Un defecto de producto se reporta, no se corrige aquí. Verifica con `--repeat-each=40` sin fallos.

**Limpieza obligatoria tras cada corrida:**
- `git checkout -- docs/ apps/portal/next-env.d.ts apps/web/next-env.d.ts`: la suite reescribe capturas de evidencia.
- Borra `storage/` si aparece (archivos sintéticos de la corrida).
- Comprueba que no queden contenedores `*_e2e` (`docker ps`).

**Restricciones:** no modifiques `.env.development.local`; no imprimas contraseñas ni tokens; no hagas commit ni push sin autorización explícita.

**Entregable:** `docs/informes/INFORME-TRANSVERSAL-E2E-R41-INESTABLE-v1.0.md` (verifica antes que la ruta esté libre) con: historial del paso 1, conteos reales por corrida, spec y título del test, causa, clasificación, diff propuesto y evidencia de repeticiones. Si en 3 corridas no reaparece, dilo así; no lo declares resuelto. Cierra con el comando de commit propuesto, sin ejecutarlo.
