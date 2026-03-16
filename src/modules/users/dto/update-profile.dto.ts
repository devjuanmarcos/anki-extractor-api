import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Updated User Name' })
  name?: string;

  @ApiPropertyOptional({ example: 'updated@example.com' })
  email?: string;

  @ApiPropertyOptional({
    example: 'An0therStrongPass!',
    description:
      'At least 8 characters, with uppercase, lowercase, number and special character.',
  })
  password?: string;
}
