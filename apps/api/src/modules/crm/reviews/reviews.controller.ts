import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole, UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';
import { closeSuccessSchema } from '../schemas/close-success.schema';
import { sendToReviewSchema } from '../schemas/send-to-review.schema';
import { ActivationService } from './activation.service';
import { ReviewCoordinationService } from './review-coordination.service';
import { CustomerOverviewService } from './customer-overview.service';
import { CloseSuccessDto } from '../prospects/dto/close-success.dto';
import { SendToReviewDto } from '../prospects/dto/send-to-review.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { ProspectResponseDto } from '../prospects/dto/prospect-response.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { CustomerOverviewDto } from './dto/customer-overview.dto';

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm')
export class ReviewsController {
  constructor(
    private readonly activationService: ActivationService,
    private readonly reviewCoordinationService: ReviewCoordinationService,
    private readonly customerOverviewService: CustomerOverviewService,
  ) {}

  @Post('prospects/:id/close-success')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Cerrar instalacion exitosa y activar cliente' })
  @UsePipes(new ZodBodyValidationPipe(closeSuccessSchema))
  async closeSuccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseSuccessDto,
  ): Promise<{ data: ProspectResponseDto }> {
    const data = await this.activationService.closeSuccess(id, dto);
    return { data };
  }

  @Post('prospects/:id/send-to-review')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Enviar prospecto a revision por expansion o refuerzo' })
  @UsePipes(new ZodBodyValidationPipe(sendToReviewSchema))
  async sendToReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendToReviewDto,
  ): Promise<{ data: ReviewResponseDto }> {
    const data = await this.reviewCoordinationService.sendToReview(id, dto);
    return { data };
  }

  @Patch('reviews/:id/decision')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Registrar decision de revision' })
  async applyDecision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDecisionDto,
  ): Promise<{ data: ReviewResponseDto }> {
    const data = await this.reviewCoordinationService.applyReviewDecision(id, dto);
    return { data };
  }

  @Get('customers/:id/overview')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Obtener vista 360 compuesta del cliente/prospecto' })
  async getCustomerOverview(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: CustomerOverviewDto }> {
    const data = await this.customerOverviewService.getCustomerOverview(id);
    return { data };
  }
}
