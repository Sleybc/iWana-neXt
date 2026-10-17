# INFORME — MOD05 Suscriptores · Re-auditoría contra el checklist de salida

**Versión:** 1.0 · **Fecha:** 2026-10-15 · **Emisor:** AI-EM-ARCH (solo lectura)
**Base:** `main` en `365eb0fb`, con CI verde en la corrida [`38735918857`](https://github.com/Sleybc/iWana-neXt/actions/runs/38735918857) sobre `70786da0`
**Auditoría de origen:** [INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0](INFORME-MOD05-SUBSCRIBERS-AUDITORIA-CUMPLIMIENTO-v1.0.md) (2026-10-11), §5 hallazgos y §8 checklist
**Fases cerradas desde entonces:**
- remediación B1–B13 ([G6](INFORME-MOD05-SUBSCRIBERS-CIERRE-G6-v1.0.md));
- IVA ([ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md)) y D-PDF ([G6 y G6.5](INFORME-MOD05-IVA-PDF-CIERRE-G6-v1.0.md));
- privacidad, Fase 1a ([ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md), [G6 y G6.5](INFORME-PRIVACY-FASE-1A-CIERRE-G6-v1.0.md)).

**Veredicto:** **NO-GO para producción**. Los críticos (C01–C03) están cerrados y de los altos solo queda abierto, en parte, A06. Bloquean lo siguiente:

| # | Pendiente | Tipo |
| --- | --- | --- |
| 1 | A06: la supresión y el bloqueo no se ejecutan (Fase 1b) | Decisión **D-1B** |
| 2 | E-3, decidido como opción (a), sin implementar | Construcción |
| 3 | ADR-058 fase 2 (`PII_ENCRYPTION_KEY`, M02) | Plataforma |
| 4 | Dictámenes de ADR-093 §6 y ADR-094 §7.3 | Externo |
| 5 | G7 por tenant | Release |

## 1. Método

Cada hallazgo se contrastó con el código de `main`, citando `archivo:línea`, y con las evidencias de G6 y G6.5 de cada fase. Esta re-auditoría no ejecutó tests: las cifras citadas son de los informes de cierre y de la corrida de CI indicada. Un hallazgo cuenta como **cerrado** solo si el código lo resuelve y existe una prueba en CI o un gate cerrado que lo respalde.

## 2. Estado de los hallazgos

### 2.1 Críticos

| ID | Estado | Evidencia |
| --- | --- | --- |
| SUB-C01 `Party` sin dedup y documento en claro | ✅ Cerrado en código · datos por tenant en G7 | HMAC normalizado y documento cifrado (migración 143, B1, B5 y B11). B5 en PASS en CI (`38735918857`). El backfill por tenant sigue el [runbook B13](../runbooks/RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md) en G7 |
| SUB-C02 PII en query string | ✅ Cerrado | `subscribers.controller.ts:143-150` y `:293-294` solo aceptan filtros no personales; la búsqueda personal va por `POST /search` (B2 y B3) |
| SUB-C03 regla del IVA | ✅ Cerrado | ADR-093 aprobado; IVA con G6 y G6.5 en GO |

### 2.2 Altos

| ID | Estado | Evidencia |
| --- | --- | --- |
| SUB-A01 fallo de conversión sin registro | ❌ **Reabierto (2026-10-15)** | Los listeners usan `@OnEvent` con `suppressErrors` por defecto en `true`: el error se registra en el log y no se propaga, así que `emitPipelineEventSafely` marca el evento como resuelto. Detectado por el E2E real de E-3. Corrección F1 ([prompt E-3 §6.1](../prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md)). **Error de esta re-auditoría:** se apoyó en B5, que no ejercita un fallo dentro del listener |
| SUB-A02 reactivación | ✅ | B5: «reactiva hasta ACTIVE…» y «no restaura un suscriptor que ya estuvo ACTIVE» en PASS en CI |
| SUB-A03 idempotencia sin garantía de BD | ✅ | Índice único por expediente (B1); «dos conversiones concurrentes…» en PASS |
| SUB-A04 Party fuera de puerto y de transacción | ✅ | `IPartyWritePort.ensurePartyWithRole` dentro de la transacción de alta (B5) |
| SUB-A05 proyección del listado | ✅ | Mapa campo × rol ratificado (spec §6) y aplicado (B2 y B6); finalidades en `subscriber-projection.ts:5-17` |
| SUB-A06 consultas, reclamos y supresión | ⚠ **Parcial** | Plazos legales, estados, auditoría y prueba de autorización ✅ (Fase 1a). **La supresión y el bloqueo no se ejecutan:** `DATOS_BLOQUEADOS` se marca, pero ninguna proyección lo aplica, y una supresión procedente no anonimiza. Es la Fase 1b → **D-1B** |
| SUB-A07 alta sin autorización | ✅ | A18: el alta, la conversión y el contrato exigen `TRATAMIENTO_CONTRACTUAL` |
| SUB-A08 PII en `audit_logs` | ✅ | `subscribers-update-audit.postgres.integration.spec.ts` en PASS en CI |

### 2.3 Medios

| ID | Estado | Evidencia o acción |
| --- | --- | --- |
| SUB-M01 contacto y fecha en claro | ⚠ Parcial | ✅ `whatsapp` cifrado (`subscribers.service.ts:324, 741, 1405`). ✅ `party_contact.value` guarda un centinela, no PII (`party-pii.util.ts:47-50`), mientras siga `NOT NULL` por E-3. ❌ `birth_date` en claro (`subscriber.entity.ts:86`): ADR-058 no lo lista; **decisión P3** |
| SUB-M02 ADR-058 fase 2 | ❌ Abierto | `plat-ops` + `sr-backend`; checklist #10 |
| SUB-M03 `TaxRegime` derogado | ❌ Abierto | `TaxRegime { SIMPLIFIED, COMMON }`: la Ley 1943 de 2018 eliminó el régimen simplificado; hoy es «responsable / no responsable de IVA» y las responsabilidades RUT. Requiere el **dictamen del contador** y un cambio de contrato con Billing |
| SUB-M04 DV del NIT y representante legal | ⚠ Parcial | El DV se valida si viene (`subscribers.service.ts:274-280`), pero sigue siendo opcional en el schema (`subscriber.schema.ts:144, 202`), igual que el representante legal (`:147, 205`) |
| SUB-M05 doble fuente del IVA | ✅ | `_suggestVatInSchema` ya no existe; fuente única por punto de servicio (ADR-093) |
| SUB-M06 accesos sin registro | ✅ | `await auditRecordAccess` (`subscribers.controller.ts:363, 463`); `LIST_ACCESS` esperado (`:475`) |
| SUB-M07 placeholders | ❌ **E-3 decidido: opción (a)**, sin implementar | `subscriber-creation.service.ts:280, 309`; columnas `email_encrypted` y `phone_encrypted` `NOT NULL` (`subscriber.entity.ts:107, 110`) |
| SUB-M08 búsqueda sin trigram | ✅ | Índices trigram en la migración 143 |
| SUB-M09 HMAC sin normalizar | ✅ | `normalizeDocumentNumber` (C-NORM-1); en CI: «deduplica Party por HMAC cuando el formato del documento cambia» |
| SUB-M10 eventos para otros módulos | ✅ Preventivo | Ningún `@OnEvent('crm.subscriber.*')` fuera de CRM en `apps/api` ni en `apps/worker` |
| SUB-M11 criterios de ADR-067 | ✅ Materialmente cumplidos | Finalidad por campo (`subscriber-projection.ts:4-17`), `LIST_ACCESS`, mapa ratificado, cita en `.github/instructions/api.instructions.md`. Solo faltaban las casillas del ADR, que se marcan con esta re-auditoría |

### 2.4 Bajos

| ID | Estado | Evidencia |
| --- | --- | --- |
| SUB-B01 índices sobre columnas cifradas | ✅ | B1 |
| SUB-B02 sin FK de `legal_representative_id` ni `expediente_id` | ❌ Abierto | No hay FK en las migraciones tenant |
| SUB-B03 dos modelos de consentimiento | ✅ | `data_authorizations` es la fuente; `crm/habeas-data` responde 410; las tablas heredadas quedan solo como origen del backfill |
| SUB-B04 la entidad declara `varchar` donde la DDL usa `enum` | ❌ Abierto | `subscriber.entity.ts:50-61` |
| SUB-B05 dominio real en el placeholder | ❌ → se cierra con E-3 | `subscriber-creation.service.ts:280` |

## 3. Checklist de salida (§8), re-evaluado

| # | Criterio | Estado | Evidencia o bloqueo |
| --- | --- | --- | --- |
| 1 | Cero críticos y cero altos | ❌ | A06 parcial → **D-1B** |
| 2 | `party` deduplica por HMAC; cero documentos en claro | ⚠ | Código ✅ y B5 en CI ✅; los conteos por tenant se obtienen en G7 (runbook B13) |
| 3 | Sin PII en query string | ✅ | §2.1 C02 |
| 4 | Regla del IVA con dictamen y ADR aprobado | ⚠ | ADR-093 aprobado ✅; faltan los cuatro puntos del dictamen del contador (ADR-093 §6) |
| 5 | Conversión: unicidad, registro de fallos y reactivación | ❌ | Unicidad y reactivación ✅. **El registro de fallos no funciona** (A01 reabierto) → F1 |
| 6 | Proyección = mapa campo × rol | ✅ | B2 y B6 (G6 2026-10-12) |
| 7 | Acceso auditado y esperado, sin PII | ✅ | §2.3 M06 y A08. Deuda transversal: `AuditService.log` es fail-open (B7-04) |
| 8 | Consentimiento previo al alta; evidencia de solo-anexar | ✅ | A18 y los triggers de la 146 (Fase 1a, G6.5) |
| 9 | Plazos en días hábiles con alerta | ✅ | C-CAL-1 con festivos y el job de alertas (Q6) |
| 10 | ADR-058 fase 2 desplegada | ❌ | M02 |
| 11 | Cobertura ≥ 80 % sin caché | ✅ | `crm/subscribers` 97,44 / 89,24; `parties` 94,24 / 88,00 (G6 del 12-10); `privacy` 96,50 / 87,53 (Fase 1a). `crm/habeas-data` se retiró (410) y no aplica |
| 12 | Migraciones `up/down/up` en un tenant con datos | ⚠ | Probadas en schema efímero con fixtures (143–147). Sobre un tenant con datos, en G7 |
| 13 | SEC-ENG GO sobre el diff | ✅ | GO de MOD05 (B7), de IVA/D-PDF y de la Fase 1a (SEC v1.1) |
| 14 | G6.5: CI por SHA | ✅ | `38735918857` |

**Resultado:** 8 ✅ · 4 ⚠ · 2 ❌ (los criterios #1 y #10). **Corrección del 2026-10-15: 7 ✅ · 4 ⚠ · 3 ❌; se suma el #5 por A01.**

## 4. Lo que falta para producción, por camino

| # | Trabajo | Dueño | ¿Bloquea G7? |
| --- | --- | --- | --- |
| 1 | **D-1B**: ejecutar la Fase 1b (bloqueo y anonimización) antes de producción, **o** salir con un procedimiento manual documentado (runbook con SLA) y hacer la Fase 1b después | CTO decide; AI-EM-ARCH recomienda la segunda opción (§5) | Sí, como decisión |
| 2 | **E-3 (a)**: relajar `NOT NULL` del contacto, eliminar los placeholders, bloquear la activación sin contacto real y limpiar los placeholders existentes por tenant | AI-EM-ARCH (plan) → `data-eng`, `sr-backend`, `fe-platform` | Sí |
| 3 | **ADR-058 fase 2** (M02) | `plat-ops` + `sr-backend` | Sí (#10) |
| 4 | **Dictámenes**: contador (ADR-093 §6, más M03) y jurídico (ADR-094 §7.3) | CTO | Sí |
| 5 | **G7 por tenant**: backup, migraciones, backfills de la 143 y la 146, conciliación, MinIO privado y publicación del texto de autorización | AI-EM-ARCH (plan) → `plat-ops`, `sr-qa` | Es G7 |
| 6 | M03 `TaxRegime` | Tras el dictamen → `sr-backend` + Billing | Recomendado antes de facturar |
| 7 | M04 DV y representante legal obligatorios para persona jurídica; B02 FK; B04 tipos `enum` | `sr-backend`, `data-eng` | No |
| 8 | `birth_date` cifrada (decisión P3) y `AuditService` fail-closed (B7-04, transversal) | CTO / `sec-eng` | No |

## 5. Recomendación sobre D-1B

**Salir con un procedimiento manual y hacer la Fase 1b después**, porque:
- La ley exige **atender** la supresión dentro de los plazos legales, y eso ya funciona: radicación, plazos, resolución y no procedencia con fundamento.
- Para un cliente, la supresión procedente es rara: la conservación es de 5 años (Decreto 1704) y la de la facturación, de 10 (Ley 962). La mayoría de las solicitudes terminan en «no procede + bloqueo».
- El bloqueo puede aplicarse a mano mientras tanto: restringir el acceso al registro y anotarlo en la solicitud.

**Requisitos de esa ruta:**
- un runbook del operador con un SLA;
- reportar en la bandeja las solicitudes con `DATOS_BLOQUEADOS` pendientes de efecto técnico;
- la Fase 1b planificada con fecha.

Si el CTO prefiere no asumir ese riesgo, la Fase 1b pasa delante de G7 y entra en la ruta crítica.

## 6. Decisiones del CTO (2026-10-15)

- **D-1B:** la Fase 1b va **después** de producción, con el [runbook manual de bloqueo y supresión](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md), con SLA. El runbook y su Anexo A son precondición de G7. El criterio #1 del checklist queda **aceptado con mitigación** mientras exista ese runbook.
- **HLD de privacidad:** [HLD-PRIVACY-HABEAS-DATA-v1.0](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.0.md) **aprobado**.
- **E-3 (a):** plan emitido en [2026-10-15-mod05-e3-contacto-pendiente.md](../plans/2026-10-15-mod05-e3-contacto-pendiente.md).

## 7. Actualización tras el G6 de E-3 (2026-10-15)

[Cierre G6 de E-3](INFORME-MOD05-E3-CIERRE-G6-v1.0.md):
- SUB-A01 → ✅ (reabierto y cerrado de punta a punta);
- SUB-M07 y SUB-B05 → ✅ en código, con la limpieza por tenant en G7;
- el criterio #5 vuelve a ✅.

**Checklist: 8 ✅ · 4 ⚠ · 2 ❌.** Siguen abiertos el #1 (A06, mitigado por D-1B y el runbook) y el #10 (ADR-058 fase 2). G6.5 de E-3: ✅ GO (CI [`38793545136`](https://github.com/Sleybc/iWana-neXt/actions/runs/38793545136)).


## 8. Actualización tras la Fase 1b de privacidad (2026-10-17)

[Cierre de la Fase 1b](INFORME-PRIVACY-FASE-1B-CIERRE-G6-v1.0.md): G4, G6 y G6.5 en **GO** (CI [`38992139163`](https://github.com/Sleybc/iWana-neXt/actions/runs/38992139163), `34e66adc`).

- **SUB-A06 → ✅.** La supresión procedente anonimiza en la misma transacción que `resolve`, en CRM, Party, usuarios dados de baja, Media, WFM y `tasks`. El bloqueo se aplica en lectura, en búsqueda y en toda mutación. E2E 4/4 contra la API real.
- **D-1B queda cumplida antes de producción.** El [runbook manual](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md) pasa a vía de emergencia (más de 500 expedientes, o un participante no disponible).
- **Criterio #1 → ✅:** sin críticos ni altos abiertos. V2″ de `sec-eng`: GO.
- **Criterio #10 → ⚠:** la fase 2 de ADR-058 está **implementada y revisada** (K1/K2 en `785b50c7`, GO de `sec-eng` en K3, recifrado ensayado con datos en M2d). Solo falta desplegarla, que es G7, diferido hasta la beta ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)).
- **HLD:** [HLD-PRIVACY-HABEAS-DATA-v1.1](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.1.md) (aprobado el 2026-10-17) reemplaza a la v1.0.

**Checklist: 10 ✅ · 4 ⚠ · 0 ❌.** Los ⚠ (#2, #4, #10 y #12) dependen de G7 por tenant o del dictamen del contador. *Recuento hecho fila por fila sobre la tabla de §3: los totales escritos en §3 y §7 tenían un ✅ de menos (tras E-3 eran 9 ✅ · 3 ⚠ · 2 ❌).*

**Deuda de código MOD05 que sigue abierta**, para la fase siguiente:
- M03: responsabilidad de IVA y responsabilidades del RUT (ADR-093);
- M04: dígito de verificación del NIT y representante legal obligatorio;
- `contracts.fiscal_document` en claro (P2, hallado en la Fase 1b);
- B02: llaves foráneas;
- B04: tipos enum.
