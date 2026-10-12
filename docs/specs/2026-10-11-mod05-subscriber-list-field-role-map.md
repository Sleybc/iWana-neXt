# Spec — Mapa de campos personales del listado de suscriptores por rol

**Versión:** 1.0  
**Estado:** **Ratificada con cambios** por AI-EM-ARCH el 2026-10-12 — ver §6. La matriz vigente es la de §6, no la de §2  
**Fecha:** 2026-10-12  
**Autor:** `prod-ux`  
**Superficie:** listado de suscriptores de MOD05  
**Plan:** [Remediación de cumplimiento MOD05/MOD08](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md), bloque B4  
**PRD vigente:** [Subscriber Fase 04](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md) §§4–6 y [Subscriber Fase 03](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md) (vigente salvo las secciones que Fase 04 supera)  
**ADRs:** [ADR-067](../adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md) §§2, 8–9; [ADR-083](../adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md) §§D2–D3, D7; [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md)

> Esta spec propone qué campos de `SUBSCRIBER_LIST_FIELD_PURPOSE` se proyectan por rol. La ratificación corresponde a AI-EM-ARCH. La propuesta no concede `crm.subscribers.read`, no cambia el contrato C-API-2 y no modifica la ficha 360°.

## 1. Regla de alcance

El mapa asigna únicamente los diez campos personales declarados en `SUBSCRIBER_LIST_FIELD_PURPOSE` por el informe de auditoría, §6.3. El guion `—` significa que ese rol no recibe ninguno de esos diez campos en el listado; se conservan los demás campos que define el contrato congelado C-API-2.

La decisión sigue minimización por tarea: cada campo requiere una finalidad del ADR-067 §2 y un caso de uso compatible. Tener permiso granular de lectura de MOD05 según ADR-083 no determina por sí solo qué datos personales recibe la proyección.

## 2. Matriz propuesta

| Rol | Campos de `SUBSCRIBER_LIST_FIELD_PURPOSE` | Justificación por tarea |
| --- | --- | --- |
| **ADMIN** | — | En el PRD Fase 04, la tarea del administrador en esta ficha es revisar qué cambió y quién lo cambió (persona ADMIN, §4); la bitácora es de solo lectura y usa una lista blanca (RF-S404-20, RNF-S404-04). La revisión del registro no requiere exponer valores personales en cada fila del listado. |
| **NOC** | — | El PRD maestro asigna NOC a monitoreo y diagnóstico de red (PRD del sistema §4.2 y §13.3), sin una tarea de atención individual del suscriptor en el PRD MOD05. ADR-083 no amplía la lectura de suscriptores a NOC. No se justifica un campo personal para el listado. |
| **SALES** | — | El PRD Fase 04 sitúa la consulta comercial en la ficha 360°: servicios, información financiera y cumplimiento, sin entrar a Tickets (persona SALES, §4). Ninguno de los campos personales del listado es necesario para esas consultas; el PRD no asigna a SALES contacto directo desde la lista. |
| **SUPPORT** | `documentNumber`, `phone`, `altContactPhone`, `whatsapp`, `address`, `neighborhood`, `city` | La mesa de ayuda debe resolver estado, tickets, equipos y ubicación del suscriptor (persona SUPPORT, PRD Fase 04 §4; RF-S404-40–47). `documentNumber` identifica al suscriptor durante la atención telefónica; teléfonos y WhatsApp permiten contacto directo; dirección, barrio y ciudad apoyan la gestión de ubicación y despacho. No se asigna `email`: el caso de uso vigente no declara recuperación de acceso ni notificación por correo desde el listado. |
| **ACCOUNTANT** | `documentNumber` | La finalidad declarada para `documentNumber` incluye conciliación de cartera (ADR-067 §2). El PRD maestro ubica a ACCOUNTANT en facturación, conciliación y reporting financiero (§4.2, §13.3). La propuesta limita el listado a ese identificador; los demás datos personales no son necesarios para conciliar. |
| **TECHNICIAN** | `phone`, `altContactPhone`, `whatsapp`, `address`, `neighborhood`, `city`, `latitude`, `longitude` | El PRD Fase 04 asigna al técnico averiguar ubicación y equipo instalado, y llevarlo de Vista general (dirección y mapa) a Servicios (§4, RF-S404-10–19 y RF-S404-30–36). ADR-083 §D3 permite `crm.subscribers.read` para TECHNICIAN; su fundamento en el PRD es ver contacto y dirección para instalación. Los teléfonos permiten coordinar el trabajo; dirección, barrio y ciudad apoyan el despacho; las coordenadas quedan asociadas a su finalidad declarada de verificación de cobertura. El documento y el correo no son necesarios para esa tarea. |
| **AUDITOR** | — | El PRD maestro define AUDITOR como solo lectura con acceso especial a logs (§4.1, §13.3), y ADR-083 §D3 amplía la compatibilidad a permisos `*.read`. La lectura de registros y auditoría no declara una finalidad para recibir PII en el listado; se mantiene solo la proyección base de C-API-2. |

Las cadenas de finalidad asociadas a los campos quedan congeladas, sin ampliaciones:

| Campos | Finalidad de `SUBSCRIBER_LIST_FIELD_PURPOSE` |
| --- | --- |
| `documentNumber` | Identificación en atención telefónica y conciliación de cartera |
| `phone`, `altContactPhone`, `whatsapp` | Contacto directo |
| `email` | Notificación y recuperación de acceso |
| `address`, `neighborhood`, `city` | Despacho técnico |
| `latitude`, `longitude` | Verificación de cobertura |

