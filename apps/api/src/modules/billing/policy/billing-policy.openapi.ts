import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const billingPolicyDataSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'tenantId',
    'periodTiming',
    'generationLeadDays',
    'cutoffMode',
    'paymentTermDays',
    'graceDays',
    'cutoffEnabled',
    'minimumUnpaidForCutoff',
    'prorationMethod',
    'firstPeriodMode',
    'automaticGeneration',
    'approvalMode',
    'autoApplyCredit',
    'generationHour',
    'documentPrefix',
  ],
  properties: {
    tenantId: { type: 'string', format: 'uuid' },
    periodTiming: { type: 'string', enum: ['ANTICIPADO', 'VENCIDO'] },
    generationLeadDays: { type: 'integer', minimum: 0, maximum: 15 },
    cutoffMode: { type: 'string', enum: ['DIA_FIJO_CICLO', 'VENCIMIENTO_MAS_GRACIA'] },
    paymentTermDays: { type: 'integer', minimum: 0, maximum: 60 },
    graceDays: { type: 'integer', minimum: 0, maximum: 30 },
    cutoffEnabled: { type: 'boolean' },
    minimumUnpaidForCutoff: {
      oneOf: [
        { type: 'number', minimum: 0 },
        { type: 'string', pattern: '^\\d{1,12}(\\.\\d{1,2})?$' },
      ],
    },
    prorationMethod: { type: 'string', enum: ['DIAS_REALES', 'MES_30'] },
    firstPeriodMode: { type: 'string', enum: ['SEPARADO', 'JUNTO_AL_SIGUIENTE'] },
    automaticGeneration: { type: 'boolean' },
    approvalMode: { type: 'string', enum: ['BORRADOR', 'AUTOMATICA'] },
    autoApplyCredit: { type: 'boolean' },
    generationHour: { type: 'integer', minimum: 0, maximum: 23 },
    documentPrefix: { type: 'string', minLength: 1, maxLength: 10 },
    updatedBy: { type: 'string', format: 'uuid', nullable: true },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const contractPolicyDataSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contractId',
    'periodTiming',
    'generationLeadDays',
    'paymentTermDays',
    'graceDays',
    'cutoffEnabled',
    'firstPeriodMode',
    'billingStartDate',
  ],
  properties: {
    contractId: { type: 'string', format: 'uuid' },
    periodTiming: { type: 'string', enum: ['ANTICIPADO', 'VENCIDO'], nullable: true },
    generationLeadDays: { type: 'integer', minimum: 0, maximum: 15, nullable: true },
    paymentTermDays: { type: 'integer', minimum: 0, maximum: 60, nullable: true },
    graceDays: { type: 'integer', minimum: 0, maximum: 30, nullable: true },
    cutoffEnabled: { type: 'boolean', nullable: true },
    firstPeriodMode: {
      type: 'string',
      enum: ['SEPARADO', 'JUNTO_AL_SIGUIENTE'],
      nullable: true,
    },
    billingStartDate: { type: 'string', format: 'date', nullable: true },
    updatedBy: { type: 'string', format: 'uuid', nullable: true },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

export const BILLING_POLICY_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: billingPolicyDataSchema },
};

export const BILLING_CONTRACT_POLICY_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: contractPolicyDataSchema },
};

export const BILLING_POLICY_PREVIEW_RESPONSE_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['cycles'],
      properties: {
        cycles: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['cycleDay', 'cutoffDay', 'items'],
            properties: {
              cycleDay: { type: 'integer', minimum: 1, maximum: 28 },
              cutoffDay: { type: 'integer', minimum: 1, maximum: 31 },
              items: {
                type: 'array',
                minItems: 3,
                maxItems: 3,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['periodStart', 'periodEnd', 'generationDate', 'dueDate', 'cutoffDate'],
                  properties: {
                    periodStart: { type: 'string', format: 'date' },
                    periodEnd: { type: 'string', format: 'date' },
                    generationDate: { type: 'string', format: 'date' },
                    dueDate: { type: 'string', format: 'date' },
                    cutoffDate: { type: 'string', format: 'date', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
