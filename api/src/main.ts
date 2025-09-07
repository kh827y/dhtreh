import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:3001','http://127.0.0.1:3001',
      'http://localhost:3002','http://127.0.0.1:3002',
      'http://localhost:3003','http://127.0.0.1:3003',
    ],
    methods: ['GET','POST','PUT','OPTIONS'],
  });  

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(3000);
  console.log(`API on http://localhost:3000`);
}
bootstrap();
