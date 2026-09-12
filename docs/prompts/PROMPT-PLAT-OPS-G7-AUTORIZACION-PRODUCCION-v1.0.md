# PLAN DE EJECUCIÓN — Camino a G7 (autorización de producción)

**Módulos:** Plataforma transversal · MOD09 · MOD11
**Código:** PLAT-OPS-G7
**Versión:** 1.0
**Fecha:** 2026-08-05
**Generado por:** AI-EM-ARCH (modo Architect + Orchestrator)
**Agentes destinatarios:** AI-PLAT-OPS (infraestructura, CI/CD, ensayos), AI-SR-FULL (defectos de configuración), AI-SEC-ENG (revisión TLS y exposición)
**Revisor obligatorio:** AI-SR-QA
**Autoridad de aprobación:** **CTO — exclusiva e indelegable** ([ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md))
**ADRs de referencia:** [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) · [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado) · [ADR-022](../adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md)
**Insumos conservados:** [RUNBOOK-RELEASE-ROLLBACK-v1.0.md](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md) §5, §6, §8 · [plan suspendido](../plans/2026-08-01-mod11-g7-cierre-produccion.md)

---

## 0. Lo que este plan NO puede hacer, y por qué

Léelo antes de empezar. Ignorarlo produce evidencia inválida y rompe un ADR aprobado.

**G7 no se "deja en GO" desde un agente.** ADR-069 §3 lo define como *production
authorization*: AI-EM-ARCH **recomienda** y el **CTO aprueba**. Ningún agente —ni
AI-EM-ARCH— puede marcarlo GO. Este plan produce la evidencia que sostiene esa
recomendación; la firma es del CTO.

**ADR-070 (superado) está vigente y difiere estos prerrequisitos.** Trabajar contra él sin
reabrirlo formalmente es una violación de gobernanza. Por eso la Fase 0 es bloqueante:
sin ese ADR de reapertura, **este plan no arranca**.

**ADR-070 (superado) §2 prohíbe la evidencia ficticia.** No inventes dominio, no registres nada,
no emitas certificado, no decidas hosting, no cablees `certbot` "de ejemplo". Los
placeholders `REPLACE_ME_PRODUCTION_DOMAIN` y `approval-required` se conservan hasta que
exista decisión real. El gate `Block unresolved production prerequisites (R3.5)` de
`.github/workflows/ci.yml` se mantiene y **no se toca**.

**Actos materiales fuera del alcance de cualquier agente:** adquirir o delegar un
dominio, crear registros DNS, exponer el puerto 80 a Internet, contratar hosting,
completar un desafío ACME contra una CA real. Son del CTO o de quien opere la
infraestructura. El plan los deja preparados y verificables, no ejecutados.

**Precedencia de gates.** G7 no puede ir por delante de un merge no consolidado. Hoy
**MOD09 tiene G6.5 suspendido** y su rama sin mergear. Cerrar eso es prerrequisito de
la Fase 6, no de este plan, pero condiciona su final.

---

## 1. Objetivo

**Resultado esperado:** todos los prerrequisitos de G7 que no exigen un acto material del
CTO quedan cerrados y verificados con evidencia reproducible, de modo que la única
distancia restante hasta la autorización sean las seis decisiones humanas y la emisión
real del certificado.

### Prerrequisitos de G7 (ADR-069 §3) y su tratamiento

| # | Prerrequisito | Fase | Ejecutable por agente |
| --- | --- | --- | --- |
| P1 | Dominio productivo | F0 | **No** — decisión del CTO |
| P2 | TLS de CA reconocida | F2 (preparación) · F5 (emisión) | Preparación sí; emisión **no** |
| P3 | Rollback por componente ensayado | F3 | **Sí** |
| P4 | Restore global verificado | F3 | **Sí** |
| P5 | Restore por tenant verificado | F3 | **Sí** |
| P6 | Targets RPO/RTO aprobados | F4 | Propuesta sí; aprobación **no** |

---

## 2. Fase 0 — Reapertura formal y decisiones del CTO (BLOQUEANTE)

**Rol:** AI-EM-ARCH. **Ninguna otra fase arranca sin cerrar esta.**

### F0.1 — ADR de reapertura

Redactar un ADR nuevo con el **siguiente número libre** de `docs/adrs/` (hoy el último
ocupado es el 077; **no escribas un número que aún no exista como archivo o romperás el
gate de integridad de citas**). Contenido mínimo:

- Declara qué disparador de ADR-070 (superado) se activó (1 roadmap cerrado, 2 entorno externo,
  3 PII real) o, si es una reapertura por decisión directa del CTO, lo dice así con esas
  palabras.
- Deja ADR-070 (superado) en estado `Superado` **solo cuando el nuevo ADR esté aprobado**, y lo cita
  como genealogía con el marcador correspondiente.
- Recoge las seis decisiones de F0.2 ya resueltas. Un ADR de reapertura sin ellas no
  sirve para nada.

### F0.2 — Las seis decisiones que solo el CTO puede tomar

Se recogen como insumo, no se infieren ni se proponen por defecto:

