# PROMPT — Corrección crítica: XSS almacenado en la búsqueda global de la consola de plataforma

**Versión:** 1.0
**Fecha:** 2026-08-09
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-FE-PLATFORM
**Revisor obligatorio:** AI-SEC-ENG (cierre del hallazgo) · AI-SR-QA (prueba de concepto)
**Autorización:** CTO, 2026-08-09 — **ejecución inmediata, fuera del alcance de OLA1-b**
**Hallazgo:** [SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) — **severidad CRÍTICA**

---

## 1. Objetivo exacto

**Resultado esperado:** que un administrador de tenant no pueda ejecutar script en el origen de la consola de plataforma a través de la búsqueda global.

**Lo que sí entra:**

- Eliminar el sink de HTML crudo en `apps/web/src/components/search/GlobalSearchResultItem.tsx:81-84`.
- Prueba que cubra el vector.

**Lo que no entra:**

- **La migración del modelo de sesión.** Es [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md), fase aparte. Esta corrección **no la anticipa ni la bloquea**.
- La política de seguridad de contenido (C-8). Es capa complementaria, con su propio dueño.
- Cambiar el servicio de búsqueda del API, el esquema de indexación o la validación de los DTO.
- El sink equivalente del portal, que hoy **sí escapa** (C-10, no bloqueante).

---

## 2. Estado verificado — no re-derivar

`apps/web/src/components/search/GlobalSearchResultItem.tsx` renderiza los fragmentos así:

```tsx
<span
  key={`${item.id}-${highlight}`}
  className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300"
  dangerouslySetInnerHTML={{ __html: highlight }}
/>
```

- Los fragmentos llegan **crudos** desde el motor de búsqueda: `apps/api/src/modules/search/search.service.ts:185-222` los reenvía tal cual.
- Los campos indexados son **texto libre editable por el tenant**: `name`, `legalName`, `firstName`, `lastName`, `jobTitle`.
- La validación del DTO aplica solo longitud máxima, sin clase de caracteres (`apps/api/src/modules/users/dto/user.dto.ts:74,98`).
- **No existe política de seguridad de contenido** en ninguna de las dos aplicaciones de navegador: no hay segunda capa.
- **El portal ya resuelve esto bien**: `apps/portal/src/lib/api-client.ts:4032-4062` construye el resaltado en cliente con escapado previo. **Es el precedente a seguir.**

---

## 3. Instrucciones

1. **Preferir la eliminación del sink sobre el escapado.** Escapar deja un `dangerouslySetInnerHTML` vivo que el próximo cambio puede volver a romper. Construir el resaltado en cliente —localizar la coincidencia y envolverla en un elemento— elimina la clase de defecto, no solo esta instancia.
2. **Tomar el patrón del portal como referencia**, no como copia literal: si la lógica es equivalente, evalúa extraerla a un lugar compartido en vez de duplicarla. Si la duplicación es más simple y menos acoplada, justifícalo en el informe.
3. **El comportamiento visible no cambia:** el usuario sigue viendo el término coincidente resaltado, con el mismo tratamiento visual.
4. **No confiar en que el backend sanee.** La defensa va en el punto de render. Que el servicio de búsqueda pudiera escapar en origen no sustituye esto, y proponerlo como alternativa es ampliar el alcance.

---

## 4. Restricciones no negociables

1. **Cero `dangerouslySetInnerHTML` en `apps/web/src/components/search/`** al terminar.
2. **No tocar `apps/api`.** La corrección es de frontend.
3. **No tocar el modelo de sesión.** Es ADR-081 y otra fase.
4. **No cambiar tokens ni lenguaje visual.** El resultado debe ser visualmente indistinguible del actual.
5. **Marcar el checklist en el mismo commit que entrega el ítem**, con evidencia citable.

---

## 5. Entregables

**Técnicos:**

- `apps/web/src/components/search/GlobalSearchResultItem.tsx` sin sink de HTML crudo.
- **Prueba con control negativo**: un fragmento con carga de script se renderiza como **texto literal**, y la prueba falla si se reintroduce el sink.
- `pnpm --filter @iwana/web test`, `lint` y `typecheck` en verde.

**Documentales:**

- Informe breve en `docs/informes/`, declarando la decisión entre extraer o duplicar el resaltado.
- Actualizar [el hallazgo](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md): C-7 a cerrado, con evidencia.

---

## 6. Criterios de aceptación

- **CA-XSS-01** — Ningún `dangerouslySetInnerHTML` permanece en el directorio de búsqueda de la consola.
- **CA-XSS-02** — Un fragmento con carga de script se muestra como texto literal, sin ejecutar.
- **CA-XSS-03** — La prueba **falla** si se reintroduce el sink. Verificado con control negativo.
- **CA-XSS-04** — El resaltado sigue funcionando y es visualmente indistinguible del actual.
- **CA-XSS-05** — `apps/api` sin cambios. Verificable en el diff.
- **CA-XSS-06** — Evidencia de suites con **`Cached: 0`**.

---

## 7. Criterio de stop/go

**Detenerse si:**

- Eliminar el sink obliga a cambiar el contrato del servicio de búsqueda → es ampliación de alcance; consultar antes de proceder.
- El resaltado no puede reproducirse en cliente sin pérdida funcional → documentar y proponer el escapado como alternativa, **justificándolo**.

**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`.

## 8. Criterio de salida

- [ ] Sink eliminado
- [ ] Prueba con control negativo en verde
- [ ] Resaltado visualmente equivalente
- [ ] `apps/api` intacto
- [ ] Hallazgo actualizado con C-7 cerrado
- [ ] Prueba de concepto de AI-SR-QA y cierre formal de AI-SEC-ENG
