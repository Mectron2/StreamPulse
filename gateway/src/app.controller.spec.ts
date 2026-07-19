import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns gateway health', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'gateway',
      });
    });
  });

  it('returns the dashboard snapshot from the aggregator', async () => {
    jest
      .spyOn(AppService.prototype, 'getDashboard')
      .mockResolvedValue({ cacheAvailable: true });

    await expect(appController.getDashboard()).resolves.toEqual({
      cacheAvailable: true,
    });
  });
});
