# ADR-078: Reapertura del expediente de dominio productivo por procesamiento de PII real

**Versión:** 1.0
**Estado:** Propuesto
**Fecha:** 2026-08-05
**Modo activo:** Architect + EM
**Autor:** AI-EM-ARCH
**Aprobación requerida:** CTO
**Módulos:** Plataforma transversal · MOD05 CRM · MOD09 · MOD11
**Sucede a:** [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) — se marcará `Superado` **solo** cuando este ADR quede aprobado
**Relacionado:** [ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md) (taxonomía de gates) · [ADR-058](ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) (cifrado PII/MFA)
**Evidencia:** [INFORME-PLAT-OPS-G7-FASE-01-v1.0.md](../informes/INFORME-PLAT-OPS-G7-FASE-01-v1.0.md) §6

---

## Contexto

ADR-070 difirió formalmente la definición del dominio productivo y fijó tres disparadores
de reactivación. El tercero es **no negociable**: *"Se procesa PII de personas reales,
aunque el entorno no se llame producción"*.

El 2026-08-05, tras el dictamen de AI-SEC-ENG solicitado por AI-EM-ARCH, **el CTO
determinó que el expediente del 2026-07-25 en `tenant_iwana` corresponde a una persona
identificable**.

### El disparador 3 está activo

Con esa determinación, la reapertura deja de ser una decisión de calendario y pasa a ser
una condición ya cumplida del propio ADR-070. No requiere que el roadmap modular termine
ni que exista un entorno externo: los disparadores son independientes entre sí.

### Hechos técnicos verificados (dictamen AI-SEC-ENG, 2026-08-05)

**Mitigantes reales, no cosméticos:**

- Cifrado AES-256-GCM verificado sobre los ciphertext reales de documento, teléfono y
  correo, con IV por escritura, authTag y validación fail-fast de la clave.
- **Toda la infraestructura de datos ligada a loopback**, sin una sola publicación en
  `0.0.0.0`: Postgres, Redis, pgBouncer, MinIO, Typesense y el proxy.
- Aislamiento multi-tenant íntegro: barrido de las 55 schemas sin fugas cruzadas.
- Superficie mínima: 1 titular, sin escaneos documentales cargados.

**Exposición efectiva:** **nula mientras las aplicaciones no corran**. Se materializa cada
vez que se levanta `pnpm dev`, porque API, web y portal ligan a **todas las interfaces sin
TLS**, y su alcance es el segmento de red del equipo en ese momento. En red doméstica
aislada el riesgo real es bajo; en oficina, coworking o Wi-Fi compartido es alto y no
requiere sofisticación para explotarse.

**Deudas de seguridad que preceden a cualquier operación con datos reales:**

| # | Hallazgo | Severidad |
| --- | --- | --- |
| S-1 | Hashes de documento, correo y teléfono con **SHA-256 sin sal** sobre espacio de entrada enumerable: permiten recuperación por fuerza bruta offline **sin poseer la clave AES** | **Alta** |
| S-2 | PII en `audit_logs` **append-only por trigger**: nombre del titular por llamada directa que evade el interceptor, y `latitude`/`longitude` ausentes de la denylist, con escritura del 2026-08-03. **No es borrable por la vía normal** | **Alta** |
| S-3 | Identidad, domicilio, fecha de nacimiento y geolocalización sin cifrar; `subscribers.nit` en claro bajo columna `VARCHAR(500)` que aparenta ser cifrada | Media |
| S-4 | ADR-058 fase 2 (`PII_ENCRYPTION_KEY` separada de `MFA_ENCRYPTION_KEY`) aprobada y sin ejecutar | Media |
| S-5 | `rejectUnauthorized: false` en TLS hacia la base — **séptimo riesgo congelado que ADR-070 no registra** | Media (Alta al reactivar) |

### Base legal del tratamiento — declaración del CTO

El CTO declara (2026-08-05) que **el cumplimiento de la Ley 1581 se gestiona de forma
manual**: mediante los permisos de cada usuario y la autorización que cada titular otorga;
si el titular está autorizado, los datos pueden tratarse.

Esta decisión se registra como dada. Su **implicación técnica**, que no la contradice, es
que `consent_records` está en **cero**: la tabla existe desde la migración 001 con
`consent_type`, `legal_text_version` y `evidence_ref`, y **el sistema no está asentando la
evidencia de esa autorización**. Una autorización válida obtenida fuera del sistema sigue
siendo válida; lo que no existe es su rastro dentro del producto.

*Requiere verificación con fuente oficial:* la forma y el soporte probatorio exigibles de
la autorización, los plazos de atención de derechos del titular, la obligación de registro
ante la SIC (RNBD) y la clasificación de la geolocalización del domicilio. Este ADR no
emite juicio legal.

