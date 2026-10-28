# Informe transversal — inestabilidad E2E R4.1

**Versión:** 1.0  
**Estado:** Borrador — investigación incompleta  
**Fecha:** 2026-10-28  
**Rol:** AI-SR-QA  
**Encargo:** [PROMPT-TRANSVERSAL-E2E-R41-INESTABLE-v1.0.md](../prompts/PROMPT-TRANSVERSAL-E2E-R41-INESTABLE-v1.0.md)

## Resumen

No se identificó el test del fallo único de CI **40613811198**, SHA **a37f3e3b**: el intento 1 registró 305/1/18 y el intento 2, sin cambios entre intentos, 306/0/18; el log del intento fallido no conservó el título. Las tres ejecuciones de R4.1 posteriores a **d74df717** consultadas pasaron 322/0/2. En tres corridas locales completas el fallo objetivo no reapareció; cada una tuvo ocho diferencias conocidas de captura en Windows. La causa del fallo de CI sigue inconclusa y no se declara resuelto.

## Historial de CI en main

Conteos en orden pasaron/fallaron/omitidas. Los logs consultados usan marcadores con **DID_NOT_RUN=0**, **FLAKY=0** y razones de omisión completas.

| Fecha UTC | Run / SHA | Ejecución R4.1 | Evidencia del fallo |
| --- | --- | --- | --- |
| 2026-10-24 | **40096899059** / **9ae4cc8f** | 284/8/18, **EXIT=1** | Rojo histórico distinto. El log de esa versión no publicó un título de test; no hay evidencia para asociarlo al fallo único de octubre 28. |
| 2026-10-28 | **40613811198** / **a37f3e3b**, intento 1 | 305/1/18, **EXIT=1**, 507398 ms | No aparece **E2E_PLAYWRIGHT_FAILED_TEST**; el título no quedó registrado. |
| 2026-10-28 | **40613811198** / **a37f3e3b**, intento 2 | 306/0/18, **EXIT=0**, 482488 ms | El fallo no se repitió en el segundo intento. |
| 2026-10-28 | **40670635103** / **a7fceace** | 306/0/18, **EXIT=0** | R4.1 pasó; no hubo test fallido cuyo título extraer. |
| 2026-10-28 | **40730762383** / **d74df717** | 322/0/2, **EXIT=0** | Primera ejecución consultada después de añadir las 17 specs live de MOD05. |
| 2026-10-28 | **40733919484** / **385c7261** | 322/0/2, **EXIT=0** | R4.1 pasó. |
| 2026-10-28 | **40736981170** / **2853ba26** | 322/0/2, **EXIT=0** | R4.1 pasó. |

No se encontró una ejecución R4.1 fallida posterior a **d74df717**; por ello, el nuevo marcador de título no señaló el candidato. La cuarentena de **e2e/QUARANTINE.md** tiene cero filas.

## Corridas locales 1–3

Docker estaba activo. Los puertos 3000 y 3002 estaban ocupados por procesos **node**; tras autorización explícita se detuvieron los PID 24116 y 31232 y ambos puertos quedaron libres. No había fuentes de **apps/portal** modificadas, por lo que no se ejecutó un build separado.

Se lanzó **node scripts/e2e-provision-operational.mjs** con **E2E_KEEP_FAILED_PORTAL_REPORT=true** y **E2E_API_LOG** en el directorio temporal. Cada corrida usó un slug propio. No se modificó **.env.development.local**.

| Corrida | Slug | Pasaron | Fallaron | Omitidas | No ejecutadas | Flaky | Duración |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Local 1, Windows | **e2e-r1-r41-local20261028a1** | 315 | 8 | 1 | 0 | 0 | 557031 ms |
| Local 2, Windows | **e2e-r1-r41-local20261028a2** | 315 | 8 | 1 | 0 | 0 | 537591 ms |
| Local 3, Windows | **e2e-r1-r41-local20261028a3** | 315 | 8 | 1 | 0 | 0 | 500118 ms |

En las tres corridas el provisionamiento terminó con **E2E_SETUP=OK** y el runner registró **E2E_CLEANUP=OK**. Los informes JSON fallidos y los logs de API se conservaron en el directorio temporal.

