import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { HealthEntity } from './entities/health.entity';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Basic liveness check with database status.' })
  @ApiOkResponse({ type: HealthEntity })
  async status(): Promise<HealthEntity> {
    return this.healthService.status();
  }
}
