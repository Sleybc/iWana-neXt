# MOD13 — Triaje del login del portal

**Versión:** 1.0  
**Estado:** En revisión; diagnóstico de T-login entregado, G4 pendiente de nueva ejecución F1-v  
**Fecha:** 2026-10-23 (America/Bogota)  
**Responsable:** AI-E2E-TRIAGE, verificador auxiliar  
**Fuentes:** [plan](../plans/2026-10-22-mod13-aprovisionamiento.md), [encargo §T-login](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md), [F1-v](INFORME-MOD13-PRUEBAS-F1-V-v1.0.md), [HLD v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md), [instant navigation §10](INFORME-PORTAL-FIX-INSTANTNAV-v1.0.md).

## Diagnóstico

El reintento de F1-v tiene una carrera en la prueba: pulsa «Mostrar contraseña» cuando el HTML del formulario ya es visible y accionable para Playwright, pero React todavía no ha conectado sus manejadores. El clic se pierde; esperar después a que cambie el tipo del input no repite la acción. El harness queda detenido antes de enviar credenciales. Se reprodujo en **3/3 páginas nuevas**: el botón carecía de propiedades React antes del primer clic; no cambió el input en 1,5 s; un segundo clic sí lo cambió en los tres casos. La inspección de propiedades React se usó exclusivamente como instrumentación de diagnóstico en memoria.

La hipótesis de que la hidratación nunca termina queda descartada para esta reproducción. La sesión real funciona cuando se espera esa conexión: `POST /api/v1/auth/login` 200, `GET /api/v1/auth/me` 200, `GET /api/v1/users/me` 200 y navegación a `/dashboard`. Una recarga conservó `/dashboard` y volvió a obtener `auth/me` 200. No se demostró una regresión del producto ni de MOD13 en ese flujo.

**Límite:** el primer harness de F1-v no conservó una traza de su envío y retorno a `/auth/login`. Esta revisión explica de forma reproducible el fallo de interactividad del reintento; no atribuye retrospectivamente cada redirección del primer intento a una causa que no fue registrada. El layout protegido sí redirige a `/auth/login` cuando termina la carga sin usuario (`apps/portal/src/app/dashboard/layout-client.tsx:78`); los intentos de catálogo después de una autenticación no completada no demuestran un fallo del catálogo.

Durante el control final se produjo además una caída del entorno: tres nuevos intentos de login recibieron 500 por el proxy; a continuación `GET http://127.0.0.1:3000/api/v1/health` falló con `ECONNREFUSED`. El coordinador confirmó la caída independiente del API durante la preparación de fixtures. Es un segundo bloqueo, posterior al login satisfactorio, y no invalida la evidencia de cookies e hidratación anterior.

Consolidación posterior de la misma ola: el coordinador reinició el API con `pnpm --filter api dev` y comprobó nuevamente health HTTP 200 antes de reanudar FX-v1. No se cambió código del API ni se repitió por ello la suite F1-v. La causa de la caída queda sin determinar.

## Hipótesis contrastadas

| Hipótesis del encargo | Evidencia | Veredicto |
| --- | --- | --- |
| Cookie cae en `127.0.0.1` mientras el portal está en `localhost` | El navegador realizó login y consultas de sesión a `localhost:3002/api/v1/…`; cookies `refreshToken` y `portalAccessToken`, ambas HttpOnly y de dominio `localhost`. Reload conservó la sesión. No se imprimieron valores. | Descartada en el runtime observado. El rewrite al API en `127.0.0.1:3000` se resuelve en el servidor; el navegador opera en el origen del portal. |
| `experimental.instantInsights` y redirect de `/` causan el bucle | Los cambios sin commit siguen presentes durante el login 200 y la recarga satisfactoria. El redirect configurado tiene `source: '/'` y destino `/auth/login`; no coincide con `/dashboard`. No aparecieron errores de instant navigation en las sondas de consola. | No reproducida como causa. No se hizo A/B revirtiendo configuración: queda sin demostrar una relación causal de esos cambios con el síntoma histórico. |
| Borrar `src/app/page.tsx` rompe el login | El archivo raíz está borrado y el redirect de raíz vive en configuración; `/auth/login` carga 200 y la sesión llega a `/dashboard` con ese mismo árbol. | Descartado como impedimento actual; sin atribución retrospectiva al primer intento. |
| `next-env.d.ts` cambia el runtime | El diff solo cambia referencias de tipos generados a `.next/dev/types/…`. No ejecuta código en el navegador. El flujo satisfactorio usa ese mismo archivo. | Sin evidencia causal; no corresponde revertirlo para este diagnóstico. |
| Hidratación dev no termina | Scripts descargados, `document.readyState = complete`, HMR conectado, sin errores de página/CSP ni peticiones de recursos pendientes. El botón adquiere propiedades React y responde al segundo clic. | Descartada la falta permanente de hidratación; confirmada la ventana anterior a conectar eventos. |
| Caída del API durante el control final | Login por proxy 500 en 3/3 intentos; health directo después falla `ECONNREFUSED`. | Entorno; coordinar recuperación del API antes de repetir validación integrada. |

