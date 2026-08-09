# PROMPT — Plataforma · Experiencia de arranque · Fase F3: pantalla de arranque

**Versión:** 1.0
**Fecha:** 2026-08-09
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-FE-PLATFORM (ejecuta) · AI-DS-OWNER (verifica equivalencia visual) · AI-PROD-UX (verifica copy y accesibilidad)
**Etapa del workflow:** 5 (implementación)
**Checklist vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-F3-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F3-v1.0.md)
**Informe de fase:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F3-v1.0.md`

---

## Contratos congelados que consume esta fase

| Id | Contrato | Ruta | Versión |
|---|---|---|---|
| C1 | Forma del estado de arranque | `packages/shared/src/contracts/system/boot-status.contract.ts` | 1.0 |
| C3 | Tokens y geometría del medidor no-React | `docs/specs/2026-08-09-arranque-sistema-ds-contrato.md` | 1.0 |
| C4 | Copy de pasos, componentes y pistas | `docs/specs/2026-08-09-arranque-sistema-ux-spec.md` | 1.0 |

Esta fase **no depende de que F2 esté terminada**: se desarrolla contra un archivo de estado de ejemplo derivado de C1. Ese es el punto de congelar contratos.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** una pantalla que informa del arranque del sistema, renderizable **antes de que exista cualquier build de aplicación**, coherente con el lenguaje visual de iWana y accesible.

**Lo que sí entra:**

- `nginx/boot/` con el documento, la hoja de estilo, el script y la marca.
- Consumo por consulta periódica de `GET /boot/status.json`, con la cadencia que indica la propia respuesta.
- Renderizado del medidor global y de los siete componentes con sus estados.
- Redirección segura al completarse.
- Prueba anti-deriva de tokens, según el criterio que fija C3.

**Lo que no entra:**

- La configuración de nginx y los montajes de volumen — **eso es F4a**. Esta fase entrega archivos; F4a los cablea en desarrollo. El cambio de dependencias de producción es **F4b, hoy diferida**.
- El endpoint (F2) y el archivo de estado de desarrollo (F1).
- Cualquier ruta dentro de `apps/web` o `apps/portal`.
- Asistentes de configuración, formularios o cualquier entrada de datos. **La pantalla no recoge información: solo informa.**

---

## 2. Artefactos de entrada obligatorios

- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §4.2, §4.5, §2.2 CU-02 y CU-04
- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) — Decisión 2 y Decisión 5.7
- **Fuentes de diseño:** `packages/ui/src/styles/globals.css` (tokens reales) · `packages/ui/src/components/ProgressMeter.tsx` (referencia) · `docs/identity/` y `docs/prototipo/`
- **Skills aplicables:** `iwana-identity-ui-review` (rectora), `core-components`, `wcag-audit-patterns`, `system-vocabulary-review`

---

## 3. Instrucciones

1. **Sin dependencias, sin framework, sin build.** Documento, hoja de estilo y script planos en `nginx/boot/`. **No se importa `@iwana/ui`**, no porque sea indeseable sino porque la pantalla debe renderizar cuando ningún build existe todavía. Esa duplicación está aceptada por ADR-079 y contenida por C3.

2. **Consumo del estado.** Consultar `GET /boot/status.json` con la cadencia que indica la propia respuesta. Tolerar respuesta ausente, malformada o error de red **manteniendo el último estado bueno** y mostrando que se sigue esperando — nunca una pantalla en blanco ni un error crudo.

3. **Medidor global.** Replicar la geometría y el degradado que fija C3, con equivalencia declarada frente al componente de referencia del design system. El porcentaje viene dado; **la pantalla no lo recalcula**.

4. **Lista de componentes.** Los siete, en el orden estable del contrato, con el copy de C4 y el indicador de estado. Cuando la respuesta no traiga componentes —régimen estable— la lista no se muestra.

5. **Redirección segura.** Al alcanzar el estado listo, redirigir al destino que indica la respuesta **solo si** es una ruta del mismo origen o coincide con la allowlist corta que fija C3/C4. Es una página pre-autenticación: un destino manipulable sería un open redirect. Sustituir la entrada en el historial, no apilarla.

6. **Tokens exclusivamente de la lista cerrada de C3.** Ningún valor de color, radio o tipografía inventado. Implementar la prueba anti-deriva que C3 define: extraer cada variable CSS usada y asertar que existe en `globals.css`. Añadirla a la suite de tooling.

7. **Tema claro y oscuro** según C3.

8. **Accesibilidad.** Nombre accesible del medidor, región activa que anuncie el cambio de paso sin saturar al lector de pantalla, contraste conforme y funcionamiento completo sin ratón. Verificar con auditoría automatizada.

9. **Sin telemetría, sin fuentes externas, sin recursos remotos.** La pantalla debe funcionar en un servidor sin salida a internet. Todo recurso es local.

10. **Archivo de estado de ejemplo para desarrollo.** Crear ejemplos que cubran las cinco fases y los estados de componente, para poder desarrollar y probar sin F1 ni F2. Guardarlos donde F6 pueda reutilizarlos.

---

## 4. Restricciones no negociables

1. **La pantalla no recoge datos.** Sin formularios, sin campos, sin envío. Un asistente de configuración es territorio de MOD00 y está fuera de alcance.
2. **Ningún recurso externo.** Sin fuentes remotas, sin CDN, sin analítica.
3. **No se sigue el destino de redirección sin validarlo.**
4. **No se inventan tokens.** Si falta uno, se escala: es cambio de lenguaje visual y lo decide el CTO con propuesta de AI-DS-OWNER.
5. **No se toca `nginx/*.conf`, `docker-compose*.yml` ni `apps/`.** Esta fase produce archivos estáticos; el cableado es F4a.
6. **Copy en español, sin enums crudos**, exactamente el de C4.
7. **Marcar el checklist en el mismo commit que entrega cada ítem**, con evidencia citable.

---

## 5. Entregables técnicos obligatorios

- `nginx/boot/` — documento, hoja de estilo, script y marca
- Archivos de estado de ejemplo para las cinco fases
- Prueba anti-deriva de tokens integrada en `test:tooling`
- `pnpm lint` y `pnpm test:tooling` en verde

## 6. Entregables documentales obligatorios

- `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F3-v1.0.md` desde la [plantilla](../informes/PLANTILLA-INFORME-PLATAFORMA-ARRANQUE-FASE-v1.0.md)
- Firma de AI-DS-OWNER sobre la equivalencia visual, registrada en el informe
- Firma de AI-PROD-UX sobre copy y accesibilidad, registrada en el informe
- [CHECKLIST-PLATAFORMA-ARRANQUE-F3-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F3-v1.0.md) marcado en vivo
- Fila F3 del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) al cierre

---

## 7. Criterios de aceptación

- **CA-F3-01** — La pantalla renderiza y avanza contra los archivos de ejemplo de las cinco fases.
- **CA-F3-02** — Con estado ausente, malformado o inaccesible, mantiene el último estado bueno y sigue esperando. Sin pantalla en blanco ni error crudo.
- **CA-F3-03** — Con la fase en listo, no muestra lista de componentes y redirige.
- **CA-F3-04** — Un destino de redirección de otro origen y fuera de allowlist **no se sigue**. Con prueba.
- **CA-F3-05** — Cada variable CSS usada existe en `globals.css`; la prueba anti-deriva falla si se elimina una. Verificado con control negativo.
- **CA-F3-06** — El medidor es visualmente equivalente al componente de referencia, con firma de AI-DS-OWNER.
- **CA-F3-07** — Funciona en tema claro y oscuro.
- **CA-F3-08** — Auditoría de accesibilidad sin violaciones en las cinco fases.
- **CA-F3-09** — Navegable y comprensible sin ratón.
- **CA-F3-10** — Sin una sola petición a un host externo. Verificable en el panel de red.
- **CA-F3-11** — Todo el texto visible viene de C4; ningún enum crudo.
- **CA-F3-12** — La pantalla renderiza correctamente en anchos de móvil y escritorio.
- **CA-F3-13** — Evidencia de suites con **`Cached: 0`**.

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- C3 exige un token que no existe en `globals.css` → cambio de lenguaje visual, **escala al CTO**.
- Cumplir la equivalencia visual exige importar código del paquete de UI → contradice ADR-079 Decisión 2; se resuelve replicando, no importando.
- El copy de C4 no cubre algún estado que la respuesta puede producir → falta de contrato, se escala a AI-PROD-UX.

**Documentar causa en:** el informe de fase y la sección de pendientes del checklist.
**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`.

## 9. Criterio de salida de la fase

- [ ] Pantalla completa en `nginx/boot/`, funcionando contra archivos de ejemplo
- [ ] Prueba anti-deriva en la suite de tooling y verificada con control negativo
- [ ] Auditoría de accesibilidad sin violaciones
- [ ] Firmas de AI-DS-OWNER y AI-PROD-UX registradas
- [ ] Ningún archivo de configuración de proxy ni de composición modificado
- [ ] Informe de fase archivado con `Cached: 0` y checklist completo
