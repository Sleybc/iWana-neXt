import { ApiProperty } from '@nestjs/swagger';

export class CloseSuccessDto {
  @ApiProperty()
  checklistCompleted: boolean;

  @ApiProperty()
  conformityEvidenceRef: string;

  @ApiProperty({ enum: ['ACTA_CONFORMIDAD', 'SOPORTE_CONTRACTUAL'] })
  evidenceMode: 'ACTA_CONFORMIDAD' | 'SOPORTE_CONTRACTUAL';
}
