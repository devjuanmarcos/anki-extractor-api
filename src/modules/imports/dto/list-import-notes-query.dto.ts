import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListImportNotesQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter notes by an internal deck UUID.',
    example: '49768756-6369-4f37-a4dc-c427f2c91381',
  })
  deckId?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated tags. Returned notes must include all tags.',
    example: 'anki,imported',
  })
  tags?: string;
}
