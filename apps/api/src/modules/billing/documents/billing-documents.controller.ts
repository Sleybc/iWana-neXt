import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  BILLING_DOCUMENT_STATUSES,
  BILLING_PERIOD_PAYMENT_STATES,
  UserRole,
  GenerateDocumentsCommandSchema,
  GenerateFirstChargeCommandSchema,
  BillingGenerationSummarySchema,
  BILLING_FIRST_CHARGE_ANCHOR_SOURCES,
  BILLING_FIRST_CHARGE_INSTALLATION_OUTCOMES,
  BILLING_FIRST_CHARGE_FISCAL_FIELDS,
  BILLING_FIRST_CHARGE_FISCAL_OUTCOMES,
  IssueDocumentsCommandSchema,
  VoidDocumentCommandSchema,
} from '@iwana/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { BillingGenerationService } from '../generation/billing-generation.service';
import { BillingFirstChargeService } from '../generation/billing-first-charge.service';
import { BillingDocumentsService } from './billing-documents.service';
import { renderBillingDocumentPdf } from './billing-documents.pdf';
import { BillingImportedPdfService } from './billing-imported-pdf.service';

const generationSummaryFields = BillingGenerationSummarySchema.keyof().options;

const GENERATION_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: generationSummaryFields,
  properties: Object.fromEntries(
    generationSummaryFields.map((field) => [field, { type: 'integer', minimum: 0 }]),
  ),
};

const FIRST_CHARGE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: [
        'contractId',
        'anchorDate',
        'anchorSource',
        'installationFee',
        'fiscalData',
        'summary',
        'regularizedDrafts',
      ],
      properties: {
        contractId: { type: 'string', format: 'uuid' },
        anchorDate: {
          type: 'string',
          format: 'date',
          nullable: true,
          description: 'Fecha civil de activación usada como ancla; null si ya había periodos.',
        },
        anchorSource: {
          type: 'string',
          enum: [...BILLING_FIRST_CHARGE_ANCHOR_SOURCES],
          nullable: true,
        },
        installationFee: {
          type: 'object',
          additionalProperties: false,
          required: ['outcome', 'amount'],
          properties: {
            outcome: { type: 'string', enum: [...BILLING_FIRST_CHARGE_INSTALLATION_OUTCOMES] },
            amount: { type: 'string', pattern: '^\\d+\\.\\d{2}$', nullable: true },
          },
        },
        fiscalData: {
          type: 'object',
          additionalProperties: false,
          required: ['outcome', 'frozenFields', 'missingFields'],
          description: 'Datos fiscales congelados desde el suscriptor (solo nombres de campo).',
          properties: {
            outcome: { type: 'string', enum: [...BILLING_FIRST_CHARGE_FISCAL_OUTCOMES] },
            frozenFields: {
              type: 'array',
              items: { type: 'string', enum: [...BILLING_FIRST_CHARGE_FISCAL_FIELDS] },
            },
            missingFields: {
              type: 'array',
              items: { type: 'string', enum: [...BILLING_FIRST_CHARGE_FISCAL_FIELDS] },
            },
          },
        },
        summary: GENERATION_SUMMARY_SCHEMA,
        regularizedDrafts: {
          type: 'object',
          additionalProperties: false,
          required: ['unblocked', 'rescheduled'],
          description:
            'Borradores existentes desbloqueados (SIN_DATOS_FISCALES) y con vencimiento corregido.',
          properties: {
            unblocked: { type: 'integer', minimum: 0 },
            rescheduled: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
  },
};

const DocumentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: z.enum(BILLING_DOCUMENT_STATUSES).optional(),
    paymentState: z.enum(BILLING_PERIOD_PAYMENT_STATES).optional(),
    cycleDay: z.coerce.number().int().min(1).max(28).optional(),
    subscriberId: z.string().uuid().optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .optional(),
  })
  .strict();

type AuthenticatedRequest = { user?: JwtPayload };
function actorId(request: AuthenticatedRequest): string {
  const id = request.user?.sub;
  if (!id)
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'La sesión no es válida.' });
  return id;
}

