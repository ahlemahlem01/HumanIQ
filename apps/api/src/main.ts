import "reflect-metadata";
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads" });
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.startsWith("chrome-extension://")) return callback(null, true);
      if (origin.startsWith("http://localhost:")) return callback(null, true);
      const allowed = process.env.FRONTEND_URL ?? "http://localhost:3100";
      return callback(null, origin === allowed);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useBodyParser("json", { limit: "2mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "2mb" });
  const port = Number(process.env.PORT ?? 4100);
  await app.listen(port);
  console.log(`API ready on http://localhost:${port}/api`);
}

bootstrap();
