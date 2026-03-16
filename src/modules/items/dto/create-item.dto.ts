import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ example: 'My first item' })
  name!: string;

  @ApiPropertyOptional({ example: 'A brief description of this item.' })
  description?: string;
}
