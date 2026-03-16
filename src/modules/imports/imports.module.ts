import { Module } from '@nestjs/common';
import { AnkiPackageService } from './anki-package.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, AnkiPackageService],
  exports: [ImportsService, AnkiPackageService],
})
export class ImportsModule {}
