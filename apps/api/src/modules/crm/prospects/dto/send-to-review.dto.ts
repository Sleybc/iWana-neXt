import { ApiProperty } from '@nestjs/swagger';
import { ReviewCause } from '../../enums/review-cause.enum';

export class SendToReviewDto {
  @ApiProperty({ enum: ReviewCause })
  cause: ReviewCause;
}
