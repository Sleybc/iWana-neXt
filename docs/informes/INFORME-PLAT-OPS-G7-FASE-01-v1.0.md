# INFORME PLAT-OPS G7 — Fase 1 (defectos latentes de configuración)

**Versión:** 1.0
**Fecha:** 2026-08-05
**Modo activo:** Orchestrator + EM
**Autor:** AI-EM-ARCH
**Agentes ejecutores:** AI-SR-FULL (Fase 1) · AI-SEC-ENG (dictamen de riesgo, consulta)
**Plan ejecutado:** [PROMPT-PLAT-OPS-G7-AUTORIZACION-PRODUCCION-v1.0.md](../prompts/PROMPT-PLAT-OPS-G7-AUTORIZACION-PRODUCCION-v1.0.md)
**ADRs de referencia:** [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) · [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado) · [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md)
**Estado:** Fase 1 **GO** · Puerta 0 **abierta** · G7 **NO-GO** (ADR-070 (superado) vigente)

---

## 1. Alcance ejecutado y no ejecutado

La **Puerta 0 del plan no está cerrada**: no existe ADR de reapertura, ADR-070 (superado) sigue
`Aprobado` y vigente, las seis decisiones del CTO no se han tomado y el disparador 3 no
tiene dictamen. Conforme al §10 del propio plan, **solo se autorizó la Fase 1**.

| Fase | Estado | Motivo |
| --- | --- | --- |
| F0 — Reapertura y decisiones del CTO | **No ejecutada** | Requiere actos del CTO. Es la escalación de §5 |
| F1 — Defectos latentes | **Ejecutada — GO** | No depende de decisiones pendientes |
| F2 — Preparación TLS | No ejecutada | Bloqueada por Puerta 0 |
| F3 — Ensayos rollback/restore | No ejecutada | Bloqueada por Puerta 0 (ADR-070 (superado) §4 los difiere) |
| F4 — RPO/RTO | No ejecutada | Depende de F3 |
| F5 — Emisión TLS | No ejecutada | Requiere infraestructura real |
| F6 — Recomendación | No ejecutada | Requiere F0–F5 y G6.5 de MOD09 consolidado |

---

## 2. Entregables de la Fase 1

