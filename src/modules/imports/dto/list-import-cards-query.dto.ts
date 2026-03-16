import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListImportCardsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter cards by an internal deck UUID.',
    example: '49768756-6369-4f37-a14d-18d7af92b48c',
  })
  deckId?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated note tags. Returned cards must belong to notes that include all tags.',
    example: 'anki,imported',
  })
  tags?: string;
}
