import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateItemDto {
  @ApiPropertyOptional({ example: 'Updated name' })
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description.' })
  description?: string;
}
