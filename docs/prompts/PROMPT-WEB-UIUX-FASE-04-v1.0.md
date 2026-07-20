# PROMPT — WEB-UIUX — Fase 04: filtros y export server-side de auditoría — v1.0

## Módulo

- Nombre: Consola de plataforma (apps/web) — remediación UI/UX
- Código: WEB-UIUX
- Fase: 04
- Versión: 1.0
- Fecha: 2026-07-20
- Generado por: AI-EM-ARCH (Orchestrator → ejecución)
- Agentes: AI-SR-FULL (API) + AI-FE-PLATFORM (web)

---

## 1. Objetivo

Filtros de acción/fechas y export CSV de auditoría operan **sobre el conjunto filtrado en servidor**, no solo sobre la página cargada. Eliminar el aviso de “solo página actual” cuando el export/filtro ya sea server-side.

## 2. Backend (AI-SR-FULL)

1. Paridad de filtros en `platform-audit`: soportar `fromDate` / `toDate` (ISO) como en `QueryAuditLogsDto` / `AuditQueryService`.
2. Opcional útil: query `actions` (lista separada por coma) si el resumen envía `actionSet`; si no cabe en tiempo, documentar y mapear FE a una acción o N requests.
3. Endpoint(s) de export CSV (plataforma + tenant) con los mismos filtros y roles actuales (`SYSTEM_ADMIN` / `IWANA_SUPPORT` / roles tenant según endpoint existente). Límite duro documentado (p. ej. máx. 5000 filas) + header/aviso si se trunca.
4. Actualizar OpenAPI/Swagger en controllers. Tests unitarios del servicio (filtros fecha + export truncado).
5. Sin PII extra en CSV (mismos campos que el export actual de FE). Sin `synchronize`.

## 3. Frontend (AI-FE-PLATFORM)

1. Elevar filtros de `AuditLogsTable` (acción, dateFrom, dateTo) al page o props controladas; pasarlos a `platformAuditApi.list` / `auditApi.list`.
2. Extender `platformAuditApi` en `api-client.ts` con `from`/`to` (y export si aplica).
3. Al cambiar filtros: reset cursor/página y recargar.
4. Export: llamar endpoint server-side (preferido) o, si SR-FULL entrega solo list+filtros, paginar en cliente hasta límite con filtros server — **no** exportar solo `filteredEntries` de la página.
5. Quitar copy de “solo página actual” cuando ya no aplique; si export trunca, rotular “export limitado a N registros”.
6. Severity/`actionSet` del resumen: si el API no acepta set, filtrar client-side **solo severity** sobre la página server-filtrada, o mapear actionSet a `actions` query.

## 4. Restricciones

- Multi-tenant: tenant audit sigue resolviendo schema vía JWT/`X-Tenant-Slug` aprobado.
- Copy español sentence case.
- No tocar auth ni Button lima (otro delta).

## 5. CA

- CA-401: cambiar filtro acción/fecha dispara request con query params al API.
- CA-402: export CSV incluye registros más allá de la página visible (hasta el límite).
- CA-403: lint/typecheck api+web; specs audit tocados en verde.
- CA-404: OpenAPI refleja nuevos query/export.

## 6. Stop/go

Detenerse si el export exige job BullMQ asíncrono por volumen — escalar a EM-ARCH con opción sync limitada vs async.
