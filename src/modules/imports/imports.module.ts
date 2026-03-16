import { Module } from '@nestjs/common';
import { AnkiPackageService } from './anki-package.service';
import { CardsController } from './cards.controller';
import { DecksController } from './decks.controller';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { MediaController } from './media.controller';
import { NotesController } from './notes.controller';

@Module({
  controllers: [
    ImportsController,
    DecksController,
    NotesController,
    CardsController,
    MediaController,
  ],
  providers: [ImportsService, AnkiPackageService],
  exports: [ImportsService, AnkiPackageService],
})
export class ImportsModule {}