`email` tiene finalidad declarada, pero no se asigna a ningún rol en esta propuesta: no encontré en los casos de uso vigentes del PRD de suscriptores una necesidad de correo en el listado. Su omisión no requiere crear una finalidad nueva ni ampliar la lista.

## 3. Decisión sobre el documento en la tabla

**Propuesta: sí, mostrar `documentNumber` en la tabla solo cuando el rol reciba ese campo**, es decir, para SUPPORT y ACCOUNTANT. Su finalidad declarada cubre la identificación en atención telefónica y la conciliación de cartera. La presentación sigue el campo completo que autoriza ADR-067; el ADR descarta el enmascaramiento parcial para este uso (§Consecuencias / Fuera de alcance).

Para ADMIN, NOC, SALES, TECHNICIAN y AUDITOR el campo no forma parte de la proyección y no se muestra. Esta decisión define la presencia del dato por rol; no fija etiquetas, copy ni disposición visual.

## 4. Resoluciones y límites

1. **Conservar el cifrado en reposo.** La proyección ocurre solo en una respuesta autorizada; ADR-058 mantiene AES-256-GCM y su política de claves. El valor no pasa a logs, errores, cursores, URL ni query string, según ADR-067 §8.
2. **Mantener auditoría y cota.** La exposición sigue sujeta a `LIST_ACCESS` con actor, rol, filtros y dimensiones y al techo de paginación de ADR-067 §§5–6. La exportación no queda autorizada por esta spec (§7).
3. **Separar permiso de contenido.** ADR-083 gobierna compatibilidad y permisos de lectura; esta matriz solo reduce los campos personales de la proyección.
4. **Resolver tensión entre fuentes en la ratificación.** El plan y el prompt de remediación del 2026-10-11 piden mapear siete roles, y ADR-083 §D3 amplía la compatibilidad de TECHNICIAN y AUDITOR con lectura. El PRD Fase 04 §6.1 RNF-S404-02 y §9.4 D3, sin embargo, registran la restricción anterior del listado a cinco roles. Esta propuesta no interpreta el mapa de campos como autorización para ampliar los roles del endpoint. AI-EM-ARCH debe ratificar expresamente el alcance de lectura del listado junto con esta matriz.

## 5. Ratificación

**Ratificada con cambios el 2026-10-12** — ver §6. La aplica el bloque B2 del prompt de remediación v1.1 (que absorbe a B6).

## 6. Ratificación de AI-EM-ARCH (2026-10-12)

**Ratificador:** AI-EM-ARCH. El productor (`prod-ux`) no aprueba su propia spec, y ADR-067 §9 asigna la ratificación a este perfil.

### 6.1 Alcance de lectura del listado: 5 roles

La tensión de §4.4 se resuelve a favor de la **decisión D3 del CTO** (PRD Fase 04 §9.4, 2026-09-04): el listado se restringe a `ADMIN`, `NOC`, `SALES`, `SUPPORT` y `ACCOUNTANT`. D3 es posterior a ADR-083 (2026-08-28) y no lo contradice: ADR-083 concede `crm.subscribers.read`, y D3 decide qué endpoint sirve esa lectura a cada rol. `TECHNICIAN` y `AUDITOR` conservan la ficha (`GET :id`, `/360`) y pierden el listado. El selector de tareas (`TaskCoreFields`) lo usan solo `ADMIN`, `NOC` y `SUPPORT` (`tasks/execution-order-templates.controller.ts:47-90`), así que no se rompe.

Las filas `TECHNICIAN` y `AUDITOR` de §2 quedan **sin efecto** para el listado. La de TECHNICIAN se conserva como insumo para el futuro alcance por asignación (ADR-083 l.77).

### 6.2 Matriz vigente

| Rol | Campos restringidos que recibe | Cambio respecto a §2 |
| --- | --- | --- |
| ADMIN | `documentNumber`, `nit`, `nitVerificationDigit`, `phone`, `altContactPhone`, `whatsapp`, `email`, `address`, `neighborhood`, `city` | **Cambia.** Ver 6.3 |
| NOC | — | Ratificada |
| SALES | — | Ratificada |
| SUPPORT | `documentNumber`, `nit`, `nitVerificationDigit`, `phone`, `altContactPhone`, `whatsapp`, `address`, `neighborhood`, `city` | Ratificada; `nit` y DV siguen a `documentNumber` |
| ACCOUNTANT | `documentNumber`, `nit`, `nitVerificationDigit` | Ratificada; `nit` y DV siguen a `documentNumber` |

Todos los roles reciben además la proyección base de C-API-2 v1.1, que incluye las etiquetas de nombre y razón social con su finalidad declarada.

### 6.3 Por qué cambia ADMIN

La propuesta dejaba a ADMIN sin ningún campo restringido. Se ratifica con el conjunto de SUPPORT más `email` por tres razones:

1. **`email` tiene finalidad declarada —notificación y recuperación de acceso— y ningún rol la ejercía.** Recuperar el acceso al portal del suscriptor es tarea de administración. Una finalidad sin rol que la ejerza es una finalidad muerta.
2. **ADR-067 fue una decisión del CTO de conservar la proyección**, con §9 como refinamiento. Dejar sin contacto al rol de mayor autoridad operativa del tenant se acerca más a revertir la decisión que a refinarla.
3. **En los ISP de este segmento, el administrador cubre la primera línea cuando no hay mesa de ayuda.** Esta es una afirmación de dominio, no de PRD; si el CTO la rechaza, ADMIN vuelve a la fila de §2 sin otro cambio.

### 6.4 Lo que esta ratificación no hace

- No añade la columna de documento a la tabla del portal: es un cambio visible, para una tarea de UI con PROD-UX.
- No toca la ficha 360°.
- No crea finalidades distintas de la etiqueta de fila de C-API-2 v1.1.
