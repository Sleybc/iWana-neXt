# ADR-070: Diferimiento de la definición del dominio productivo hasta el cierre del roadmap modular

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-08-02
**Modo activo:** Architect + EM
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano — 2026-08-02
**Módulos:** Plataforma transversal · MOD09 Programación · MOD11 Ejecución Operativa
**Relacionado:** [ADR-022](ADR-022-Politica-Ejecucion-Modular-Por-Fases.md) (cadencia modular) · [ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md) (taxonomía G6 / G6.5 / G7)

---

## Contexto

MOD09 y MOD11 alcanzaron **G6 GO** (calidad) y **G6.5 GO** (merge readiness, CI Linux #112 sobre `1343d6b8`). **G7 permanece NO-GO** porque sus prerrequisitos —dominio productivo, TLS de CA reconocida, rollback por componente ensayado, restore global y por tenant, y targets RPO/RTO aprobados— no están cubiertos.

El prerrequisito raíz es la definición del dominio productivo, escalada al CTO el 2026-07-31 (`RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §8.6). No es un pendiente de ingeniería: arrastra seis inputs de decisión —FQDN, hosting, CA y método ACME, propietario de la zona DNS, ventana operativa, objetivos RPO/RTO— y **modifica la topología de infraestructura**, porque ACME HTTP-01 exige el puerto 80 alcanzable desde Internet. Por la matriz de decisiones del perfil AI-PLAT-OPS, un cambio de topología escala a AI-EM-ARCH con consulta a AI-SEC-ENG.

**El programa no está en producción y su roadmap modular no ha terminado.** Definir la topología productiva hoy significa decidir con información incompleta sobre un producto todavía en construcción, y congelar opciones —método ACME, forma de los FQDN, exposición de red— que dependen de módulos que aún no existen.

### El problema real que este ADR resuelve

El diferimiento **ya estaba decidido de facto**, pero no declarado como tal. Está registrado como *bloqueo*, no como *decisión*:

| Documento | Redacción vigente antes de este ADR |
| --- | --- |
| `RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §8.6 | `Estado: BLOQUEADO — STOP/NO-GO` |
| `INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md` | `Dominio y proveedor de CA para producción — PENDIENTE / ESCALADO — CTO` |
| `INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §15.8 | `bloquea G7 hasta definición de dominio y verificación productiva` |
| `CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md` QA-34 | `[~] DIFERIDO CTO — requisito de G7 pendiente` |

`BLOQUEADO — STOP/NO-GO` es un estado de emergencia operativa. Un lector —o un agente que abra cualquier informe de gate— concluye que hay trabajo detenido esperando una decisión inminente. Eso desvía atención en cada sesión y contamina la lectura de los gates, que es justo lo que ADR-069 acababa de ordenar.

Un pendiente sin dueño ni horizonte se relee indefinidamente. Una decisión con disparador se lee una vez.

## Decisión

**Se difiere formalmente la definición del dominio productivo** y, con ella, la del hosting, la CA y método ACME, la ventana operativa y los targets RPO/RTO. El diferimiento es una decisión aprobada, no un pendiente.

1. **G7 permanece NO-GO por diseño, no por defecto.** ADR-069 ya provee el vocabulario exacto: G6.5 GO autoriza el merge y nunca el despliegue; G7 no se obtiene por cumplir G6.5. El estado actual de MOD09/MOD11 —**G6 GO · G6.5 GO · G7 NO-GO**— es el estado correcto y deliberado del programa, no un fallo ni un trabajo detenido.

2. **No se produce evidencia ficticia.** No se elige dominio, no se registra nada, no se emite certificado, no se decide hosting, no se cablea certbot. Los placeholders `REPLACE_ME_PRODUCTION_DOMAIN` (`nginx/nginx.prod.conf`, `.env.production.example`) y `approval-required` (`.env.production.example`) **se conservan intactos**, y el gate `Block unresolved production prerequisites (R3.5)` de `.github/workflows/ci.yml` mantiene su lógica: un `.env.production` real con placeholders sigue fallando el job.

3. **El foco del programa se mantiene en los módulos faltantes**, conforme a la cadencia de [ADR-022](ADR-022-Politica-Ejecucion-Modular-Por-Fases.md).

4. **Los prerrequisitos de G7 que no dependen del dominio quedan igualmente diferidos**, no porque sean imposibles hoy —restore global, restore por tenant y rollback por digest de API/worker/web/portal son ejecutables sin FQDN— sino porque son ensayos de un release que no se va a planificar. Ejecutarlos ahora produciría evidencia que caducará antes de usarse. Se reactivan con el disparador, no antes.

## Disparador de reactivación

Este ADR se reabre ante **cualquiera** de estas tres condiciones. No requieren ocurrir juntas.

| # | Condición | Naturaleza |
| --- | --- | --- |
| 1 | El último módulo del roadmap queda cerrado conforme a ADR-022 | Planificada |
| 2 | Se necesita un entorno accesible **fuera de la red de desarrollo**: demo a cliente, piloto, UAT externo | Oportunista |
| 3 | **Se procesa PII de personas reales**, aunque el entorno no se llame "producción" | **No negociable** |

**Sobre el disparador 3.** Es independiente de los otros dos y es el control que impide que este diferimiento se convierta en una exposición de datos personales sobre HTTP. La Ley 1581 no distingue entre "producción" y "piloto": lo que importa es si hay datos de personas reales. En el momento en que un tenant real cargue suscriptores, contratos o documentos de identidad, TLS deja de ser un prerrequisito de release y pasa a ser una obligación regulatoria — **aunque el roadmap modular no haya terminado y aunque nadie llame producción a ese entorno**. Quien detecte esa condición emite `[ESCALACION AL CTO]` conforme al protocolo §6.3.

Mientras ninguna de las tres se cumpla, el estado correcto de este expediente es **diferido**, y así debe reportarse en informes, checklists y gates.

## Insumos disponibles al reactivar

Se conservan para no rehacer el análisis. Ninguno caduca por el diferimiento.

| Insumo | Estado | Fuente |
| --- | --- | --- |
| **Dominio** | El CTO **dispone de un dominio de marca ya en uso para marketing**. La opción por defecto al reactivar es un **subdominio de ese dominio** (`app.…` y `portal.…`), no registrar uno nuevo. Elimina el paso de compra y la shortlist | Declaración del CTO, 2026-08-02 |
| **Hosting** | **Sin decidir.** Es la primera pregunta al reactivar, porque determina la viabilidad de ACME HTTP-01 (exige puerto 80 público). El único host que ha existido es `10.0.0.2`, on-prem, IP privada, hoy unreachable | — |
| **Método ACME** | Análisis completo con tres opciones evaluadas; **HTTP-01 recomendada** por AI-PLAT-OPS por ser CA reconocida, automatizable y sin introducir topología nueva | `RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §8.6 |
| **Número de FQDN** | Bastan **dos**: el principal y `portal.<dominio>`. La resolución de tenant va por JWT verificado y header `X-Tenant-Slug`, **nunca por hostname** (`apps/api/src/modules/tenant/tenant.middleware.ts`), así que no hace falta wildcard | Verificado contra el código, 2026-08-02 |
| **Plan de ejecución** | Diseñado y suspendido, no descartado: Tasks 2–5 sirven tal cual | `docs/plans/2026-08-01-mod11-g7-cierre-produccion.md` |
| **Procedimientos** | Rollback por componente (§5), backup/restore global y por tenant (§6), emisión y renovación TLS (§8) están documentados con comandos exactos; **ninguno ejecutado** | `RUNBOOK-RELEASE-ROLLBACK-v1.0.md` |

**Dependencia registrada:** si en algún momento se adopta **subdominio por tenant** (`acme.<dominio>`), el método cambia obligatoriamente a **ACME DNS-01 con wildcard**, que amplía la superficie de secretos (credencial de API del proveedor DNS en secret store). Hoy no es necesario. Esta decisión debe verificarse antes de emitir el primer certificado, no después.

## Riesgos congelados

Hallazgos de la investigación del 2026-08-02 que quedan registrados aquí para que el diferimiento no los pierda.

| # | Riesgo | Ubicación | Severidad al reactivar |
| --- | --- | --- | --- |
| 1 | **`FRONTEND_URL` es `Joi.optional()` y no figura en `.env.production.example`.** Los correos de reset de contraseña y verificación de email saldrían apuntando a `http://localhost:3001` **sin fallo visible al arrancar** — enlaces rotos en el primer entorno externo | `apps/api/src/app.config.ts`, `apps/api/src/modules/auth/auth.service.ts` | Alta |
| 2 | **`CORS_ORIGIN` ausente de `.env.production.example`**, con default de Joi a localhost | `apps/api/src/main.ts`, `apps/api/src/app.config.ts` | Alta |
| 3 | `NEXT_PUBLIC_API_URL` se **bakea en tiempo de build**: cambiar el dominio obliga a reconstruir `web-prod` y `portal-prod`, lo que interactúa con el rollback por digest | `apps/web/Dockerfile`, `apps/portal/Dockerfile`, `docker-compose.prod.yml` | Media — operativa |
| 4 | HSTS en preflight deliberado (`max-age=300`). Subir a un año **solo tras verificar el primer handshake con la CA aprobada**, nunca antes | `nginx/nginx.prod.conf` | Media |
| 5 | No existe `location /.well-known/acme-challenge/` **antes** del `return 301`, ni servicio `certbot` ni sus dos volúmenes compartidos | `nginx/nginx.prod.conf`, `docker-compose.prod.yml` | Media — trabajo previo a la emisión |
| 6 | Referencias de imágenes de infraestructura en `approval-required` (pgBouncer, MinIO, mc, Nginx, Adminer) | `.env.production.example` | Media |

**Los riesgos 1 y 2 son defectos latentes de configuración, no del dominio:** existirían igual con cualquier FQDN y no dependen de ninguna decisión pendiente. Quedan registrados; corregirlos es trabajo de una fase futura y **queda fuera del alcance de este ADR**, que no toca código.

## Consecuencias

**Positivas**

- El expediente deja de leerse como trabajo detenido. `BLOQUEADO — STOP/NO-GO` pasa a `DIFERIDO POR ADR-070`, que es lo que de hecho ocurre.
- G7 NO-GO queda con causa declarada y verificable, en lugar de parecer un fallo del programa.
- El análisis de PLAT-OPS ya hecho —tres opciones ACME, cinco requisitos de entrada, procedimientos de rollback y restore— se conserva íntegro como insumo, no se descarta.
- El disparador 3 convierte una omisión potencial en un control explícito de Ley 1581.
- Es el **primer ADR de infraestructura del repositorio**: ninguno de los 69 anteriores decide hosting, dominio, TLS, DNS ni topología productiva. Establece el precedente de dónde vive esa clase de decisión.

**Negativas / costo**

- La deuda de verificación de release (restores, rollback ensayado) sigue sin saldar y crecerá con cada módulo nuevo: al reactivar, los ensayos cubrirán una superficie mayor.
- Los targets RPO/RTO se fijarán más tarde, con menos margen para influir en el diseño de datos.

**Riesgos**

- **Que el diferimiento se lea como cancelación.** Mitigación: el disparador está en este ADR, no en un informe, y los tres documentos operativos lo citan como autoridad.
- **Que el disparador 3 pase inadvertido** al conectar el primer tenant real. Mitigación: queda declarado como no negociable y con vía de escalación nombrada; es responsabilidad de AI-SEC-ENG y AI-EM-ARCH detectarlo.

## Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin impacto — no altera el modelo de aislamiento por schema ni la resolución de tenant |
| **Seguridad** | Sin impacto inmediato: el sistema no está expuesto. El disparador 3 es el control que impide que el diferimiento derive en exposición de PII sobre HTTP |
| **Escala** | Sin impacto |
| **Regulación** | Ley 1581: cubierta por el disparador 3, que ata la reactivación al procesamiento de datos reales y no a la etiqueta "producción" |
| **Autoridad** | No mueve autoridad entre CTO y AI-EM-ARCH. G7 sigue siendo aprobación exclusiva del CTO (ADR-069) |

## Alternativas descartadas

| Alternativa | Motivo del descarte |
| --- | --- |
| **A — Definir el dominio ahora** | Congela topología, método ACME y forma de los FQDN con información incompleta sobre un producto en construcción, y consume una ventana de decisión del CTO sin beneficio: no habría dónde desplegar lo decidido |
| **B — Dejarlo como pendiente sin ADR** | Es el estado actual y es el que genera el problema: seis documentos lo reportan como bloqueo activo y cada sesión vuelve a evaluarlo. Un pendiente sin horizonte se relee indefinidamente |
| **C — Ejecutar ahora los prerrequisitos que no dependen del dominio** (restores, rollback por digest) | Son ensayos de un release que no se va a planificar. La evidencia caduca antes de usarse, y al reactivar habría que repetirlos sobre una superficie mayor. Cumplir el gate dos veces no lo cumple mejor |

## Referencias

- `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §8 — expediente TLS completo y escalación original del 2026-07-31
- `docs/quality/CHECKLIST-MOD09-MOD11-OT-INSTALACION-v1.0.md` — QA-34
- `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §15.8 y §15.13 — registro vigente de gates
- `docs/informes/INFORME-PLAT-OPS-R3.4-EVIDENCIA-v1.0.md` — inventario de lo no verificado
- `docs/plans/2026-08-01-mod11-g7-cierre-produccion.md` — plan de ejecución suspendido
- `docs/roles/Perfil_IA_Platform_Ops_Engineer_v1.md` §4 — matriz de decisiones de infraestructura
