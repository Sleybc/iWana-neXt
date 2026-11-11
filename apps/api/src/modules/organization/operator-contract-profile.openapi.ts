import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  OPERATOR_CONTRACT_REQUIRED_FIELDS,
  OPERATOR_CUSTOMER_SERVICE_CHANNEL_KINDS,
} from '@iwana/shared';

const channel: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'value', 'label'],
  properties: {
    kind: { type: 'string', enum: [...OPERATOR_CUSTOMER_SERVICE_CHANNEL_KINDS] },
    value: { type: 'string', minLength: 3, maxLength: 255 },
    label: { type: 'string', maxLength: 80, nullable: true },
  },
};

const editable: Record<string, SchemaObject> = {
  qualityAndCoverageUrl: { type: 'string', format: 'uri', maxLength: 500, nullable: true },
  customerServiceChannels: { type: 'array', maxItems: 10, items: channel },
  reconnectionFee: { type: 'number', minimum: 0, multipleOf: 0.01, nullable: true },
  annualIncreaseCapPercent: {
    type: 'number',
    minimum: 0,
    maximum: 100,
    multipleOf: 0.01,
    nullable: true,
  },
  equipmentIncidentReportChannel: { type: 'string', minLength: 3, maxLength: 500, nullable: true },
  otherConditions: { type: 'string', maxLength: 10_000, nullable: true },
};

export const updateOperatorContractProfileRequestSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(editable),
  properties: editable,
};

const profile: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['legalName', 'nit', ...Object.keys(editable), 'updatedAt'],
  properties: {
    legalName: {
      type: 'string',
      maxLength: 200,
      nullable: true,
      description: 'Razón social de la empresa (solo lectura).',
    },
    nit: { type: 'string', maxLength: 20, nullable: true, description: 'NIT (solo lectura).' },
    ...editable,
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

export const operatorContractProfileResponseSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data', 'meta'],
  properties: {
    data: profile,
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['missingFields'],
      properties: {
        missingFields: {
          type: 'array',
          items: { type: 'string', enum: [...OPERATOR_CONTRACT_REQUIRED_FIELDS] },
        },
      },
    },
  },
};
