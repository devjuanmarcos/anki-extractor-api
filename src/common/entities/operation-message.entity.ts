import { ApiProperty } from '@nestjs/swagger';

export class OperationMessageEntity {
  @ApiProperty({ example: 'Operation completed successfully.' })
  message!: string;

  static create(message: string): OperationMessageEntity {
    return { message };
  }
}
