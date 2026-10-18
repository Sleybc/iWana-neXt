# ADR-096: Configuración de Next.js 16.4 en portal y web (partialPrefetching y agentRules)

**Versión:** 1.0
**Estado:** Propuesto
**Fecha:** 2026-10-18
**Modo activo:** Architect + EM
**Autor:** AI-EM-ARCH
**Decisión del CTO:** D4 del plan PLAT · Dependencias críticas, opción A (alcance de escritura), aprobada el 2026-10-18. Este ADR **no** está aprobado: su aprobación es un acto aparte del CTO.
**Relacionado:** [ADR-095](ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md) (formato de referencia; no se afecta), plan [`docs/plans/2026-10-18-plat-deps-criticas.md`](../plans/2026-10-18-plat-deps-criticas.md) (§1, D1 y D4), encargo [`docs/prompts/PROMPT-PLAT-DEPS-CRITICAS-v1.0.md`](../prompts/PROMPT-PLAT-DEPS-CRITICAS-v1.0.md) (§0.2)

## Contexto

- La fase PLAT · Dependencias críticas sube `next` de 16.2.12 a 16.4.2 en `apps/portal` y `apps/web` (decisión D1-A, 2026-10-18), por el aviso de seguridad del 2026-10-14, que publica parches en 16.4.1 y 15.5.28.
- Ambas apps tienen Cache Components activo: `cacheComponents: true` en `apps/web/next.config.ts`, y en `apps/portal/next.config.ts` salvo `IWANA_DISABLE_CACHE_COMPONENTS=1`.
- Con `cacheComponents` activo, Next 16.4 avisa en build y en dev si `partialPrefetching` no está fijado (PR vercel/next.js #99452).
- Desde Next 16.3, `agentRules` está activo por defecto. Cuando `next dev` detecta un agente de código, puede crear o actualizar un bloque gestionado en el `AGENTS.md` del proyecto. El `AGENTS.md` de este repositorio es la fuente maestra de gobernanza.
- El encargo de la fase limitaba la escritura de plat-ops a manifiestos, lock, CI y documentos (encargo §0.2). Este ADR amplía ese alcance a los dos `next.config.ts`, por decisión del CTO.

## Decisiones propuestas

| # | Decisión | Detalle |
| --- | --- | --- |
| **D1** | `partialPrefetching: false` en `apps/web/next.config.ts` | Sin condición, porque `cacheComponents` está fijo en `true`. |
| **D2** | `partialPrefetching: false` en `apps/portal/next.config.ts`, solo cuando `cacheComponents` esté activo | Next exige `cacheComponents` para usar `partialPrefetching`. Con `IWANA_DISABLE_CACHE_COMPONENTS=1` la clave no se define. |
| **D3** | `agentRules: false` en ambas configuraciones | Ningún `next dev` escribe en `AGENTS.md` ni en otra superficie de gobierno. |
| **D4** | Reevaluar `partialPrefetching: true` en una fase propia, antes de la siguiente major | Requiere validación de prod-ux y smoke de navegación. |

## Consecuencias

- Desaparece el aviso de `partialPrefetching` en build y en dev (criterio de B4 del plan).
- Fijar `partialPrefetching: false` no cambia el comportamiento de prefetch: según el `.d.ts` de Next 16.4.2, omitido o `false` es el comportamiento legacy, y su efecto es silenciar el aviso. La documentación de `cacheComponents` recomienda fijarlo en `false` para apps que adoptaron Cache Components antes de esa opción, que es nuestro caso.
- No confirmado: si `false` desactiva también `cachedNavigations` y `appShells`, que Next 16.3 activa por defecto con Cache Components. Se verifica con el smoke de B4 y con la CI de G6.5.
- `next dev` deja de escribir en `AGENTS.md`.
- El alcance de escritura de plat-ops en esta fase incluye los dos `next.config.ts`. Cualquier otro cambio de configuración de Next requiere un ADR nuevo o una decisión del CTO.

## Alternativas descartadas

- **Dejar la configuración por defecto de Next 16.4.** Obliga a aceptar un aviso nuevo en cada build y dev, y un prefetch que no se fija. Descartada.
- **`partialPrefetching: true` ahora.** Cambia la navegación de producción sin validación de prod-ux. Descartada para esta fase; queda como D4.
- **Mantener `agentRules` por defecto y revertir a mano.** Depende de que cada sesión compruebe `git status`, y no escala. Descartada.

## Riesgos y verificación

- **Defaults de Cache Components** (`cachedNavigations`, `appShells`, `optimisticRouting`, `varyParams` y streams de Node): se verifican con un smoke autenticado en B4 (navegación atrás y adelante, listados con filtros en query, formularios con datos) y con la CI de G6.5. La configuración local del E2E del portal desactiva Cache Components, así que no cubre este modo.
- **Preservación de estado con Activity:** formularios y diálogos conservan su estado al ocultarse una ruta. Lo valida prod-ux antes del cierre de la fase. Si no se acepta, `useRouter().bfcacheId` (Next 16.3) reinicia subárboles en navegaciones push.
- **Forma del standalone:** Next 16.3 cambió la detección de la raíz de Turbopack. Tras `next build` se verifica que existe `.next/standalone/apps/<app>/server.js`. Si cambia, `outputFileTracingRoot` se decide en un cambio aparte.

## Activación

Aprobación pendiente del CTO. Mientras tanto, la fase se ejecuta con la configuración propuesta en D1 a D3. Si el CTO no aprueba este ADR, la configuración de ambas apps vuelve a los valores por defecto de Next 16.4 y el aviso queda registrado como deuda aceptada.

## Referencias

- Next.js 16.4: https://nextjs.org/blog/next-16-4
- Aviso de seguridad del 2026-10-14: https://nextjs.org/blog/nextjs-security-update-october-14-2026
- Configuración: [partialPrefetching](https://nextjs.org/docs/app/api-reference/config/next-config-js/partialPrefetching), [cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents), [agentRules](https://nextjs.org/docs/app/api-reference/config/next-config-js/agentRules)
- Guía de adopción: https://nextjs.org/docs/app/guides/adopting-partial-prefetching
- PR vercel/next.js #99452 (aviso de `partialPrefetching`)
