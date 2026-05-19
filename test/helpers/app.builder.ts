import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, Type } from '@nestjs/common';

export interface ProviderOverride {
  provide: unknown;
  useValue: unknown;
}

export interface CreateTestingAppOptions {
  overrides?: ProviderOverride[];
}

export async function createTestingApp(
  moduleClass: Type<unknown>,
  options?: CreateTestingAppOptions,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [moduleClass],
  });

  if (options?.overrides) {
    for (const override of options.overrides) {
      builder.overrideProvider(override.provide as Type<unknown>).useValue(override.useValue);
    }
  }

  const moduleFixture: TestingModule = await builder.compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  return app;
}
