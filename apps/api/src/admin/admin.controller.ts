import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { JobStatus, Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AdminService } from "./admin.service";

class ModerateDto {
  @IsEnum(JobStatus)
  status!: JobStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(@Inject(AdminService) private admin: AdminService) {}

  @Get("overview")
  overview() {
    return this.admin.overview();
  }

  @Get("jobs")
  jobs() {
    return this.admin.jobs();
  }

  @Patch("jobs/:id")
  moderate(@Param("id") id: string, @Body() dto: ModerateDto) {
    return this.admin.moderate(id, dto.status, dto.note);
  }

  @Get("gdpr/:userId")
  exportUser(@Param("userId") userId: string) {
    return this.admin.gdprExport(userId);
  }

  @Post("gdpr/:userId/anonymize")
  anonymize(@Param("userId") userId: string) {
    return this.admin.gdprAnonymize(userId);
  }
}