| Ítem | Resultado |
| --- | --- |
| **F1.1** `FRONTEND_URL` | Obligatoria con `NODE_ENV=production` vía `Joi.when`; rechaza además todo hostname `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `*.localhost` |
| **F1.2** `CORS_ORIGIN` | Ídem, validando cada entrada de la lista por separado |
| **F1.3** `NEXT_PUBLIC_API_URL` | Documentada la interacción con el rollback por digest en el runbook §2.2 y §5.2. Sin rediseño |
| **F1.4** `approval-required` | Inventariadas las cuatro con la decisión que desbloquea cada una. **Ningún valor sustituido** |

**Decisión de alcance del ejecutor, revisada y aprobada:** AI-SR-FULL endureció más allá
de "exigir presencia", rechazando también valores localhost escritos a mano. Es correcto:
exigir presencia sola no impedía reproducir el riesgo 1 de ADR-070 (superado).

**Dos desviaciones declaradas por el ejecutor, ambas aprobadas:**

1. `docker-compose.prod.yml` — `api-prod` no recibía ninguna de las dos variables. Sin
   ese cableado el endurecimiento habría impedido arrancar `api-prod` con un
   `.env.production` aparentemente correcto. Verificado: usa el mismo patrón `${VAR:?}`
   de otras ocho variables del servicio y **no introduce valores reales**.
2. `app.module.config.spec.ts` — su fixture de producción estaba incompleto respecto al
   nuevo contrato. Corrección correcta.

---

## 3. Evidencia de gates (verificada por AI-EM-ARCH, no solo reportada)

| Verificación | Resultado |
| --- | --- |
| `apps/api` suite completa | **2930 pasan · 21 fallan · 15 skipped** (2966) |
| Los 21 fallos | Íntegramente `clamp-page-endpoints.controller.http.spec.ts`, **baseline preexistente** verificado contra el commit base en auditorías previas. No aumentaron |
| `tsc --noEmit` | exit 0 |
| Placeholders `REPLACE_ME_PRODUCTION_DOMAIN` | Intactos y **aumentados** (1→3 en `.env.production.example`, 2 en `nginx.prod.conf`): las variables nuevas nacen con placeholder |
| `approval-required` | 4→5 por documentación añadida. **Ningún valor sustituido** |
| Gate `Block unresolved production prerequisites (R3.5)` | **No tocado** (`git diff` vacío) |
| `audit:adr-citations` | BLOQUEANTE: 0 |

**Puerta 1 cerrada:** en perfil producción la aplicación falla al arrancar sin esas
variables, con mensaje explícito; fuera de producción el comportamiento no cambia.

---

## 4. Deuda registrada

| Severidad | Hallazgo | Origen |
| --- | --- | --- |
| **Alta** | Hashes deterministas SHA-256 **sin sal** sobre documento, correo y teléfono: permiten recuperación por fuerza bruta offline **sin poseer la clave AES**. Espacio de entrada enumerable | SEC-ENG §A.3 |
| **Alta** | PII en `audit_logs` **append-only**: nombre del titular por llamada directa que evade el interceptor, y `latitude`/`longitude` ausentes de la denylist — con escritura del 2026-08-03 | SEC-ENG §A.5 |
| **Media** | Identidad, domicilio, fecha de nacimiento y geolocalización **sin cifrar**; `subscribers.nit` en claro bajo columna `VARCHAR(500)` que aparenta ser cifrada | SEC-ENG §A.4 |
| **Media** | ADR-058 fase 2 (`PII_ENCRYPTION_KEY` separada de `MFA_ENCRYPTION_KEY`) **aprobada y sin ejecutar** | SEC-ENG §A.2 |
| **Media** | `rejectUnauthorized: false` en TLS hacia la base — **séptimo riesgo congelado no registrado en ADR-070 (superado)** | SEC-ENG §B.3 |
| **Media** | `FRONTEND_URL` es un valor único, pero el despliegue tiene **dos** frontends. Los enlaces de reset y verificación usarían el dominio de consola también para usuarios de portal | SR-FULL |
| Baja | `staging` queda fuera del endurecimiento, coherente con el resto de variables endurecidas. Ampliarlo sería decisión de alcance | SR-FULL |

Ninguna deuda **crítica** abierta. Las dos **altas** son de seguridad y preceden a
cualquier operación con datos reales — ver §5.

---

## 5. Decisiones que requieren al CTO

**Bloquean la Puerta 0 y, con ella, las fases 2 a 6.**

1. **Determinación del disparador 3** — la pregunta de una sola respuesta (ver §6).
2. **Las seis decisiones de F0.2** — FQDN, hosting, CA y método ACME, propietario de la
   zona DNS, ventana operativa, targets RPO/RTO.
3. **ADR de reapertura** de ADR-070 (superado), que solo el CTO aprueba.
4. **Destrabar G6.5 de MOD09** — hoy suspendido por orden del CTO, rama sin mergear. Es
   prerrequisito de F6: G7 no se autoriza sobre trabajo no integrado.

---

## 6. Dictamen del disparador 3 (AI-SEC-ENG) — resumen ejecutivo

AI-SEC-ENG descartó **por evidencia** todas las vías automatizadas de creación del
expediente de `tenant_iwana`: no hay seed de personas, los E2E de CRM interceptan la red
y no escriben en base, ninguna migración inserta expedientes. Fue **capturado a mano** por
un usuario `ADMIN`, con nueve días de seguimiento operativo (conversión a suscriptor,
perfil tributario, 3 órdenes de ejecución, 3 eventos de agenda).

**Lo que la evidencia técnica no puede establecer** —y que correctamente no inventó— es si
la persona existe. `consent_records = 0`: no hay registro de autorización del titular.

**Mitigantes reales y sustanciales:** cifrado AES-256-GCM verificado sobre los ciphertext
reales, toda la infraestructura de datos en loopback sin una sola publicación en
`0.0.0.0`, aislamiento multi-tenant íntegro en las 55 schemas, superficie mínima (1
titular, sin escaneos documentales).

**Exposición efectiva hoy: nula** — las aplicaciones no están corriendo. Se materializa
cada vez que se levanta `pnpm dev`, porque API, web y portal ligan a todas las interfaces
sin TLS, y su alcance es el segmento de red del equipo en ese momento.

Ese matiz es la diferencia entre "apagar todo hoy" y "decidir antes de la próxima sesión
de desarrollo". La lectura de AI-SEC-ENG, que comparto, es la segunda.

---

## 7. Registro de gates

| Gate | Estado |
| --- | --- |
| **G6** (calidad, Fase 1) | **GO** — evidencia §3 |
| **G6.5** (merge readiness) | **No evaluado** en esta fase; sin corrida Linux de CI por SHA |
| **G7** (autorización de producción) | **NO-GO** — ADR-070 (superado) vigente. Ningún agente lo marca; es competencia exclusiva del CTO (ADR-069) |

---

## 8. Referencias

- [PROMPT-PLAT-OPS-G7-AUTORIZACION-PRODUCCION-v1.0.md](../prompts/PROMPT-PLAT-OPS-G7-AUTORIZACION-PRODUCCION-v1.0.md)
- [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) · [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado) · [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md)
- [RUNBOOK-RELEASE-ROLLBACK-v1.0.md](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md) §2.2, §5.2