@ApiTags('billing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('billing/documents')
export class BillingDocumentsController {
  constructor(
    private readonly documents: BillingDocumentsService,
    private readonly generation: BillingGenerationService,
    private readonly firstCharge: BillingFirstChargeService,
    @Optional() private readonly importedPdf?: BillingImportedPdfService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_MANAGE)
  @ApiOperation({ summary: 'Generar documentos de cobro' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        contractId: { type: 'string', format: 'uuid' },
        date: { type: 'string', format: 'date' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Resumen de generación sin datos personales.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['data'],
      properties: { data: GENERATION_SUMMARY_SCHEMA },
    },
  })
  @ApiBadRequestResponse({ description: 'La solicitud no es válida.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async generate(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = new ZodValidationPipe(GenerateDocumentsCommandSchema).transform(body);
    return {
      data: await this.generation.generate({
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.contractId !== undefined ? { contractId: input.contractId } : {}),
        actorId: actorId(request),
      }),
    };
  }

  @Post('generate-first-charge')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_MANAGE)
  @ApiOperation({
    summary: 'Generar el primer cobro de un contrato activo sin periodos',
    description:
      'Ancla el primer cobro en la fecha civil de activación, congela el cargo de instalación ' +
      'vigente si el contrato no lo tiene y genera los periodos vencidos hasta el actual. ' +
      'Idempotente: con periodos existentes responde `existing` sin error.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['contractId'],
      properties: { contractId: { type: 'string', format: 'uuid' } },
    },
  })
  @ApiOkResponse({
    description: 'Resultado del primer cobro sin datos personales.',
    schema: FIRST_CHARGE_RESULT_SCHEMA,
  })
  @ApiBadRequestResponse({ description: 'La solicitud no es válida.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  @ApiNotFoundResponse({ description: 'No se encontró el contrato.' })
  @ApiResponse({ status: 409, description: 'El contrato no está activo.' })
  @ApiResponse({ status: 422, description: 'No se pudo determinar la fecha de activación.' })
  async generateFirstCharge(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = new ZodValidationPipe(GenerateFirstChargeCommandSchema).transform(body);
    return {
      data: await this.firstCharge.generateFirstCharge({
        contractId: input.contractId,
        actorId: actorId(request),
      }),
    };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({ summary: 'Consultar documentos de cobro' })
  @ApiOkResponse({ description: 'Lista paginada de documentos.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async list(
    @Query(new ZodValidationPipe(DocumentListQuerySchema))
    input: z.infer<typeof DocumentListQuerySchema>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.documents.list(
      {
        page: input.page,
        limit: input.limit,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.paymentState !== undefined ? { paymentState: input.paymentState } : {}),
        ...(input.cycleDay !== undefined ? { cycleDay: input.cycleDay } : {}),
        ...(input.subscriberId !== undefined ? { subscriberId: input.subscriberId } : {}),
        ...(input.from !== undefined ? { from: input.from } : {}),
        ...(input.to !== undefined ? { to: input.to } : {}),
      },
      actorId(request),
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({ summary: 'Consultar el detalle de un documento de cobro' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Detalle del documento.' })
  @ApiNotFoundResponse({ description: 'No se encontró el documento.' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.documents.findOne(id, actorId(request)) };
  }

  @Post('issue')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_MANAGE)
  @ApiOperation({ summary: 'Emitir borradores de documentos de cobro' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documentIds'],
      properties: {
        documentIds: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'string', format: 'uuid' },
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Documentos emitidos.' })
  @ApiResponse({
    status: 422,
    description: 'El documento tiene datos pendientes o falta la identidad fiscal del emisor.',
  })
  async issue(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = new ZodValidationPipe(IssueDocumentsCommandSchema).transform(body);
    return { data: await this.documents.issue(input.documentIds, actorId(request)) };
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_MANAGE)
  @ApiOperation({ summary: 'Anular un documento emitido' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reasonCode'],
      properties: { reasonCode: { type: 'string' }, note: { type: 'string', maxLength: 500 } },
    },
  })
  async void(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = new ZodValidationPipe(VoidDocumentCommandSchema).transform(body);
    await this.documents.void(id, input.reasonCode, input.note, actorId(request));
    return { data: await this.documents.findOne(id, actorId(request)) };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_MANAGE)
  @ApiOperation({ summary: 'Eliminar un borrador' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Borrador eliminado.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async discard(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.documents.discard(id, actorId(request));
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.BILLING_INVOICES_READ)
  @ApiOperation({
    summary: 'Descargar el PDF de un documento emitido o el histórico de un importado',
    description:
      'EMITIDO: se renderiza. IMPORTADO (ADR-110 D5): se entrega el PDF de UISP cifrado en reposo, sin caché y auditado (RECORD_ACCESS).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Documento de cobro PDF.' })
  @ApiResponse({ status: 404, description: 'BILLING_IMPORTED_PDF_NOT_AVAILABLE' })
  @ApiResponse({
    status: 409,
    description: 'BILLING_DOCUMENT_NOT_ISSUED o BILLING_IMPORTED_PDF_RESTRICTED (DATOS_BLOQUEADOS)',
  })
  async pdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const document = await this.documents.pdfDocument(id, actorId(request));
    if (document.status === 'IMPORTADO' && this.importedPdf) {
      // ADR-110 D5: el PDF histórico de UISP, sin renderizar como documento de iWana.
      const imported = await this.importedPdf.read(document.id, {
        actorId: actorId(request),
        buyerProtected: document.buyerProtected === true,
      });
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Disposition', 'attachment; filename="historico-importado.pdf"');
      response.send(imported);
      return;
    }
    if (document.status !== 'EMITIDO') {
      throw new ConflictException({
        code: 'BILLING_DOCUMENT_NOT_ISSUED',
        message: 'El PDF está disponible después de emitir.',
      });
    }
    const buffer = await renderBillingDocumentPdf(document);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.number ?? document.id}.pdf"`,
    );
    response.send(buffer);
  }
}
