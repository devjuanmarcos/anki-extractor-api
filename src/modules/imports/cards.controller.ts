import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CardEntity } from './entities/card.entity';
import { ImportsService } from './imports.service';

const cardNotFoundExample = {
  statusCode: 404,
  timestamp: '2026-03-16T15:30:00.000Z',
  message: 'Card not found.',
  error: 'Not Found',
  path: '/api/v1/cards/8f8e62c1-baf2-4f37-a14d-18d7af92b48c',
  method: 'GET',
};

@ApiTags('Cards')
@ApiBearerAuth('bearer')
@Controller('cards')
export class CardsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get a card with deck, note, and review metadata.',
  })
  @ApiOkResponse({ type: CardEntity })
  @ApiNotFoundResponse({
    description: 'Card not found.',
    schema: { example: cardNotFoundExample },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findOne(@Param('id') id: string): Promise<CardEntity> {
    return this.importsService.findCard(id);
  }
}
