# INFORME — MOD05 + `privacy` · Preparación de G7 (lado módulo)

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Emisor:** AI-EM-ARCH (consolidación; los veredictos son de los bloques citados)
**Plan:** [2026-10-15-mod05-privacy-g7-release.md](../plans/2026-10-15-mod05-privacy-g7-release.md) · **Prompt:** [PROMPT-MOD05-PRIVACY-G7-v1.0](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md), §1 a §6
**Estado:** **lado módulo listo, con una condición (M2d)**. **G7 NO-GO**, porque falta el frente P (plataforma). G7 lo aprueba el CTO; este informe no lo concede.

## 1. Frentes

| Frente | Estado | Evidencia |
| --- | --- | --- |
| **K** · ADR-058 fase 2 | ✅ | [K1](INFORME-MOD05-G7-K1-v1.0.md): claves PII y MFA separadas, con fail-closed en producción · [K2](INFORME-MOD05-G7-K2-v1.0.md) y [K2Δ](INFORME-MOD05-G7-K2-v1.1.md): recifrado MFA → PII solo sobre tablas migradas, con test invariante · [K3](INFORME-MOD05-G7-K3-SEC-v1.0.md): GO de `sec-eng` |
| **M** · Release por tenant | ✅ con la condición M2d | [M1](INFORME-MOD05-G7-M1-v1.0.md) y [M3](INFORME-MOD05-G7-M3-v1.0.md): runbook y Compose cableado · [M4](INFORME-MOD05-G7-M4-v1.0.md): `--rollback-in-place` (SPEC restore v1.1), GO formal de `sec-eng` · [M2c](INFORME-MOD05-G7-M2-ENSAYO-v1.2.md): pasos 1 a 11 completos (detalle abajo) |
| **C** · Calidad | ✅ | [C1](INFORME-MOD05-G7-C1-v1.0.md): branches de `crm/expedientes` en 81,44 % |
| **Correcciones aparecidas en el ensayo** | ✅ | [L1](INFORME-MOD05-G7-L1-v1.0.md): HMAC del login desde `ConfigService` (deuda P3 pagada) · [D-CONT](INFORME-MOD05-G7-D-CONT-v1.0.md): `ContactsModule` desmontado |
| **P** · Plataforma | ❌ | Dominio, TLS, rollback por componente y restore global siguen abiertos; faltan las **seis decisiones del CTO** |

### Detalle del ensayo M2c

| Pasos | Resultado |
| --- | --- |
| 1–2 | Backup y restore aislado; migraciones públicas hasta la 027 y tenant hasta la 148 |
| 3–6 | B13, conciliación de la 146 según G7-4, placeholders y recifrado verificado en 0 |
| 7 | Texto legal y Oficial |
| 8 | Media validado en vivo: bucket privado, TTL de 300 s y endpoints genéricos con 400 y 404 |
| 9 | Smoke 4/4 y job de BullMQ consumido en 2,2 s |
| 10 | Procedimiento manual |
| 11 | Rollback en sitio en 2,5 s, con conteos idénticos, y su reversión |

## 2. Condición M2d (antes de G7)

En M2c el tenant sintético **estaba vacío** para los backfills:
- B13 con 0 candidatos;
- 0 placeholders;
- recifrado con `candidates=0`.

Cada CLI tiene su integración con datos (B5, `backfill-placeholder-contacts`, K2Δ), pero el **orden del runbook con datos** no se ensayó. C-M2 pedía un tenant sembrado con el estado previo realista.

**M2d:** repetir los pasos 3 a 6 desde `59e425ee^` con un tenant sembrado con:
- documentos de Party en claro y cifrados;
- placeholders;
- PII cifrada con la clave MFA;
- `consent_records` heredados.

Los conteos de cada paso deben ser distintos de 0 y el recifrado debe verificar en 0.

**✅ M2d cumplida (2026-10-16)** — [ensayo v1.3](INFORME-MOD05-G7-M2-ENSAYO-v1.3.md), con datos:
- B13 detectó 1 candidato de fusión, que se resolvió;
- la conciliación dio `sin_party=1`;
- 2 correos y 2 teléfonos placeholder, con 1 suscriptor `ACTIVE` sin contacto;
- el recifrado tuvo 45 candidatos y 35 recifrados, y verificó en 0;
- los segundos `--apply` fueron idempotentes.

El lado módulo de G7 queda **listo sin condiciones**. G7 sigue diferido hasta la beta mínima ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)).

## 3. Observaciones aceptadas del ensayo

| Observación | Disposición |
| --- | --- |
| 8c en desarrollo responde 503 `STORAGE_MUST_BE_PRIVATE`, porque `.env.development` define `S3_PUBLIC_BASE_URL` | Correcto: es el fail-closed de la guarda. Se validó con una API en modo `staging` |
| La confirmación TTY de `restore-tenant.mjs` se operó con `DB_NAME` divergente y `--into` | Se acepta para el ensayo: los tests de M4 cubren la confirmación. **En la ventana real rige la confirmación TTY** |
| Menores de `sec-eng` en M4 (M-1 valor del enum en el rechazo; M-2 `PGPASSWORD` por `docker exec -e`; M-3 operador del SO en el resumen) | Backlog de `plat-ops`; no bloquean |

## 4. Hallazgo nuevo de la auditoría TA1

[INFORME-AUDITORIA-ENTIDADES-SIN-TABLA-v1.0](INFORME-AUDITORIA-ENTIDADES-SIN-TABLA-v1.0.md): 132 entidades auditadas. Los cuatro casos conocidos quedan confirmados como P3, porque están desmontados o inertes.

**O-1 (P1):** `OpportunitiesModule` está **montado** (`crm.module.ts:42`), con un repositorio en uso (`opportunities.service.ts:44`) y las rutas `POST/GET /opportunities` y `GET/PATCH /opportunities/:id`, pero **la tabla `opportunities` no existe** (ninguna migración la crea). AI-EM-ARCH verificó además:
- ni `apps/portal` ni `apps/web` lo consumen;
- `quotes.opportunity_id` (migración 028) es una columna **sin FK**;
- la mención en WFM es solo un cálculo sobre una etiqueta.

Desmontarlo no rompe nada.

**D-OPP (decide el CTO):** AI-EM-ARCH recomienda **desmontarlo** con el mismo patrón que D-CONT (comentario, más un spec que fije el desmontaje). Si el pipeline de oportunidades sigue vigente en el roadmap, va con una fase propia y su migración.

## 5. Decisiones del CTO pendientes para G7

1. **Las seis decisiones de infraestructura** (frente P): FQDN, hosting, CA y ACME, propietario del DNS, ventana y RPO/RTO.
2. **La contingencia de la Ley 2573** (19-11-2026): adelantar el frente P o preparar el procedimiento manual en el sistema del ISP (plan §4).
3. **D-OPP.**
4. **Los dictámenes** del contador (ADR-093 §6 y M03) y jurídico (ADR-094 §7.3).
