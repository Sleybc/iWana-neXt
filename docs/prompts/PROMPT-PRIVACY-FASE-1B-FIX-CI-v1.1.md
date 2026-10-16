# PROMPT — `privacy` Fase 1b · Corrección del CI de `main` · v1.1 (portal)

**Versión:** 1.1 (sigue a [v1.0](PROMPT-PRIVACY-FASE-1B-FIX-CI-v1.0.md), que cerró la API) · **Fecha:** 2026-10-16 · **Estado:** Ejecutado (commit `0af184d4`) · **Emisor:** AI-EM-ARCH · **Agente:** `fe-platform` (dueño de B4) · **Base:** `main` en `8f393c1d`
**Evidencia:** CI [`38949223069`](https://github.com/Sleybc/iWana-neXt/actions/runs/38949223069): el E2E operativo pasó (la API arranca); falló `@iwana/portal#test`, con 1 suite y 30 tests en rojo

## Fallo

| Archivo | Síntoma | Causa |
| --- | --- | --- |
| `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx` | 30 tests no encuentran el contenido del detalle; la página muestra «Datos bloqueados» | `page.tsx:275` usa `expediente?.privacyRestricted !== false`: si el campo no llega, la página se trata como bloqueada. Los fixtures del spec son anteriores a la Fase 1b y no traen `privacyRestricted` |

## Decisión del emisor (no se cambia)

**Ante la duda, se oculta:** si el campo falta, la página se trata como bloqueada.
- La API siempre envía `privacyRestricted` en el bootstrap y en el detalle (`expedientes.controller.ts:228` y `:266`), así que en uso real no hay falso bloqueo.
- Si un endpoint dejara de enviarlo, mostrar los datos sería el error irreversible.
- Por eso `page.tsx` **no se modifica**: se corrigen los fixtures.

## Encargo

1. Agregar `privacyRestricted: false`, `privacyMarks: []`, `anonymizedAt: null` y `anonymizedRequestId: null` a los fixtures de bootstrap y de detalle de `page.spec.tsx`, con la forma del contrato de v1.1 §3.3. No debilitar ninguna aserción existente.
2. Agregar un test que fije la decisión: un bootstrap **sin** `privacyRestricted` muestra «Datos bloqueados» y no muestra datos personales.
3. Buscar en `apps/portal/src/**/*.spec.tsx` otros fixtures de expediente, suscriptor o contrato sin los campos de la Fase 1b que pasen solo por casualidad, y listarlos en el informe.

## Evidencia obligatoria

- La suite **completa** de `@iwana/portal` sin caché (`pnpm --filter @iwana/portal exec jest --no-cache`), con el conteo real; no solo la carpeta tocada.
- Typecheck de `@iwana/portal`.
- Para cerrar el hueco de este run, la línea de comando que usa el CI para todas las suites: `pnpm exec turbo run test --force --continue`, con los totales por paquete. Turbo cortó las otras seis tareas cuando falló el portal, así que en CI no quedaron verificadas.

## Reglas

- No modificar contratos ni `page.tsx`; si falta algo, `[BLOQUEO]` y parar.
- Ninguna PII real en fixtures: solo valores sintéticos. No commitear.
- Informe: `docs/informes/INFORME-PRIVACY-FASE-1B-FIX-CI-v1.1.md`, con la ruta verificada como libre.
