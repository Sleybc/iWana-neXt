# Prompt de ejecución — Plataforma / remediación operativa

**Versión:** 1.0  
**Fecha:** 2026-08-08  
**Modo emisor:** AI-EM-ARCH Orquestador  
**Plan:** `docs/plans/2026-08-08-remediacion-operativa-pendientes.md`

## Objetivo y contratos congelados

Implementar los controles versionables de la remediación pendiente. No cambian API, UI, schemas, topología ni contratos. Se conserva Docker Compose on-prem y la precedencia `shell > .env.development.local > .env.development > .env`.

## Entradas

- `AGENTS.md` y `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`.
- `docs/informes/INFORME-PLATAFORMA-REMEDIACION-RAIZ-v1.0.md`.
- Plan asociado.

## Destinatarios

- **AI-PLAT-OPS:** Tarea 1; usar `docker-expert`.
- **AI-SR-FULL:** Tarea 2; usar prácticas de seguridad backend y consultar a SEC-ENG.
- **AI-SR-QA / AI-SEC-ENG:** Tarea 3 y revisiones independientes, sin revelar secretos.

## Restricciones

- No leer ni modificar `.env`, `.env.development` o `.env.development.local` existentes.
- No imprimir secretos, PEM, credenciales, payloads ni configuraciones Docker interpoladas.
- No ejecutar revocación, purga de historia, borrado de backups ni cambios a servicios remotos.
- No tocar archivos fuera de la propiedad asignada ni hacer commits.

## Salida y stop/go

Cada responsable entrega diff, comandos y evidencia sanitizada. Cualquier operación externa se registra exactamente como `[ESCALACION AL CTO]`; G6/G6.5/G7 no se declaran sin evidencia ejecutada.
