# PROMPT — MOD11 Consola OT · Ola 2b · R2 evidencia y firma

**Versión:** 1.0 · **Fecha:** 2026-10-05 · **Destinatario:** `fe-platform`
**Estado:** preparado; despacho condicionado al GO revisado de B0 y a su handoff de slots.
**G4 — revisado y adoptado por AI-EM-ARCH el 2026-10-05.** No lo emitió el orquestador. Se contrastó con el informe B0 §5 (propiedad de archivos), con el dictamen G3 y con las condiciones registradas en el plan v1.2. Se adopta sin cambios de alcance.

## 1. Entrada y trazabilidad

Lee AGENTS.md, bootstrap y reglas por path. Consume el plan `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2; UX `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.1 §§3–5,8–9; contrato `docs/specs/2026-10-05-mod11-consola-ot-requisito-contrato-componente.md` v1.0; API execution-orders v1.4 y completion v1; dictamen G3 §§2.1–2.3,3,8 e informe B0. La plantilla de ejecución v1.2 se cita como propuesta; AGENTS.md gobierna el destino documental.

## 2. Encargo y ownership

Posees `ExecutionOrderEvidenceAction.tsx`, `ExecutionOrderSignatureCapture.tsx`, `use-execution-order-evidence.ts` y sus pruebas. Consume las props documentadas por B0. Puedes ampliar únicamente los wrappers de evidencia/media de `apps/portal/src/lib/api-client.ts` si el contrato existente lo exige. No estás solo: conserva las ediciones ajenas. No edites drawer, checklist, contenedor por momento, fachada, refresh, material ni ventana.

La acción nace del requisito: publica su `requirementKey` y el `evidenceType` de su descriptor; no uses una clave global hardcodeada. Conserva snapshots v1 y el historial por clave. Para SIGNATURE usa canvas nativo y PNG, sin dependencias. Envía el artefacto por el transporte existente, con el `expiresAt` del recibo de su propia carga. La captura no ejecuta el cierre ni sustituye el registro de conformidad de `close()`.

Mantén «Analizando archivo», espera acotada antes de registrar AVAILABLE y error terminal. Al agotar la espera conserva el recibo y reanuda el registro del mismo `mediaAssetId`, sin repetir upload. Ignora resultados obsoletos al cambiar de OT/requisito o desmontar. **Condición del plan:** mide p95 del análisis en el entorno real, registra muestra y método, y calibra el tope con ese dato. Una medición simulada no cumple esa condición; si falta entorno, emite [BLOQUEO] específico y conserva los demás entregables verificables.

Instrucciones y controles Limpiar/Guardar firma/Cancelar operables por teclado, foco visible y anuncios accesibles. Solo el trazo queda exceptuado por WCAG 2.1.1; no aceptes nombre escrito como SIGNATURE. Respeta permiso publicado, offline, momento y límite de archivo. No agregues arrastre de archivos.

## 3. Skills antes de escribir

Lee frontend-dev-guidelines, nextjs-app-router-patterns, core-components, wcag-audit-patterns, testing-patterns, iwana-identity-ui-review. Usa systematic-debugging para fallos y test-driven-development para reproducciones. Sin tokens nuevos ni cambios de contrato.

## 4. Verificación y stop/go

Prueba payloads PHOTO/DOCUMENT/SIGNATURE, expiresAt, PENDING→AVAILABLE, terminal, timeout→reintento mismo asset, navegación durante sondeo, canvas vacío y controles teclado; cierre conserva su semántica. Typecheck portal; Jest operations/ sin caché (baseline B0, sin perder pruebas); audit-ui.mjs limpio; navegador con firma y estado de análisis. Declara fixtures y transporte simulado por separado de entorno real.

GO exige CA-08/09, gates y condición p95 cumplidos, sin P1 ni bloqueo pendiente. Informe `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2B-R2-FE-PLATFORM-v1.0.md`: rutas, conteos, comandos, Cached: 0, evidencia, deuda y [BLOQUEO]/[CONSULTA]. No hagas commit ni push: integra el padre.
