# CHECKLIST — Plataforma · Experiencia de arranque · F3 pantalla de arranque

**Fecha de apertura:** 2026-08-08
**Estado:** Abierto — bloqueado por F0 (contratos C1, C3, C4)
**Prompt:** [PROMPT-PLATAFORMA-ARRANQUE-F3-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F3-v1.0.md)
**Informe:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F3-v1.0.md`
**Responsables:** AI-FE-PLATFORM (ejecuta) · AI-DS-OWNER (firma equivalencia) · AI-PROD-UX (firma copy y accesibilidad)
**Tablero:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

---

## Protocolo de actualización en vivo

1. **Marca `[x]` en el mismo commit que entrega el ítem.**
2. **Todo `[x]` lleva evidencia citable.** Un `[x]` sin evidencia es **defecto bloqueante**.
3. **Un ítem que no cierra se deja `[ ]`** y abre `[BLOQUEO]` hacia AI-EM-ARCH. No caduca: escala.
4. **No marques ítems de otra fase ni de otro agente.** En esta fase intervienen tres: cada uno marca lo suyo.
5. **Al cerrar, actualiza tu fila del tablero.**
6. **Toda evidencia de suite adjunta `Cached: 0`.**

---

## 1. Artefactos y autonomía · AI-FE-PLATFORM

- [ ] `nginx/boot/` con documento, hoja de estilo, script y marca
- [ ] **Sin dependencias, sin framework, sin paso de build**
- [ ] **No importa `@iwana/ui`** — debe renderizar cuando ningún build existe
- [ ] Archivos de estado de ejemplo para las cinco fases y los cuatro estados de componente
- [ ] Guardados donde F6 pueda reutilizarlos
- [ ] **No se tocó `nginx/*.conf`, `docker-compose*.yml` ni `apps/`** — el cableado es F4

## 2. Consumo de estado

- [ ] Consulta periódica de la ruta de estado, con la cadencia que indica la respuesta
- [ ] Con respuesta ausente, malformada o error de red: **mantiene el último estado bueno** y sigue esperando *(CA-F3-02)*
- [ ] Sin pantalla en blanco ni error crudo en ningún camino *(CA-F3-02)*
- [ ] Renderiza y avanza contra los cinco archivos de ejemplo *(CA-F3-01)*
- [ ] **La pantalla no recalcula el porcentaje** — viene dado

## 3. Render

- [ ] Medidor global con la geometría y el degradado de C3
- [ ] Los siete componentes en el orden estable del contrato, con el copy de C4
- [ ] Con la fase en listo: **no muestra lista de componentes** y redirige *(CA-F3-03)*
- [ ] Tema claro y oscuro según C3 *(CA-F3-07)*
- [ ] Render correcto en anchos de móvil y escritorio *(CA-F3-12)*

## 4. Seguridad de la superficie

- [ ] Redirección **solo** a ruta del mismo origen o allowlist corta *(CA-F3-04)*
- [ ] **Control negativo**: un destino de otro origen fuera de allowlist no se sigue *(CA-F3-04)*
- [ ] Sustituye la entrada en el historial, no la apila
- [ ] **Sin telemetría, sin fuentes externas, sin recursos remotos** *(CA-F3-10)*
- [ ] Verificado en el panel de red: cero peticiones a host externo *(CA-F3-10)*
- [ ] **La pantalla no recoge datos**: sin formularios, sin campos, sin envío

## 5. Contrato de design system · verifica AI-DS-OWNER

- [ ] Cada variable CSS usada pertenece a la lista cerrada de C3
- [ ] Cada variable existe en `packages/ui/src/styles/globals.css` *(CA-F3-05)*
- [ ] **Ningún valor de color, radio o tipografía inventado**
- [ ] Prueba anti-deriva implementada e integrada en `test:tooling`
- [ ] **Control negativo**: eliminar un token del design system hace fallar la prueba *(CA-F3-05)*
- [ ] **Equivalencia visual con `ProgressMeter.tsx` firmada por AI-DS-OWNER** *(CA-F3-06)*

## 6. Copy y accesibilidad · verifica AI-PROD-UX

- [ ] Todo el texto visible viene de C4 *(CA-F3-11)*
- [ ] **Ningún enum crudo** *(CA-F3-11)*
- [ ] Nombre accesible del medidor
- [ ] Región activa que anuncia el cambio de paso sin saturar al lector de pantalla
- [ ] Contraste conforme en tema claro y oscuro
- [ ] Navegable y comprensible sin ratón *(CA-F3-09)*
- [ ] Auditoría de accesibilidad automatizada **sin violaciones en las cinco fases** *(CA-F3-08)*
- [ ] **Firma de AI-PROD-UX sobre copy y accesibilidad** registrada en el informe

---

## Evidencia automatizada

| Suite / comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- |
| `pnpm test:tooling` (prueba anti-deriva) | pendiente | — | — |
| `pnpm lint` | pendiente | — | — |
| Auditoría de accesibilidad — 5 fases | pendiente | n/a | — |
| Control negativo de redirección | pendiente | n/a | — |
| Control negativo de token eliminado | pendiente | n/a | — |

---

## Pendientes, bloqueos y consultas

- Ninguno al momento de la apertura.

**Recordatorio de escalación:** si C3 exige un token que no existe en `globals.css`, es **cambio de lenguaje visual** y lo decide el CTO con propuesta de AI-DS-OWNER. No se inventa el token ni se resuelve en la fase.

## Salida de fase

- [ ] Todos los criterios CA-F3-01 a CA-F3-13 cubiertos con evidencia
- [ ] Firmas de AI-DS-OWNER y AI-PROD-UX registradas
- [ ] Informe de fase archivado con `Cached: 0`
- [ ] Fila F3 del tablero actualizada