---

## Decisión

**Se reabre el expediente de dominio productivo** por activación del disparador 3 de
ADR-070. El diferimiento queda sin efecto **al aprobarse este ADR**, no antes.

### D1. TLS deja de ser prerrequisito de release y pasa a ser control de protección

Mientras exista PII de una persona real en cualquier entorno, TLS no es un ítem de la
lista de G7: es el control que impide que esa PII viaje en claro. Su prioridad se
desacopla del roadmap modular.

### D2. Mitigación inmediata, de coste bajo y reversible (P0)

Antes de cualquier decisión de infraestructura y **antes de la próxima sesión de
desarrollo con el stack levantado**: forzar el binding de API, web y portal a `127.0.0.1`,
o mantener el stack apagado.

Hoy los tres ligan a todas las interfaces (`apps/api/src/main.ts` → `app.listen(port)` sin
host; `next dev` sin `-H` en web y portal). Esta medida no decide dominio, no toca TLS y
se revierte con una línea. **No sustituye a TLS**: reduce la ventana mientras se implanta.

### D3. Orden de prioridad del expediente reabierto

| # | Acción | Depende de |
| --- | --- | --- |
| **P0** | Binding a loopback (D2) | Nadie — ejecutable ya |
| **P1** | Cerrar S-1 y S-2 | Nadie — son defectos de código, no de infraestructura |
| **P2** | Las seis decisiones de F0.2 del plan G7 (FQDN, hosting, CA/ACME, propietario DNS, ventana, RPO/RTO) | **CTO** |
| **P3** | Fases 2 a 5 del plan G7 (preparación TLS, ensayos de rollback y restore, RPO/RTO, emisión) | P2 |
| **P4** | S-3, S-4, S-5 y procedimiento de derechos del titular | P1 |

**S-1 y S-2 van antes que la infraestructura** deliberadamente: no dependen de ninguna
decisión pendiente, y S-2 empeora con el tiempo porque `audit_logs` es inmutable — cada
sesión de trabajo añade filas que no podrán borrarse.

### D4. Los ensayos diferidos por ADR-070 §4 se reactivan

ADR-070 difirió restore global, restore por tenant y rollback por digest con el argumento
de que su evidencia caducaría antes de usarse. **Ese argumento deja de aplicar**: existe un
titular real cuyo dato no es reproducible, y hoy no hay backup ni restore ensayado. Un
fallo del volumen `iwana_postgres_data_dev` lo destruiría sin recuperación.

### D5. Se registra S-5 como riesgo congelado omitido

ADR-070 §Riesgos congelados enumera seis. `rejectUnauthorized: false` en
`packages/database/src/data-source.ts` es el séptimo y no figuraba. Queda incorporado aquí
para que la reapertura no lo pierda.

### D7. El acceso operativo legítimo no es lo que este ADR restringe

Declaración del CTO (2026-08-05), incorporada como decisión: **los datos se almacenan de
forma segura, y el personal autorizado puede verlos porque son parte del funcionamiento
del sistema.**

Esto no entra en conflicto con nada de lo anterior. Son dos capas distintas:

| Capa | Contra qué protege | Mecanismo |
| --- | --- | --- |
| **Confidencialidad frente a terceros** | Quien **no** debe ver el dato: alguien en el segmento de red, un volcado de la base, un tercero en tránsito | TLS, cifrado en reposo, HMAC con clave, sanitización del audit trail |
| **Control de acceso** | Quién **sí** debe verlo y para qué | RBAC por rol, resolución de tenant desde JWT verificado, auditoría de accesos |

Ningún control de la primera capa impide la segunda. Cifrar en reposo no impide que un
usuario con rol adecuado consulte por cédula: la aplicación descifra para quien está
autorizado. Ese es su propósito.

**Finalidades operativas declaradas legítimas** — enunciadas por el CTO y registradas aquí
porque son las que sostienen la base legal del tratamiento:

1. **Consulta por número de documento** para localizar al suscriptor y su facturación.
2. **Ubicación y coordenadas** para despacho de cuadrillas y ejecución de trabajo de campo.
3. **Correo electrónico** para notificar fallas, cortes e información del servicio.
4. **Teléfono** para coordinar la visita técnica y contactar durante la ejecución.

**Consecuencia técnica que conviene fijar:** la corrección de S-1 —pasar de SHA-256 sin sal
a HMAC con clave dedicada— **preserva la búsqueda determinista por documento**. La
finalidad 1 sigue funcionando igual; lo que cambia es que un tercero con acceso a la tabla
ya no puede recuperar la cédula por fuerza bruta sin la clave. La corrección protege sin
restar función.

