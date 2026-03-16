import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MediaInfoEntity } from './entities/media.entity';
import { ImportsService } from './imports.service';

const mediaNotFoundExample = {
  statusCode: 404,
  timestamp: '2026-03-16T15:30:00.000Z',
  message: 'Media not found.',
  error: 'Not Found',
  path: '/api/v1/media/1ebeb9d3-9225-4fc6-8dcf-ef8bc0709f85/info',
  method: 'GET',
};

const mediaFileNotFoundExample = {
  statusCode: 404,
  timestamp: '2026-03-16T15:30:00.000Z',
  message: 'Media file not found.',
  error: 'Not Found',
  path: '/api/v1/media/1ebeb9d3-9225-4fc6-8dcf-ef8bc0709f85',
  method: 'GET',
};

@ApiTags('Media')
@ApiBearerAuth('bearer')
@Controller('media')
export class MediaController {
  constructor(private readonly importsService: ImportsService) {}

  @Get(':id/info')
  @ApiOperation({
    summary: 'Get metadata for an extracted media file without streaming it.',
  })
  @ApiOkResponse({ type: MediaInfoEntity })
  @ApiNotFoundResponse({
    description: 'Media not found.',
    schema: { example: mediaNotFoundExample },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findInfo(@Param('id') id: string): Promise<MediaInfoEntity> {
    return this.importsService.findMediaInfo(id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Stream a stored media file if its binary is still available.',
  })
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({
    description: 'Binary media stream.',
  })
  @ApiNotFoundResponse({
    description: 'Media file not found.',
    schema: { example: mediaFileNotFoundExample },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findOne(@Param('id') id: string): Promise<StreamableFile> {
    return this.importsService.readMediaFile(id);
  }
}
