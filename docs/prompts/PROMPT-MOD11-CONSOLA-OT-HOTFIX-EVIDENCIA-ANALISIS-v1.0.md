# PROMPT DE EJECUCIÓN — MOD11 · Hotfix: la evidencia se registra antes de que el archivo esté disponible

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-FE-PLATFORM** (`fe-platform`)
**Tipo:** defecto probable en producción, fuera de la secuencia de la Ola 2. **Va antes del seam B0** de la Ola 2b, porque los dos tocan `use-execution-order-console.ts`.

## Vínculos de trazabilidad

- Hallazgo: `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2-G3-FE-PLATFORM-v1.0.md`, §2.1
- Origen funcional: observación 6 de la auditoría de la OT: «debe tener la posibilidad de subir los documentos de evidencias»
- Contrato: `packages/shared/src/contracts/operations/execution-orders.ts` v1.4. Sin cambios.

## 1. Defecto, según el código

1. El portal sube el archivo y **registra la evidencia de inmediato** (`use-execution-order-console.ts:569-587`).
2. La subida deja el asset en cuarentena con estado `PENDING_ANALYSIS` y encola el análisis asíncrono (`media/evidence-asset.provider.ts:135-159`, `:367-383`).
3. `registerEvidence()` rechaza todo asset que no esté `AVAILABLE`, con el error `EVIDENCE_ASSET_NOT_AVAILABLE` (`execution-orders.service.ts:2172-2177`).

Salvo que el análisis termine antes de la segunda petición, **la evidencia no queda registrada**.

## 2. Alcance exacto

1. **Primero, reproducir.** Escribe un test del hook en el que el recibo de subida venga en `PENDING_ANALYSIS`, y comprueba qué hace hoy. Si con evidencia demuestras que el flujo actual ya espera, cierra el encargo como **no-op**, informando cómo se descartó el defecto.
2. **Si se reproduce:**
   - Después de subir, consulta `GET :id/evidence-assets/:mediaAssetId` (`execution-orders.controller.ts:561-569`) hasta obtener `AVAILABLE`. El intervalo y el tope de intentos van **acotados**, y ambos se declaran en el informe.
   - Solo entonces se registra la evidencia, con el mismo `expiresAt` del recibo.
   - `REJECTED`, `EXPIRED` o agotar el tope producen un error visible que no pierde el archivo elegido.
   - Añade a `apps/portal/src/lib/api-client.ts` el wrapper tipado de ese `GET`. **Sin endpoint nuevo.**
3. **Copy mínimo:** un estado «Analizando archivo» mientras se espera, y el error de rechazo. Español y sentence case. **Nada de rediseño**: el uploader conserva su ubicación y su lógica de destino actuales; el selector por requisito es R2.

**Fuera de alcance:** la firma, el selector de requisito y la estructura del drawer.

## 3. Skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `frontend-dev-guidelines`, `testing-patterns` |
| **De apoyo** | `system-vocabulary-review`, para los dos textos nuevos |
| **Descartadas** | `ui-ux-pro-max`, porque no hay presentación nueva; `playwright-skill`, salvo que el test unitario no pueda reproducir el caso |

## 4. Gates y stop/go

**Gates:**

- `pnpm --filter portal typecheck`;
- jest de `operations/` con `Cached: 0`, sin bajar de 366;
- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos tocados.

**GO:** el test reproduce el defecto y después pasa, la espera está acotada y los estados terminales de error son visibles. O bien el no-op queda demostrado con evidencia.

**Entrega:** el informe `docs/informes/INFORME-MOD11-CONSOLA-OT-HOTFIX-EVIDENCIA-ANALISIS-v1.0.md`.
