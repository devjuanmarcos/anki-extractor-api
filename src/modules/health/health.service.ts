import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { config } from '../../config/config';
import { HealthEntity } from './entities/health.entity';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async status(): Promise<HealthEntity> {
    const databaseHealthy = await this.prisma.isHealthy();

    return HealthEntity.create({
      status: databaseHealthy || !config.database.required ? 'ok' : 'degraded',
      environment: config.app.environment,
      database: databaseHealthy ? 'up' : 'down',
      uptimeInSeconds: process.uptime(),
      timestamp: new Date(),
    });
  }
}
