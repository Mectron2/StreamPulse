import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const appService = {
    getHealth: () => ({ status: 'ok', service: 'gateway' }),
    getEvents: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ status: 'ok', service: 'gateway' });
  });

  it('/events (GET)', async () => {
    await request(app.getHttpServer())
      .get('/events?limit=25&cursor=opaque')
      .expect(200)
      .expect({ items: [], nextCursor: null });
    expect(appService.getEvents).toHaveBeenCalledWith('25', 'opaque');
  });
});