**Lo que sí queda pendiente de decisión**, y enlaza con D6: estas cuatro finalidades deben
estar cubiertas por la autorización que el titular otorga. Una autorización genérica no
ampara cualquier uso posterior; enumerar las finalidades es lo que la hace verificable.

*Requiere verificación con fuente oficial:* si la enumeración de finalidades debe constar
en el texto de autorización que firma el titular, y con qué grado de detalle.

### D6. El consentimiento se asienta en el sistema o se declara fuera de alcance

Dado D-declaración del CTO, se requiere una decisión explícita: o `consent_records` pasa a
alimentarse en el flujo de alta, o se declara formalmente que la evidencia de autorización
vive fuera del producto y se documenta dónde. **Hoy no está declarado ni asentado**, que es
el único estado que no es defendible ante una reclamación.

---

## Consecuencias

**Positivas**

- El disparador 3 cumple su función: convirtió una omisión potencial en una decisión
  explícita, que es exactamente para lo que ADR-070 lo creó.
- La prioridad queda ordenada por riesgo real y no por secuencia de roadmap.
- S-1 y S-2 salen a la luz antes de que el volumen de datos crezca.

**Costos**

- El foco del programa se desvía parcialmente del roadmap modular, contra la cadencia de
  ADR-022. Es consecuencia aceptada de una obligación que no admite calendario.
- Las seis decisiones de infraestructura se toman antes de que el producto esté completo,
  que es justo lo que ADR-070 quería evitar. El disparador 3 tiene precedencia sobre esa
  preferencia.

**Riesgos**

- Que P0 se lea como suficiente. No lo es: reduce la ventana de exposición, no la cierra.
- Que la reapertura se interprete como autorización para desplegar. **No lo es**: G7 sigue
  NO-GO y su aprobación sigue siendo exclusiva del CTO (ADR-069).

---

## Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin impacto en el modelo de aislamiento. El barrido de las 55 schemas lo confirma íntegro |
| **Seguridad** | **Alto y directo.** Es el objeto de este ADR |
| **Escala** | Sin impacto |
| **Regulación** | Ley 1581: la reapertura responde al tratamiento de datos reales. La base legal la aporta el CTO por vía manual (declaración registrada); la evidencia dentro del sistema está pendiente de decisión (D6) |
| **Autoridad** | No mueve autoridad. G7 sigue siendo aprobación exclusiva del CTO |

---

## Reglas de implementación

1. **No se marca G7 como GO** por esta reapertura. G7 se gana con los prerrequisitos de
   ADR-069 §3 y lo firma el CTO.
2. P0 no sustituye a TLS y así debe reportarse en cualquier informe.
3. Ningún placeholder se sustituye hasta que existan las decisiones de P2.
4. El gate `Block unresolved production prerequisites (R3.5)` se mantiene intacto.
5. La corrección de S-2 debe cubrir la ruta de escritura directa, no solo el interceptor:
   la sanitización pertenece a `AuditService.log()`, donde ninguna ruta pueda evadirla.
6. La corrección de S-1 requiere migración de backfill y clave dedicada; no se resuelve
   con un cambio de función de hash sin plan de datos.
7. Sin PII en informes, evidencia ni logs: conteos, booleanos y descripciones
   estructurales.

---

## Alternativas descartadas

| Alternativa | Motivo |
| --- | --- |
| **Mantener el diferimiento** | El disparador 3 ya se cumplió. Mantenerlo sería desactivar un control que el propio ADR-070 declaró no negociable |
| **Apagar el entorno hasta tener TLS** | Desproporcionado: la exposición es intermitente y condicional al segmento de red. P0 obtiene la mayor parte de la reducción a coste casi nulo |
| **Priorizar la infraestructura antes que S-1 y S-2** | S-1 y S-2 no dependen de ninguna decisión pendiente y S-2 empeora cada día por la inmutabilidad de `audit_logs` |
| **Purgar el dato del titular para desactivar el disparador** | No es decisión de arquitectura, es del CTO y del titular; y no resolvería S-1 ni S-2 para el siguiente registro |

---

## Referencias

- AGENTS.md
- [ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md) · [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) · [ADR-058](ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md)
- [INFORME-PLAT-OPS-G7-FASE-01-v1.0.md](../informes/INFORME-PLAT-OPS-G7-FASE-01-v1.0.md)
- [PROMPT-PLAT-OPS-G7-AUTORIZACION-PRODUCCION-v1.0.md](../prompts/PROMPT-PLAT-OPS-G7-AUTORIZACION-PRODUCCION-v1.0.md)
- [RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md)