La respuesta del login incluyó CSP con `script-src 'self' 'unsafe-inline' 'unsafe-eval'` y `connect-src 'self'`. No se observaron bloqueos de CSP. Una sonda adicional en `127.0.0.1:3002` también permitió activar el botón; el cambio de host no se propone como arreglo, porque altera el aislamiento de cookies definido en AGENTS.md.

## Clasificación por caso fallido

Los casos originales son un harness `node:test` con Chromium de Playwright ubicado en `%TEMP%`, no specs del runner Playwright. `test-results/.last-run.json` contiene `status: passed` y ninguna prueba fallida: no describe esta corrida. No hay una traza original utilizable que permita inferir el POST histórico. Las líneas siguientes remiten al archivo temporal conservado que se inspeccionó.

| Spec:línea | Proyecto/config | Clase | Evidencia | Siguiente paso y responsable |
| --- | --- | --- | --- | --- |
| `%TEMP%/mod13-f1-portal-live.test.cjs:8` | Chromium headless; `node:test`, portal dev `localhost:3002`; no usa config Playwright | Prueba: carrera anterior a hidratación | Log `mod13-f1-portal-retry.tap`: timeout 20 000 ms esperando `input[autocomplete="current-password"][type="text"]`. En diagnóstico, 3/3 primeros clics sin props React se pierden y 3/3 segundos clics sí funcionan. | `sr-qa`/`fe-platform`: hacer que el harness establezca interactividad antes de rellenar/enviar, conservando el login real como escenario; volver a ejecutar aisladamente. Evitar aumentar el timeout de la espera de un clic ya perdido. |
| `%TEMP%/mod13-f1-portal-live.test.cjs:9` | Mismo harness | Prueba: dependencia del login anterior | Timeout esperando respuesta GET de routers tras el fallo del login. No había sesión completada. | `sr-qa`/`fe-platform`: ejecutar el catálogo solo tras precondición de sesión verificada; no derivar aún un defecto de routers. |
| `%TEMP%/mod13-f1-portal-live.test.cjs:10` | Mismo harness | Prueba: dependencia del login anterior | Timeout esperando respuesta GET de IPv4 tras el fallo del login. No había sesión completada. | Igual: repetir tras login comprobado; no derivar aún un defecto de redes. |
| `[stdin]:2`, repeticiones 1–3 | Un único control aislado repetido con `node:test` y Chromium; mismo portal dev | Entorno | En las tres repeticiones, aserción de login `500 !== 200`; después, health directo `ECONNREFUSED`. | Coordinador/`plat-ops`: recuperar proceso API y comprobar health; si vuelve a caer, derivar el error de runtime sanitizado a `sr-backend`. |

El encargo §T-login admite la clase «prueba», además de regresión y entorno. Aquí se usa para un defecto del harness demostrado; no se etiqueta «flaky» una prueba original que todavía no pasó sin cambios. Conteo de **casos distintos**: prueba 3 (1 raíz y 2 dependientes), entorno 1 repetido tres veces, regresión demostrada 0, flaky confirmado 0. Los seis fallos históricos de dos corridas son repeticiones de esos tres casos de F1-v, no seis defectos distintos.

## Ejecución y conteo

Se ejecutaron sondas por `node` leyendo JavaScript desde stdin de PowerShell, con `require('@playwright/test')`. No se escribieron scripts, tests, configs, trazas, capturas ni estados de sesión. Las credenciales ADMIN se cargaron en memoria desde el entorno con precedencia shell → `.env.development.local` → `.env.development` → `.env`; se abrieron contextos propios y se cerraron solo esos contextos. No se cerraron sesiones ajenas ni se modificaron usuarios, permisos o fixtures.

| Evidencia recogida en este triaje | Resultado |
| --- | --- |
| Sonda inicial de interactividad en localhost | Primer clic sin cambio; sin errores de consola o red |
| Comparación de hosts localhost/127.0.0.1 | Recursos completos en ambos; el resultado del clic depende del momento, no basta para demostrar causalidad del host |
| Experimento del primer y segundo clic en tres páginas nuevas localhost | 3/3 primer clic sin efecto, 3/3 segundo clic con efecto |
| Login real tras conexión de eventos, sesión y recarga | 1 flujo exploratorio satisfactorio, con login/me 200 y cookies del host correcto |
| Control final con `node:test`, un caso repetido tres veces | **1 suite, 3 tests, 0 aprobados, 3 fallidos, 0 omitidos** por caída del API |

Las sondas exploratorias no se convierten en suites o tests aprobados. No se ejecutó la suite completa ni se declaró G4 cerrado. La caída del entorno impidió concluir el control final repetido; se conserva la evidencia anterior y se requiere nueva ejecución tras recuperar servicios.

## Derivación

El trabajo inmediato corresponde a `sr-qa`/`fe-platform` sobre el harness F1-v y a la recuperación del entorno. La carrera aparece en el login general del portal, antes de cualquier ruta MOD13: es ajena al catálogo de MOD13. Este triaje no justifica cambiar cookies, `next.config.ts`, `next-env.d.ts` o la raíz eliminada. Si se decide proteger interacciones de usuarios antes de hidratar como mejora del shell, debe encargarse explícitamente a `fe-platform` con una prueba de regresión; no se implementó aquí.

Única escritura de este bloque: este informe, solicitado por §T-login. Sin commits ni cambios de producto, tests, entorno o contratos.
