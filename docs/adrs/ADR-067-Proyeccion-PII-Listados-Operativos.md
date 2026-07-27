# ADR-067 — Proyección de datos personales en listados operativos

**Versión:** 1.0
**Estado:** **Aprobado**
**Fecha:** 2026-07-25
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO (2026-07-25) — decisión de política: documento, correo y teléfono son **necesarios para el funcionamiento del sistema** en el listado operativo de suscriptores
**Origen:** hallazgo **S-3** de AI-SEC-ENG en el gate de cierre de ADR-065 — ver [INFORME-ADR065-GATE-CIERRE-PROGRAMA-v1.0](../informes/INFORME-ADR065-GATE-CIERRE-PROGRAMA-v1.0.md)
**Relaciona:** [ADR-058](ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) (cifrado de PII), [ADR-061](ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md), [ADR-065](ADR-065-Paginacion-Numerada-Tablas-Operativas.md) (cota de página)
**Regulatorio:** Ley 1581 de 2012 y decretos reglamentarios — **el detalle normativo citado aquí requiere verificación con fuente oficial** antes de usarse como sustento legal

---

## Contexto

El gate de cierre de ADR-065 reportó como hallazgo **S-3** que `crm/subscribers/subscribers.service.ts:326` descifra datos personales de cada fila de la página, y que el controlador reincorpora `documentNumber`, `email`, `phone` y `altContactPhone` sobre un objeto que ya expone `address`, `neighborhood`, `city`, `latitude`, `longitude` y `whatsapp`.

Con la cota vigente (`limit` 100, `page * limit ≤ 10_000`), aproximadamente cien peticiones —cerca de un minuto bajo el throttler— entregan 10.000 registros personales completos a cualquier rol `ADMIN`, `NOC`, `SALES`, `SUPPORT` o `ACCOUNTANT`.

El auditor señaló además una **incoherencia interna**: `crm/expedientes/expediente.service.ts:678-683` anula explícitamente las columnas cifradas antes de responder. Dos listados del mismo módulo aplican políticas de minimización opuestas sobre el mismo tipo de dato, sin que ninguna decisión documentada explique la diferencia.

El auditor no clasificó esto como vulnerabilidad —no hay ruptura de control de acceso ni de aislamiento entre tenants— sino como **decisión de producto pendiente**: o la proyección se estrecha, o la política se hace explícita.

## Decisión del CTO

**La proyección se conserva. La política se modifica para reflejarla.**

El CTO determina que documento, correo y teléfono son **necesarios para el funcionamiento operativo** del listado de suscriptores. La justificación es propia del dominio ISP y este ADR la acoge sin reserva: el operador de soporte identifica al suscriptor por número de documento cuando llama, contacta por teléfono o WhatsApp desde la misma vista sin abrir el detalle, y el área de cartera concilia por documento. Obligar a abrir el detalle de cada fila para obtener el dato con el que se trabaja convertiría una tarea de un paso en tres, decenas de veces al día.

En consecuencia, **S-3 no se remedia estrechando la proyección**. Se cierra documentando la finalidad y añadiendo controles compensatorios de trazabilidad y proporcionalidad.

## Norma

**1 · Proyección autorizada en el listado de suscriptores.** `documentNumber`, `email`, `phone`, `altContactPhone`, `whatsapp` y los campos de ubicación permanecen en la respuesta del listado. No requieren apertura del detalle.

**2 · Finalidad declarada por campo.** Todo campo personal expuesto en un listado operativo debe tener finalidad escrita en el módulo. Un campo sin finalidad declarada no se expone. Para suscriptores:

| Campo | Finalidad operativa |
| --- | --- |
| `documentNumber` | Identificación del suscriptor en atención telefónica y conciliación de cartera |
| `phone` · `altContactPhone` · `whatsapp` | Contacto directo desde la vista de trabajo |
| `email` | Notificación y recuperación de acceso |
| `address` · `neighborhood` · `city` · coordenadas | Despacho técnico y verificación de cobertura |

**3 · Principio general — la excepción es el listado, no la regla.** Esta decisión autoriza la proyección **en el listado de suscriptores**, por su finalidad operativa. **No generaliza a otros listados.** Todo listado nuevo parte de proyección mínima; ampliarla exige finalidad declarada por campo (cláusula 2) y queda sujeta a este ADR.

**4 · La incoherencia con expedientes se resuelve declarándola intencional.** `expediente.service.ts` conserva la anulación de columnas cifradas: la tarea de ese listado es gestionar el avance del expediente, no contactar al suscriptor, así que no hay finalidad que sustente la exposición. **La diferencia entre los dos listados es deliberada y queda documentada aquí**; no es deriva y no debe «armonizarse» igualando hacia arriba.

