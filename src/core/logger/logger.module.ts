import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      useFactory: () => {
        const logLevel =
          process.env.LOG_LEVEL ||
          (process.env.APP_MODE === 'WORKER' ? 'debug' : 'info');
        const service = (process.env.APP_MODE || 'api').toLowerCase();

        return {
          pinoHttp: {
            level: logLevel,
            transport:
              process.env.NODE_ENV !== 'production'
                ? {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
                      ignore: 'pid,hostname',
                    },
                  }
                : undefined,
            formatters: {
              level: (label: string) => ({ level: label }),
              log: (object: Record<string, unknown>) => ({
                service,
                ...object,
              }),
            },
            redact: {
              paths: [
                'headers.authorization',
                'req.headers.authorization',
              ],
              censor: '[REDACTED]',
            },
            autoLogging: false,
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}