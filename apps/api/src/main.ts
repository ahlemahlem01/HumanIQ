import "reflect-metadata";
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { allowedOrigins, isOriginAllowed, isProduction, trustedProxies } from "./config/security";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy (Caddy, nginx, a platform router) the client IP comes from X-Forwarded-For.
  app.set("trust proxy", trustedProxies());
  // The web app lives on another origin and shows avatars served from /uploads, hence cross-origin resource policy.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads" });
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
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
  app.enableShutdownHooks();

  if (isProduction() && allowedOrigins().length === 0) {
    console.warn("FRONTEND_URL n'est pas défini : aucun navigateur ne pourra appeler l'API.");
  }

  const port = Number(process.env.PORT ?? 4100);
  await app.listen(port, "0.0.0.0");
  console.log(`API ready on http://localhost:${port}/api`);
}

void bootstrap();
