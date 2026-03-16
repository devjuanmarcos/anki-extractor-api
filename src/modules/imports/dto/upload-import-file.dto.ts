import { ApiProperty } from '@nestjs/swagger';

export class UploadImportFileDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'An Anki package file with the .apkg extension.',
  })
  file!: unknown;
}
