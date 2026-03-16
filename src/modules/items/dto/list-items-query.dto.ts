import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListItemsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  limit?: number;

  @ApiPropertyOptional({ example: 'item name' })
  search?: string;
}
