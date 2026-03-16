import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Template Admin' })
  name!: string;

  @ApiProperty({ example: 'admin@example.com' })
  email!: string;

  @ApiProperty({
    example: 'Str0ngPassw0rd!',
    description:
      'At least 8 characters, with uppercase, lowercase, number and special character.',
  })
  password!: string;
}
