import { MediaType } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListImportMediaQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter media files by detected media type.',
    enum: MediaType,
    enumName: 'MediaType',
    example: MediaType.IMAGE,
  })
  type?: MediaType;
}
