import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { config } from './config/config';

@ApiTags('Application')
@Controller({ path: '', version: VERSION_NEUTRAL })
export class AppController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Return template metadata and useful links.' })
  getMetadata() {
    return {
      name: config.app.name,
      environment: config.app.environment,
      version: `v${config.app.apiVersion}`,
      links: {
        health: `/${config.app.apiPrefix}/v${config.app.apiVersion}/health`,
        swagger: `/${config.docs.swaggerPath}`,
        redoc: `/${config.docs.redocPath}`,
      },
    };
  }
}