**5 · Trazabilidad de acceso masivo.** Todo acceso al listado de suscriptores con datos personales en la proyección se registra en `audit_logs` del tenant: actor, rol, filtros aplicados, tamaño de página y total servido. Es el control que sostiene la rendición de cuentas: si no se puede reconstruir quién leyó cuántos registros y con qué criterio, la finalidad declarada no es verificable.

**6 · Proporcionalidad — la cota no se relaja.** `limit` máximo 100 y `page * limit ≤ 10_000` (ADR-065 §11) permanecen como techo. **Queda prohibido subir el tope para este endpoint**, y cualquier propuesta de hacerlo escala al CTO citando este ADR.

**7 · La exportación es un acto distinto.** Descargar el listado a CSV o equivalente no está cubierto por esta autorización: exige control propio, registro específico y —si se implementa— decisión aparte.

**8 · Fronteras que no se mueven.** Los datos personales siguen **cifrados en reposo** (ADR-058); **nunca** aparecen en logs, mensajes de error, cursores de paginación, URLs ni parámetros de consulta; y el aislamiento por schema de tenant se mantiene intacto. Esta decisión amplía qué se devuelve en el cuerpo de una respuesta autorizada, y **nada más**.

**9 · Revisión de alcance por rol — pendiente, con dueño.** La proyección está hoy disponible para `ADMIN`, `NOC`, `SALES`, `SUPPORT` y `ACCOUNTANT` (`subscribers.controller.ts:92`). La finalidad de la cláusula 2 no sustenta por igual a los cinco: es dudoso que `NOC` necesite el documento o que `ACCOUNTANT` necesite las coordenadas. **AI-PROD-UX propone el mapa campo × rol contra el PRD del módulo y AI-EM-ARCH lo ratifica**, sin bloquear esta decisión. Estrechar por rol es refinamiento de la política, no reversión.

## Impacto

**Multi-tenant:** sin cambio. La proyección vive dentro del schema del tenant y el `total` refleja el alcance del operador.

**Seguridad:** el vector no es de control de acceso sino de **volumen**. Se mitiga con la cota de la cláusula 6 —ya vigente— y se hace auditable con la cláusula 5. AI-SEC-ENG no clasificó S-3 como vulnerabilidad; con estas cláusulas queda cerrado como decisión documentada, no como riesgo aceptado en silencio.

**Escala:** a 100 filas por página el descifrado por fila es acotado. Si un tenant llega a cientos de miles de suscriptores, el coste está en el descifrado, no en la proyección; se revisa entonces, no ahora.

**Regulación:** la finalidad declarada (cláusula 2) y el registro de acceso (cláusula 5) son los dos elementos que sostienen la posición frente a Ley 1581. **Ninguna afirmación de cumplimiento legal de este ADR debe usarse sin verificación con fuente oficial**; lo que aquí se decide es la política técnica y su trazabilidad, no un dictamen jurídico.

## Consecuencias

### Positivas

- El listado sigue sirviendo la tarea real del operador sin obligar a abrir el detalle fila por fila.
- La exposición pasa de ser un efecto colateral no documentado a una decisión con finalidad escrita y registro de acceso.
- La divergencia con expedientes deja de ser deriva y queda como criterio: proyección según la tarea del listado.

### Negativas / deuda

- **La cláusula 5 exige trabajo de backend** que hoy no existe: el `AuditInterceptor` registra operaciones de escritura, no lecturas de listado. Requiere extensión explícita para este endpoint.
- La cláusula 9 queda abierta: mientras no exista el mapa campo × rol, cinco roles ven más de lo que su función probablemente requiere.
- El volumen extraíble en un minuto sigue siendo alto por diseño; se acepta con la cota y la trazabilidad como contrapeso.

### Fuera de alcance

- Exportación a CSV (cláusula 7).
- Enmascaramiento parcial de campos en listado — descartado: un documento parcialmente enmascarado no sirve para identificar en llamada, que es la finalidad declarada.
- Revisión del cifrado en reposo (ADR-058, sin cambio).

## Criterio de aceptación

- [x] CTO decide la política (2026-07-25).
- [ ] Finalidad por campo (cláusula 2) documentada en el módulo CRM.
- [ ] Registro de acceso masivo (cláusula 5) implementado — **AI-SR-FULL**.
- [ ] Mapa campo × rol (cláusula 9) propuesto — **AI-PROD-UX**.
- [ ] `.github/instructions` del módulo cita este ADR.

## Escalación

Ninguna abierta. La decisión de política es del CTO y está tomada. Las cláusulas 5 y 9 son trabajo derivado, no condiciones de la decisión.
