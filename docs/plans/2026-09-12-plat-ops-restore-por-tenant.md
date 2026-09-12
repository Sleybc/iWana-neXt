# Plan de fase — Capacidad de backup y restore por tenant

**Versión:** 1.0
**Estado:** Vigente
**Fecha:** 2026-09-12
**Modo activo:** EM + Orchestrator
**Autor:** AI-EM-ARCH
**Contrato congelado:** [`SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md`](../specs/SPEC-PLAT-OPS-RESTORE-POR-TENANT-v1.0.md) — congelado en esta fecha. Un cambio de este contrato es el único evento que fuerza re-sync de los tracks (protocolo §3bis regla 1)
**Relacionado:** [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) (Aprobado 2026-09-12) · [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) · [plan de las cinco condiciones de G7](2026-09-12-plat-ops-g7-cinco-condiciones.md)

---

## 1. Por qué esta fase y por qué ahora

De las cinco condiciones de G7, **restore por tenant es la única sin capacidad alguna** —ni herramienta ni ensayo— y, a la vez, **la única que no depende de ninguna decisión pendiente del CTO**. Puede ejecutarse hoy, en paralelo a las definiciones de infraestructura, sin bloquear a nadie ni quedar bloqueada.

Es además el camino crítico real: dominio, TLS y CA/ACME se resuelven en horas una vez decidido el hosting; construir y ensayar una capacidad de recuperación, no.

## 2. Decisión de hosting registrada (2026-09-12)

El CTO declaró que el destino es un **VPS con IP pública** (categoría de proveedor tipo Hostinger). Consecuencias inmediatas para el expediente de G7, que se registran aquí para que el track de TLS las recoja:

- **ACME HTTP-01 queda confirmado como viable.** Era la recomendación de AI-PLAT-OPS y su única condición era disponer del puerto 80 accesible desde internet, que un VPS con IP pública satisface. Se descarta la necesidad de DNS-01, y con ella la credencial de API del proveedor DNS en el almacén de secretos.
- **Queda sin efecto el escenario de red privada** que arrastraba el histórico (`10.0.0.2`, on-prem, hoy unreachable).
- **Sigue pendiente** el resto de F0.2: FQDN concreto, CA, propietario de la zona DNS, ventana operativa y RPO/RTO.

Esta decisión **no altera el contrato de esta fase**: la capacidad de restore por tenant es idéntica en VPS que on-prem.

## 3. Tracks y secuencia

Dos tracks, con un punto de integración. El segundo no arranca hasta que el primero entrega, porque verifica su producto.

| Track | Agente | Entrega | Depende de |
| --- | --- | --- | --- |
| **T1 — Capacidad** | AI-PLAT-OPS | Los dos comandos de la spec §3, con sus invariantes de seguridad y tests | Contrato congelado (ya) |
| **T2 — Verificación** | AI-SR-QA | Ensayo ejecutado de los ocho criterios de aceptación, con evidencia sanitizada | T1 entregado |

**Por qué no los paraleliza este plan.** El modelo contract-first del protocolo §3bis permite que QA escriba contra el contrato antes de que exista la implementación, y así debe hacerse: T2 puede **preparar** su ensayo desde el minuto uno. Lo que no puede es **ejecutarlo**, porque los criterios se verifican contra la herramienta real, no contra su especificación.

**El aprobador no es el productor.** T1 construye; T2 verifica. AI-PLAT-OPS no declara PASS de su propia herramienta (protocolo §3).

## 4. Prompts de ejecución emitidos

Sin prompt de ejecución no hay implementación (protocolo §3, G4).

| Prompt | Destinatario | Estado |
| --- | --- | --- |
| [`PROMPT-PLAT-OPS-RESTORE-TENANT-FASE-01-v1.0.md`](../prompts/PROMPT-PLAT-OPS-RESTORE-TENANT-FASE-01-v1.0.md) | AI-PLAT-OPS | Emitido |
| [`PROMPT-SR-QA-RESTORE-TENANT-FASE-01-v1.0.md`](../prompts/PROMPT-SR-QA-RESTORE-TENANT-FASE-01-v1.0.md) | AI-SR-QA | Emitido |

## 5. Criterio stop/go

**GO de la fase** cuando los ocho criterios de aceptación de la spec §4 estén verificados por AI-SR-QA con evidencia ejecutada, y el resultado esté registrado en el informe de fase.

**STOP inmediato** si se cumple cualquiera de estas:

1. Un comando de la herramienta interpola un `schema_name` que no proviene de `public.tenants` o que no pasó el regex. Es el vector de inyección que la spec §3.3 cierra.
2. El ensayo de CA-7 se realiza con un solo tenant sembrado. No acredita aislamiento y el resultado no vale.
3. Aparece PII o una fila de negocio en la evidencia archivada. ADR-069 lo prohíbe expresamente.
4. Se propone `DROP SCHEMA ... CASCADE` para resolver un schema preexistente en destino.

## 6. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El ensayo se hace en base vacía y aparenta PASS sin demostrar aislamiento | CA-7 exige un segundo tenant sembrado y checksum antes/después. Es criterio, no recomendación |
| El dump se restaura sin la fila de `public.tenants` y deja un schema huérfano | El sidecar es parte del artefacto de backup, y CA-8 verifica que su ausencia falle de forma accionable |
| La duración del ensayo se interpreta como PASS sin RTO definido | La spec §7 obliga a reportarla como *medida, no evaluada*, hasta que el CTO fije los targets |
| Los backups contienen PII real (ADR-078) y quedan en disco sin cifrar | Fuera de contrato de esta fase (spec §6), **registrado como deuda con dueño**: AI-SEC-ENG propone, CTO decide |

## 7. Lo que esta fase NO cierra

G7 sigue necesitando, además de esta capacidad: el ensayo de **restore global** en el entorno objetivo —no en dev—, el **backup/restore de MinIO**, la **política de Redis**, el **registro de imágenes** para que el rollback por digest sea ejecutable, y las seis definiciones de F0.2. El detalle vive en el [plan de las cinco condiciones](2026-09-12-plat-ops-g7-cinco-condiciones.md).

Esta fase entrega una de las cinco, y quita del camino crítico la que más tarda.
