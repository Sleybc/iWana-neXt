# PROMPT — `privacy` Fase 1b · Delta v1.2 · Evidencia de autorizaciones y lecturas de subrecursos

**Versión:** 1.2 (delta sobre [v1.0](PROMPT-PRIVACY-FASE-1B-v1.0.md) y [v1.1](PROMPT-PRIVACY-FASE-1B-v1.1.md); lo que no se toca sigue vigente) · **Fecha:** 2026-10-16 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado; **D-1B-7 = A aprobada** (2026-10-16): aplica E-A, E-B no se ejecuta
**Plan:** [2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md) v1.2
**Resuelve:**
- el `[BLOQUEO]` alto de [B2 v1.1](../informes/INFORME-PRIVACY-FASE-1B-B2-v1.1.md);
- la deuda P1 y P2 de [B3 v1.1](../informes/INFORME-PRIVACY-FASE-1B-B3-v1.1.md).

## 0. Diagnóstico

**Origen del bloqueo de B2:** una contradicción entre documentos del emisor, no un hueco de boundary.

| Documento | Dice |
| --- | --- |
| Prompt v1.0, R6 | Se conservan `data_authorizations` y la prueba de la autorización |
| [Cuestionario jurídico](../informes/INFORME-CONSULTA-JURIDICA-PROTECCION-DATOS-v1.0.md), pregunta 9 | Posición propuesta: se conserva «la prueba de la autorización» |
| Anexo A del runbook y el CLI (`anonymize-titular.ts:739-760`) | Borran (soft-delete) `data_authorizations.evidence_media_id` si no está compartida y no es evidencia de identidad de una solicitud |

B2 cumplió R6 en la ruta API y conservó la regla del Anexo A en el CLI. Así **la API y el CLI tienen hoy semánticas distintas**, contra R13.

La evidencia de identidad de las solicitudes (`requester_evidence_media_id`) se conserva en los dos caminos, y no cambia.

## 1. D-1B-7 (decide el CTO)

| Opción | Efecto |
| --- | --- |
| **A (recomendada): conservar** la evidencia de las autorizaciones | La API ya cumple. El CLI deja de borrarla y el Anexo A se corrige. No se necesita ningún puerto nuevo |
| B: borrarla | Hace falta el puerto de §3 en `privacy` y conectarlo al participante Media |

**Motivo de A:**
- la prueba de la autorización es un deber del Responsable (Decreto 1377 de 2013, compilado en el DUR 1074 de 2015);
- es la posición que ya se envió al abogado;
- borrarla es irreversible: conservarla se puede corregir después, si el dictamen lo pide; borrarla, no.

Hasta el dictamen, la evidencia queda en un bucket privado, con firma de 300 s y lectura auditada (Fase 1a).

## 2. Bloque E-A · si D-1B-7 = A (`sr-backend`, dueño de B2)

**Propiedad:** `apps/api/src/cli/anonymize-titular*` y `apps/api/src/modules/media/` (solo su participante).

1. Retirar del CLI la selección de `data_authorizations.evidence_media_id` (`mediaEvidenceIds`, rama `privacy`) y el contador `privacyMediaAssets`. El informe del CLI conserva la clave con valor 0 y la etiqueta «conservada (prueba de autorización)», para no romper consumidores del JSON.
2. **Excepción explícita a la regla «sin editar aserciones» (v1.0 §2.6), solo para este punto:** la integración del CLI cambia la aserción de evidencia de privacidad, de «borrada» a «conservada y activa». Ninguna otra aserción se toca.
3. Test nuevo en las dos rutas (API y CLI): tras anonimizar, el asset de evidencia de la autorización sigue con `deleted_at IS NULL` y la fila de `data_authorizations` no cambia.

AI-EM-ARCH corrige la fila `public.media_assets` del Anexo A del runbook al aprobarse D-1B-7.

## 3. Bloque E-B · solo si D-1B-7 = B

