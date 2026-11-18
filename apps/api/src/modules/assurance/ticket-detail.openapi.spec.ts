import { z } from 'zod';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  EXECUTION_ORDER_NUMBER_PATTERN,
  ExecutionOrderLookupResponseSchema,
  LinkExecutionOrderBodySchema,
  LinkExecutionOrderResponseSchema,
  SlaBreachStatus,
  TicketActiveVisitSchema,
  TicketAllowedTransitionSchema,
  TicketDetailExtensionSchema,
  TicketExecutionOrderSchema,
  TicketPartyRefSchema,
  TicketType,
} from '@iwana/shared';
import {
  EXECUTION_ORDER_LOOKUP_OPENAPI,
  EXECUTION_ORDER_NUMBER_QUERY_OPENAPI,
  LINK_EXECUTION_ORDER_BODY_OPENAPI,
  LINK_EXECUTION_ORDER_RESPONSE_OPENAPI,
  TICKET_ACTIVE_VISIT_OPENAPI,
  TICKET_ALLOWED_TRANSITION_OPENAPI,
  TICKET_DETAIL_OPENAPI,
  TICKET_EXECUTION_ORDER_OPENAPI,
  TICKET_PARTY_REF_OPENAPI,
} from './ticket-detail.openapi';

type AnyObject = z.ZodObject<z.ZodRawShape>;

/** Quita refinamientos para leer el `shape` (TicketPartyRefSchema lleva `.refine`). */
function objectOf(schema: z.ZodTypeAny): AnyObject {
  let current = schema;
  while (current instanceof z.ZodEffects || current instanceof z.ZodNullable) {
    current =
      current instanceof z.ZodEffects
        ? (current._def.schema as z.ZodTypeAny)
        : (current.unwrap() as z.ZodTypeAny);
  }
  return current as AnyObject;
}

function base(field: z.ZodTypeAny): z.ZodTypeAny {
  let current = field;
  while (current instanceof z.ZodNullable || current instanceof z.ZodOptional) {
    current = current.unwrap() as z.ZodTypeAny;
  }
  return current;
}

/** Valores admitidos por un campo enumerado de Zod; null si no es enumerado. */
function enumValues(field: z.ZodTypeAny): string[] | null {
  const inner = base(field);
  if (inner instanceof z.ZodEnum) return [...(inner.options as string[])];
  if (inner instanceof z.ZodNativeEnum) {
    return Object.values(inner.enum as Record<string, string>);
  }
  if (inner instanceof z.ZodUnion) {
    const values = (inner.options as z.ZodTypeAny[]).map(enumValues);
    return values.every(Boolean) ? [...new Set(values.flat() as string[])] : null;
  }
  return null;
}

/**
 * Cada campo del `shape` existe en OpenAPI con la misma obligatoriedad, nulabilidad, enum y
 * longitud máxima, y OpenAPI no declara campos que Zod no tenga.
 */
function expectMirrors(zodSchema: z.ZodTypeAny, openapi: SchemaObject): void {
  const shape = objectOf(zodSchema).shape;
  const properties = openapi.properties as Record<string, SchemaObject>;
  expect(Object.keys(properties).sort()).toEqual(Object.keys(shape).sort());
  for (const [name, field] of Object.entries(shape) as Array<[string, z.ZodTypeAny]>) {
    const property = properties[name]!;
    expect({ name, required: openapi.required?.includes(name) ?? false }).toEqual({
      name,
      required: !field.isOptional(),
    });
    expect({ name, nullable: property.nullable === true }).toEqual({
      name,
      nullable: field.isNullable(),
    });
    const values = enumValues(field);
    if (values) {
      expect({ name, enum: [...(property.enum ?? [])].sort() }).toEqual({
        name,
        enum: [...values].sort(),
      });
    }
    const inner = base(field);
    if (inner instanceof z.ZodString && inner.maxLength !== null) {
      expect({ name, maxLength: property.maxLength }).toEqual({
        name,
        maxLength: inner.maxLength,
      });
    }
  }
  if (objectOf(zodSchema)._def.unknownKeys === 'strict') {
    expect(openapi.additionalProperties).toBe(false);
  }
}

describe('ticket-detail.openapi — espejo del contrato compartido (MOD10 paso 2)', () => {
  it.each([
    ['parte (solicitante o relacionado)', TicketPartyRefSchema, TICKET_PARTY_REF_OPENAPI],
    ['visita activa', TicketActiveVisitSchema, TICKET_ACTIVE_VISIT_OPENAPI],
    ['orden de ejecución', TicketExecutionOrderSchema, TICKET_EXECUTION_ORDER_OPENAPI],
    ['destino de estado', TicketAllowedTransitionSchema, TICKET_ALLOWED_TRANSITION_OPENAPI],
    ['búsqueda por número', ExecutionOrderLookupResponseSchema, EXECUTION_ORDER_LOOKUP_OPENAPI],
    ['cuerpo del vínculo', LinkExecutionOrderBodySchema, LINK_EXECUTION_ORDER_BODY_OPENAPI],
    [
      'respuesta del vínculo',
      LinkExecutionOrderResponseSchema,
      LINK_EXECUTION_ORDER_RESPONSE_OPENAPI,
    ],
  ])('%s', (_label, zodSchema, openapi) => {
    expectMirrors(zodSchema, openapi);
  });

  it('el detalle declara cada campo de la extensión, con su nulabilidad (CA-12)', () => {
    const shape = TicketDetailExtensionSchema.shape as Record<string, z.ZodTypeAny>;
    const properties = TICKET_DETAIL_OPENAPI.properties as Record<string, SchemaObject>;
    for (const [name, field] of Object.entries(shape)) {
      expect(TICKET_DETAIL_OPENAPI.required).toContain(name);
      expect({ name, nullable: properties[name]?.nullable === true }).toEqual({
        name,
        nullable: field.isNullable(),
      });
    }
    expect(properties['activeVisit']?.nullable).toBe(true);
    expect(properties['executionOrder']?.nullable).toBe(true);
    expect(properties['executionOrderCount']?.nullable).toBe(true);
  });

  it('type y slaBreachStatus del ticket declaran los enums compartidos', () => {
    const properties = TICKET_DETAIL_OPENAPI.properties as Record<string, SchemaObject>;
    expect(properties['type']?.enum).toEqual(Object.values(TicketType));
    expect(properties['slaBreachStatus']?.enum).toEqual(Object.values(SlaBreachStatus));
  });

  it('el número de la búsqueda declara el patrón del contrato', () => {
    expect(EXECUTION_ORDER_NUMBER_QUERY_OPENAPI.pattern).toBe('^OTE-\\d{8}-\\d{3,6}$');
    expect(EXECUTION_ORDER_NUMBER_QUERY_OPENAPI.pattern).toBe(
      EXECUTION_ORDER_NUMBER_PATTERN.source,
    );
  });

  it('ni la orden ni la búsqueda declaran datos del cliente', () => {
    for (const schema of [TICKET_EXECUTION_ORDER_OPENAPI, EXECUTION_ORDER_LOOKUP_OPENAPI]) {
      expect(JSON.stringify(schema)).not.toMatch(/customerDisplayLabel|subscriberId|address/u);
    }
  });
});
