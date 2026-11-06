import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  BillingGenerationSummarySchema,
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
import { BillingDocumentsService } from './billing-documents.service';
import { renderBillingDocumentPdf } from './billing-documents.pdf';

const generationSummaryFields = BillingGenerationSummarySchema.keyof().options;

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
      properties: {
        data: {
          type: 'object',
          additionalProperties: false,
          required: generationSummaryFields,
          properties: Object.fromEntries(
            generationSummaryFields.map((field) => [field, { type: 'integer', minimum: 0 }]),
          ),
        },
      },
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
  @ApiOperation({ summary: 'Descargar el PDF de un documento emitido' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Documento de cobro PDF.' })
  async pdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const document = await this.documents.pdfDocument(id, actorId(request));
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
