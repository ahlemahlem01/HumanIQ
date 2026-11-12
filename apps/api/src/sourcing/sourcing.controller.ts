import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsOptional, IsString, MinLength } from "class-validator";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SourcingService } from "./sourcing.service";

class ImportLinkedInDto {
  @IsString()
  jobId!: string;

  @IsOptional()
  @IsString()
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  about?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  experience?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  rawText?: string;
}

@Controller("sourcing")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.RECRUITER)
export class SourcingController {
  constructor(@Inject(SourcingService) private sourcing: SourcingService) {}

  @Post("linkedin")
  importLinkedIn(
    @Req() req: { user: { id: string; recruiter: { id: string } } },
    @Body() dto: ImportLinkedInDto,
  ) {
    return this.sourcing.importLinkedIn({ id: req.user.recruiter.id, userId: req.user.id }, dto);
  }

  @Get("imports")
  imports(@Req() req: { user: { recruiter: { id: string } } }) {
    return this.sourcing.recent(req.user.recruiter.id);
  }
}