La única omisión fue **portal-mod05-deuda-fiscal-live.spec.ts:1346**: la base recién migrada no tiene filas anteriores a la migración 153; el mapeo está cubierto por la prueba de integración de migración. El marcador registró **SKIP_REASON_COUNT=1** y **MISSING_SKIP_REASONS=0**.

En cada corrida, los ocho fallos fueron cuatro variantes de cada uno de estos tests:

- **portal-settings-access-ui.spec.ts:681**, «Portal settings access UI»: «cumple overflow, target 44px, axe y captura en desktop dark», desktop light, tablet dark y tablet light.
- **portal-settings-organization-ui.spec.ts:569**, «Portal settings organization UI»: las mismas cuatro variantes.

El error de la primera línea del JSON para cada variante fue **expect(page).toHaveScreenshot(expected) failed**. En las corridas 2 y 3 el diff fue de 82 o 175 píxeles (ratio 0.01). Son las diferencias pequeñas en Windows ya documentadas por el prompt, y no coinciden con el fallo único sin título de CI. Se clasifican como **entorno** y no como el candidato investigado.

Durante la corrida 2, el usuario informó que otra sesión retiró **storage/** cerca de las 13:42 (America/Bogota), unos 5–6 minutos después de levantar los contenedores. Los cuatro casos de **portal-privacy-fase-1b-live.spec.ts** pasaron en esa corrida y en la corrida 3; no hubo fallo al leer el soporte de documento ni evidencia que justificara repetir una corrida por interferencia. **storage/** se volvió a crear y quedó ignorado por Git.

## Clasificación y cambios

| Incidente | Clasificación | Fundamento |
| --- | --- | --- |
| Ocho capturas por corrida local (tres corridas) | Entorno | Dos specs de screenshot, cuatro variantes cada uno; se repitieron sin cambio en Windows. El prompt reconoce esta diferencia local y señala que pasan en CI. |
| Un fallo de CI en **40613811198**, intento 1 | Inconcluso | El nombre y el error no se conservaron; no reapareció en tres corridas locales, pero esa evidencia no identifica ni resuelve la causa. |
| Ocho fallos en **40096899059** | Sin relación demostrada | Es un run anterior, con conteo y contexto distintos; el log disponible no conserva los títulos. |

Se leyó el diff de las specs live CRM y MOD05 y de **Select** antes de considerar cambios. Durante la primera corrida, **main** avanzó de **2853ba26** a **e564e2ff** y luego a **caf7eed4**. El primer commit incorporó el cambio de la spec live CRM y el prompt; el segundo, el ajuste de **Select** y la spec de MOD05. La corrida se lanzó con esos diffs presentes en el árbol de trabajo; como el HEAD cambió durante la ejecución, no debe tratarse como reproducción contra un SHA inmutable. Esta sesión no modificó tests ni producto, no propuso cuarentena y no inició **--repeat-each=40** porque aún no existe un candidato.

**Diff propuesto:** ninguno hasta identificar y clasificar el test del fallo original. No se propone cambiar esperas, agregar reintentos, **fixme** ni cuarentena.

## Limpieza y conclusión

Después de cada corrida se ejecutó **git checkout -- docs/ apps/portal/next-env.d.ts apps/web/next-env.d.ts**. Al terminar la tercera no quedan contenedores **\*_e2e** y 3000/3002 están libres. **storage/** está ignorado por Git; según la instrucción actualizada del usuario, no se requiere borrarlo al cerrar cada corrida.

En tres corridas completas el fallo objetivo no reapareció. No se conoce el título ni el error original, por lo que no se pudo aislar un candidato con **--repeat-each=40** ni se propone una corrección. El resultado se registra como no reproducido localmente, no como resuelto.

No se hizo commit ni push.

**Comando de commit propuesto (no ejecutado):**

~~~powershell
git add docs/informes/INFORME-TRANSVERSAL-E2E-R41-INESTABLE-v1.0.md
git commit -m "docs(e2e): report R4.1 instability investigation"
~~~
