import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DeckEntity } from './entities/deck.entity';
import { ImportsService } from './imports.service';

@ApiTags('Decks')
@ApiBearerAuth('bearer')
@Controller('decks')
export class DecksController {
  constructor(private readonly importsService: ImportsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get a deck summary with aggregate note and card counts.',
  })
  @ApiOkResponse({ type: DeckEntity })
  @ApiNotFoundResponse({ description: 'Deck not found.' })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findOne(@Param('id') id: string): Promise<DeckEntity> {
    return this.importsService.findDeck(id);
  }
}