| # | Decisión | Insumo ya disponible (ADR-070 (superado) §Insumos) |
| --- | --- | --- |
| 1 | **FQDN** | El CTO dispone de dominio de marca en uso; la opción por defecto es subdominio (`app.…`, `portal.…`). Bastan **dos** FQDN: la resolución de tenant va por JWT y `X-Tenant-Slug`, nunca por hostname |
| 2 | **Hosting** | **Sin decidir.** Es la primera pregunta: determina si ACME HTTP-01 es viable (exige puerto 80 público) |
| 3 | **CA y método ACME** | HTTP-01 recomendada por AI-PLAT-OPS. **Si se adopta subdominio por tenant, cambia obligatoriamente a DNS-01 con wildcard** y amplía la superficie de secretos |
| 4 | **Propietario de la zona DNS** | — |
| 5 | **Ventana operativa** | — |
| 6 | **Targets RPO/RTO** | Se proponen en F4; se aprueban aquí |

### F0.3 — Resolver el disparador 3 antes que nada

`tenant_iwana` conserva **un expediente creado el 2026-07-25 con documento, teléfono y
correo poblados** (columnas `_encrypted`). Debe determinarse si corresponde a una
**persona real**.

- Si lo es: el disparador 3 de ADR-070 (superado) está activo, la reapertura es **obligación
  regulatoria** (Ley 1581) y no una decisión de calendario. TLS pasa a ser prioridad
  sobre el resto del roadmap.
- Si es dato de prueba: se registra como verificado y la reapertura se sostiene en el
  disparador que corresponda.

**Puerta 0:** ADR de reapertura aprobado por el CTO, con las seis decisiones resueltas y
el disparador 3 dictaminado. Sin esto, **detente y escala**.

---

## 3. Fase 1 — Defectos latentes de configuración (no dependen del dominio)

**Rol:** AI-SR-FULL. Son los riesgos 1–6 registrados en ADR-070 (superado) §Riesgos congelados.
**Esta fase sí puede ejecutarse en paralelo a F0**, porque no depende de ninguna decisión.

| # | Defecto | Ubicación | Severidad |
| --- | --- | --- | --- |
| F1.1 | `FRONTEND_URL` es `Joi.optional()` y falta en `.env.production.example`. Los correos de reset y verificación saldrían a `http://localhost:3001` **sin fallo visible al arrancar** | `apps/api/src/app.config.ts:91`, `apps/api/src/modules/auth/auth.service.ts` | **Alta** |
| F1.2 | `CORS_ORIGIN` ausente de `.env.production.example`, con default de Joi a localhost | `apps/api/src/app.config.ts:82`, `apps/api/src/main.ts` | **Alta** |
| F1.3 | `NEXT_PUBLIC_API_URL` se bakea en build: cambiar dominio obliga a reconstruir `web-prod` y `portal-prod`, lo que interactúa con el rollback por digest. **Documentar la interacción**, no rediseñar | `apps/web/Dockerfile`, `apps/portal/Dockerfile` | Media |
| F1.4 | Referencias de imágenes de infraestructura en `approval-required` | `.env.production.example` | Media |

**Criterio para F1.1 y F1.2:** en perfil de producción deben ser **obligatorias y sin
default a localhost** — que la app **falle al arrancar** si faltan, en lugar de enviar
correos rotos en silencio. Fail-fast con Joi, coherente con `app.module.ts`.

**Puerta 1:** un arranque en perfil producción sin esas variables falla con mensaje
explícito; con ellas, arranca. Test que lo demuestre.

---

## 4. Fase 2 — Preparación de TLS (sin emitir)

**Rol:** AI-PLAT-OPS. **Consulta obligatoria:** AI-SEC-ENG.

| # | Alcance |
| --- | --- |
| F2.1 | `location /.well-known/acme-challenge/` **antes** del `return 301` en `nginx/nginx.prod.conf` (riesgo 5 de ADR-070 (superado)) |
| F2.2 | Servicio `certbot` en `docker-compose.prod.yml` con sus dos volúmenes compartidos, **sin credenciales ni dominio reales** |
| F2.3 | HSTS permanece en `max-age=300`. **Se sube a un año solo en F5**, tras verificar el primer handshake con la CA aprobada — nunca antes (riesgo 4) |
| F2.4 | Procedimiento de renovación automática documentado y probado en seco |

**Restricción dura:** los placeholders siguen en su sitio al terminar esta fase. Si tu
cambio obliga a sustituir `REPLACE_ME_PRODUCTION_DOMAIN` para que algo funcione,
**detente**: significa que estás ejecutando F5 antes de tiempo.

**Puerta 2:** `docker compose -f docker-compose.prod.yml config` valida; el gate R3.5 de
CI sigue fallando ante un `.env.production` con placeholders (comprobado, no asumido).

---

## 5. Fase 3 — Ensayos de rollback y restore

**Rol:** AI-PLAT-OPS. **Ejecutables hoy sin FQDN.** Procedimientos ya documentados con
comandos exactos en el runbook §5 y §6; **ninguno se ha ejecutado nunca**.

