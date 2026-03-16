import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { NoteEntity } from './entities/note.entity';
import { ImportsService } from './imports.service';

const noteNotFoundExample = {
  statusCode: 404,
  timestamp: '2026-03-16T15:30:00.000Z',
  message: 'Note not found.',
  error: 'Not Found',
  path: '/api/v1/notes/2c7e3383-e8f0-4778-a558-e4da8087b806',
  method: 'GET',
};

@ApiTags('Notes')
@ApiBearerAuth('bearer')
@Controller('notes')
export class NotesController {
  constructor(private readonly importsService: ImportsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get a note with named fields, tags, and related cards.',
  })
  @ApiOkResponse({ type: NoteEntity })
  @ApiNotFoundResponse({
    description: 'Note not found.',
    schema: { example: noteNotFoundExample },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findOne(@Param('id') id: string): Promise<NoteEntity> {
    return this.importsService.findNote(id);
  }
}
