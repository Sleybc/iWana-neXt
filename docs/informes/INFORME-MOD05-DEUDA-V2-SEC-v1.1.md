# INFORME-MOD05-DEUDA-V2-SEC-v1.1

**Fecha:** 2026-10-17  
**Re-verificación:** V2′ · alcance M-1 y guardia DTO de §2.1  
**Base:** `main` en `e2348a42` + diff actual A/B  
**Modo:** re-verificación final independiente en solo lectura; sin cambios de código ni acceso a bases de datos. El archivo ya existía como informe preliminar compartido y esta revisión agrega evidencia actualizada.  
**Fuentes leídas:** `AGENTS.md`, Perfil AI-SEC-ENG (Parte II), Protocolo §6, PRD MOD05 Subscribers, HLD MOD05, delta v1.2 §2.1/§2.4, V2 v1.0; skills `security-auditor` y `backend-security-coder`.

## Veredicto

**GO para M-1 y la guardia de §2.1.** M-1 está cerrado: no encontré exposición del nombre del representante cuando su propio Party está bloqueado ni una ruta que devuelva un nombre real al actor sin permiso. La guardia ahora recorre uniones e intersecciones para detectar arreglos y pasa tanto el vector nullable negativo como el escaneo de los tres roots DTO asignados.

## Evidencia M-1

- [subscribers.controller.ts](../../apps/api/src/modules/crm/subscribers/subscribers.controller.ts:669) resuelve el permiso (`PRIVACY_READ` o `CRM_BLOCKED_DATA_READ`) y lo propaga a listado, búsqueda, detalle y 360°; la lectura 360° lo pasa al servicio en :571.
- [subscribers.service.ts](../../apps/api/src/modules/crm/subscribers/subscribers.service.ts:1049) obtiene los Party representantes por lote y consulta `IPrivacyMarksReadPort.activeMarks` por lote. Si el puerto de marcas no está disponible, falla cerrado con `503 PRIVACY_MARKS_UNAVAILABLE`.
- Un Party con marca activa `DATOS_BLOQUEADOS` proyecta «Datos bloqueados» sin permiso; con permiso conserva su nombre. Para anonimización, el borrado escribe el marcador `ANONIMIZADO` en `party.display_name` ([party-titular-erasure.participant.ts](../../apps/api/src/modules/parties/privacy/party-titular-erasure.participant.ts:23), constante en `titular-erasure-sql.ts:51`), que el servicio expone como «Anonimizado» (:1075-1081). Las proyecciones de detalle y listado toman el valor ya redactado.
- La prueba unitaria usa valores sintéticos y cubre ambos marcadores y acceso privilegiado ([subscribers.service.spec.ts](../../apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts:774)). `pnpm --config.use-node-version=24.18.0 --filter @iwana/api exec jest --no-cache --cacheDirectory .cache/jest-tmp --runInBand src/modules/crm/subscribers/tests/subscribers.service.spec.ts --testNamePattern='redacta el nombre cuando el Party representante está bloqueado y etiqueta el anonimizado'` → **1 test pasó, 0 fallos** (73 no seleccionados).

## Evidencia de guardia DTO

- [dto-allow-array.architecture.spec.ts](../../apps/api/src/common/dto-allow-array.architecture.spec.ts:51) descompone uniones/intersecciones y considera arreglos y tuplas; la prueba sintética ahora falla para `ElementDto[] | null` sin `@Type` y acepta arreglos de objetos tipados y arreglos primitivos (:108). El test de escaneo cubre los roots `crm/subscribers/dto`, `crm/expedientes/dto` y `tasks/dto`. `pnpm --config.use-node-version=24.18.0 --filter @iwana/api exec jest --no-cache --cacheDirectory .cache/jest-tmp --runInBand src/common/dto-allow-array.architecture.spec.ts` → **1 suite, 2 tests, 0 fallos**.
- Los siete casos señalados en §2.1 pasan con los pipes globales reales en [global-validation-pipes.http.spec.ts](../../apps/api/src/common/pipes/global-validation-pipes.http.spec.ts:69): alta con `authorizations`, representante legal y `rutResponsibilities` de alta/edición, `snapshotJson`, y los dos objetos de cierre de orden. `pnpm --config.use-node-version=24.18.0 --filter @iwana/api exec jest --no-cache --cacheDirectory .cache/jest-tmp --runInBand src/common/pipes/global-validation-pipes.http.spec.ts` → **1 suite, 9 tests, 0 fallos** en la corrida elevada.
- El intento no elevado de HTTP falló al abrir sockets loopback: `connect EACCES 127.0.0.1:57538` (también en los siguientes puertos efímeros); el mismo comando con ejecución elevada pasó. Los comandos focales usaron `--no-cache` y `--cacheDirectory .cache/jest-tmp`. M-1 usa valores sintéticos y no requiere DB/Redis. No se hicieron llamadas a `dbiw`.

## Límites

Este GO se limita a M-1 y la guardia §2.1. V1′ se completó después de la primera revisión: 12/12 E2E pasaron tras observar cero tenants `MARKED_FOR_DELETION`; el historial de `EACCES` resuelto consta en [informe V1′](INFORME-MOD05-DEUDA-V1-QA-v1.1.md). Este informe no sustituye los gates monorepo V4′.
