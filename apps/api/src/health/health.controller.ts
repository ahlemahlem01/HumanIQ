import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";

/** Liveness and readiness probe for the load balancer / Docker healthcheck. Reveals nothing but "ok". */
@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: "error" });
    }
    return { status: "ok" };
  }
}