1. **B1:** `privacy/ports/privacy-evidence-read.port.ts` con:
   ```ts
   abstract erasableEvidenceMediaIds(partyId: string, ctx: { manager: EntityManager }): Promise<string[]>
   ```
   Devuelve los ids de evidencia de autorizaciones del Party que no estén referenciados por ninguna solicitud ni por otro Party. Se implementa en `privacy` y se exporta.
2. **B2:** el adaptador lo inyecta y pasa los ids a `MediaErasureParticipant` por `relatedIds`; integración Postgres en la ruta API.

## 4. Bloque F · lecturas de subrecursos de un titular bloqueado (B3)

Cierra la P1 de B3: es una omisión del emisor en R8, que nombró «detalle» sin listar los subrecursos.

| Ruta (`expedientes.controller.ts`) | Sin `canSeeBlocked` | Con `canSeeBlocked` |
| --- | --- | --- |
| `GET :id/timeline` (389) | 403 `PRIVACY_DATA_BLOCKED` | Se sirve, con `LIST_ACCESS` y `blockedServed` |
| `GET :id/document-supports` (464) | 403 | `LIST_ACCESS` |
| `GET :id/document-supports/:documentKey/:versionId/file` (554) | 403 | `RECORD_ACCESS`, con `grantedBy` |
| `GET :id/contact-attempts` (589) | 403 | `LIST_ACCESS` |
| `GET :id/consents` (630) | 403 | `LIST_ACCESS` |
| `GET :id/coverage-checks` (679) | 403 | `LIST_ACCESS` |

- **Un expediente está bloqueado** si su Party tiene `DATOS_BLOQUEADOS` activo. El Party se obtiene por `subscribers.expediente_id`, como hoy en `expediente.service.ts:725`. Un expediente sin Party no puede estar bloqueado.
- **Mutaciones:** las de subrecursos (cargar soportes, registrar intentos o consentimientos) sobre un bloqueado → 409 `PRIVACY_DATA_BLOCKED`, como en v1.1 §5.3.
- **Qué no se toca:** `GET summary` (800) es agregado, sin PII. Un expediente anonimizado no se bloquea: sus subrecursos ya están anonimizados y los assets borrados dan 404.
- **Tests:** HTTP por ruta con `SALES`, `TECHNICIAN` y `ACCOUNTANT` sin el perfil (403), con `crm.blocked_data.read` (200 y auditoría) y con `privacy.read` (200).

## 5. Bloque G · cobertura de functions (B3)

La regla de v1.0 §4 B3 era **no bajar de la línea base**, en todas sus métricas. Functions de `crm/subscribers` quedó en 90,97 % contra 91,47 %: B3 agrega tests hasta ≥ 91,47 %, sin bajar statements, branches ni lines.

## 6. Pasada regla → campo (solo lo nuevo)

| Regla | Campo o ruta | Bloque | Test |
| --- | --- | --- | --- |
| R6 y R13 (A) | CLI sin la rama `privacy` de `mediaEvidenceIds` | E-A | API y CLI: asset activo y autorización intacta |
| R8 ampliada | Seis rutas de §4 | F | HTTP por ruta y rol |
| Cobertura | `crm/subscribers` | G | Conteo sin caché, cuatro métricas ≥ línea base |

**Cruce con estados (A22):**
- un titular **bloqueado** que luego se anonimiza pierde la marca (v1.1 §6), y las seis rutas vuelven a servir con los datos ya anonimizados;
- una solicitud `NO_PROCEDENTE` por `DEBER_CONTRACTUAL` no bloquea (R1), y las rutas siguen abiertas.

## 7. Después de este delta

Con E y F/G verdes empieza la **Ola 2** de v1.0 §5, sin cambios: V1 E2E real, V2 `sec-eng`, V3 revisores, V4 `gate-verifier` y V5 `docs-governance`. V1 suma los casos de §4.
