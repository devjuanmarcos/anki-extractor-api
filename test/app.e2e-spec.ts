import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.setup';

describe('Template API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_REQUIRED = 'false';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    await configureApplication(app as NestExpressApplication);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api returns template metadata', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/api').expect(200);
    const body = response.body as {
      name: string;
      links: { health: string; swagger: string; redoc: string };
    };

    expect(typeof body.name).toBe('string');
    expect(typeof body.links.health).toBe('string');
    expect(typeof body.links.swagger).toBe('string');
    expect(typeof body.links.redoc).toBe('string');
  });

  it('GET /api/v1/health returns health payload', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get('/api/v1/health').expect(200);
    const body = response.body as {
      status: string;
      database: string;
    };

    expect(typeof body.status).toBe('string');
    expect(typeof body.database).toBe('string');
  });
});
