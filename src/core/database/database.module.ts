import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      // Usamos 'forRootAsync' porque nossa configuração do banco de dados
      // DEPENDE do ConfigService (para pegar as senhas, host, etc. do .env).
      // A aplicação precisa primeiro carregar o ConfigModule para depois
      imports: [ConfigModule],
      inject: [ConfigService],

      // useFactory é uma função que retorna o objeto de configuração do TypeORM.
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),

        autoLoadEntities: true,

        synchronize: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
