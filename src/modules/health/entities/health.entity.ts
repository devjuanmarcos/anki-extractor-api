import { ApiProperty } from '@nestjs/swagger';

export class HealthEntity {
  @ApiProperty({ example: 'ok' })
  status!: 'ok' | 'degraded';

  @ApiProperty({ example: 'development' })
  environment!: string;

  @ApiProperty({ example: 'up' })
  database!: 'up' | 'down';

  @ApiProperty({ example: 12.45 })
  uptimeInSeconds!: number;

  @ApiProperty()
  timestamp!: Date;

  static create(input: HealthEntity): HealthEntity {
    return input;
  }
}
