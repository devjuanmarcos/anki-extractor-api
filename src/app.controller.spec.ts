import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should expose template metadata', () => {
      const metadata = appController.getMetadata();

      expect(typeof metadata.name).toBe('string');
      expect(typeof metadata.links.health).toBe('string');
      expect(typeof metadata.links.swagger).toBe('string');
      expect(typeof metadata.links.redoc).toBe('string');
    });
  });
});
