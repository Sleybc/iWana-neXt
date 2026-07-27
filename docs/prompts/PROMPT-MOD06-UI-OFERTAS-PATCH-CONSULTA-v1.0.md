---
description: "Consulta on-demand AI-SR-BACKEND — límites de PATCH bundles/promociones (Update*Dto); no diseñar endpoints nuevos."
name: "Commercial UI Offers PATCH consult"
argument-hint: "Usar antes de W2.6 FE edit UI; respuesta = matriz campo→editable"
agent: "sr-backend"
---

# Prompt de consulta — Edición ofertas · AI-SR-BACKEND

**Modo:** consulta (on-demand). No implementar UI.  
**Contexto EM-ARCH:** la auditoría UX marcó «crear + desactivar sin editar» como P2. Verificación de código: **`PATCH` ya existe**.

## Hecho verificado (no reabrir)

| Recurso | Controller | DTO |
| --- | --- | --- |
| Bundles | `PATCH commercial/bundles/:id` | `UpdateBundleDto` — name, description, discountType, discountValue, validFrom, validTo, isActive |
| Promotions | `PATCH commercial/promotions/:id` | `UpdatePromotionDto` — name, description, isActive, validTo |

Portal hoy solo expone `create*` / `deactivate*` en `api-client` — hueco FE, no de contrato HTTP.

## Preguntas (responder con evidencia archivo:línea)

1. ¿Qué campos de `UpdateBundleDto` / `UpdatePromotionDto` están efectivamente aplicados en `bundle.service.ts` / `promotion.service.ts` `update()`?  
2. ¿Hay inmutabilidad de negocio (código promo, composición de ítems del bundle, descuento) no reflejada en el DTO?  
3. ¿Algún campo requiere rol distinto o auditoría extra?  
4. ¿Recomendación mínima de campos seguros para side peek de edición en portal?

## Decisión EM-ARCH ya fijada

- **Rechazada:** documentar inmutabilidad total + solo recrear (contradice API).  
- **Aprobada:** FE Wave 2.6 consume PATCH existente.  
- **No pedido:** endpoints nuevos salvo gap real descubierto aquí.

## Entregable

Matriz `campo → editable sí/no → nota` + riesgos. Sin PII. Volver a EM-ARCH / FE-PLATFORM.