| # | Ensayo | Prerrequisito G7 |
| --- | --- | --- |
| F3.1 | Rollback por digest de `api`, `worker`, `web` y `portal`, componente a componente | P3 |
| F3.2 | Restore **global** desde backup, con verificación de integridad | P4 |
| F3.3 | Restore **por tenant** individual, sin afectar a los demás schemas | P5 |
| F3.4 | Medición de tiempos reales de cada ensayo → alimenta F4 | P6 |

**Criterio de aceptación:** cada ensayo produce evidencia con marca de tiempo, comando
ejecutado y resultado observado. Un procedimiento documentado y no ejecutado **no cuenta
como verificado** (ADR-069 §3).

**Atención al aislamiento multi-tenant en F3.3:** el restore de un tenant no puede tocar
`public` ni otros schemas. Si el procedimiento del runbook no lo garantiza, es un
hallazgo — repórtalo, no lo improvises.

**Puerta 3:** los tres ensayos ejecutados con evidencia reproducible.

---

## 6. Fase 4 — RPO/RTO

**Rol:** AI-PLAT-OPS propone; **CTO aprueba**.

Propuesta basada en los tiempos **medidos** en F3.4, no en estimaciones. Debe declarar:
frecuencia de backup, ventana de pérdida aceptable, tiempo objetivo de recuperación
global y por tenant, y qué pasa si no se cumplen.

**Puerta 4:** targets aprobados por el CTO y registrados en el ADR de reapertura o en un
anexo citado por él.

---

## 7. Fase 5 — Emisión real de TLS (requiere infraestructura)

**Rol:** AI-PLAT-OPS **acompañando al operador humano**. No es ejecutable en solitario.

| # | Alcance |
| --- | --- |
| F5.1 | Sustituir placeholders por el FQDN aprobado en F0.2 |
| F5.2 | Emitir certificado con la CA aprobada mediante el método aprobado |
| F5.3 | Verificar el handshake y la cadena completa desde fuera de la red |
| F5.4 | **Solo entonces**, subir HSTS a un año |
| F5.5 | Verificar renovación automática |

**Puerta 5:** handshake verificado externamente contra la CA aprobada, con evidencia.

---

## 8. Fase 6 — Recomendación y autorización

**Rol:** AI-EM-ARCH redacta la recomendación. **El CTO aprueba o no.**

Prerrequisitos de esta fase:

1. Puertas 0 a 5 cerradas con evidencia.
2. **MOD09 con G6.5 consolidado** — hoy suspendido, rama sin mergear. G7 no puede
   autorizarse sobre trabajo que ni siquiera está integrado.
3. Informe en `docs/informes/` con el estado de P1 a P6, uno por uno, sin agregados.

**El informe registra G6, G6.5 y G7 por separado** (ADR-069 §Reglas). Está **prohibido**
marcar G7 GO por haber construido una imagen Docker correctamente, o por haber cumplido
G6.5.

---

## 9. Restricciones duras (todas las fases)

1. **No fabricar evidencia.** Un procedimiento documentado no es un procedimiento
   verificado. Un placeholder sustituido por un valor inventado es una violación de
   ADR-070 (superado) §2.
2. **No tocar el gate R3.5** de `.github/workflows/ci.yml`.
3. **No decidir por el CTO** ninguna de las seis decisiones de F0.2.
4. **No marcar G7 como GO.** Ningún agente tiene esa autoridad.
5. **Sin PII** en logs, evidencia, capturas ni informes. Los ensayos de restore trabajan
   con datos que pueden ser reales: la evidencia lleva conteos y tiempos, nunca valores.
6. **Cambios de topología escalan** a AI-EM-ARCH con consulta a AI-SEC-ENG (matriz de
   decisiones AI-PLAT-OPS). Exponer el puerto 80 es un cambio de topología.
7. Citar ADRs conforme al gate: `node scripts/audit-adr-citations.mjs docs/` debe
   terminar con **BLOQUEANTE: 0**.

---

## 10. Cuándo detenerte y escalar

- La Fase 0 no se cierra: **no arranques ninguna otra fase salvo la 1**.
- El disparador 3 resulta activo (PII real): **escala de inmediato**; cambia la prioridad
  del programa completo, no solo la de este plan.
- Un ensayo de restore por tenant afecta a otro schema: es un hallazgo de aislamiento
  multi-tenant, de severidad alta.
- La decisión de hosting hace inviable HTTP-01: el método ACME cambia y con él la
  superficie de secretos. Es decisión de arquitectura con revisión de seguridad.
- Cualquier tentación de sustituir un placeholder para "poder avanzar".

---

## 11. Nota sobre el encargo

Este plan se redactó a petición de dejar G7 en GO. **G7 no se deja en GO desde aquí**: se
gana con los prerrequisitos de ADR-069 §3 y lo firma el CTO. Lo que este plan entrega es
la totalidad del trabajo que sí puede hacerse, ordenado de forma que al final la
distancia hasta la firma sean únicamente decisiones humanas y actos de infraestructura —
no deuda de ingeniería.
