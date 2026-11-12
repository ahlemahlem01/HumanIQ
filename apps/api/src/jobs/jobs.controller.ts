import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from "class-validator";
import { JobStatus, Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { JobsService } from "./jobs.service";

class CreateJobDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(20)
  description!: string;

  @IsString()
  location!: string;

  @IsOptional()
  @IsBoolean()
  remote?: boolean;

  @IsOptional()
  @IsString()
  contractType?: string;

  @IsOptional()
  @IsInt()
  salaryMin?: number;

  @IsOptional()
  @IsInt()
  salaryMax?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsArray()
  @IsString({ each: true })
  requiredSkills!: string[];

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}

class UpdateJobDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsBoolean()
  remote?: boolean;

  @IsOptional()
  @IsString()
  contractType?: string;

  @IsOptional()
  @IsInt()
  salaryMin?: number;

  @IsOptional()
  @IsInt()
  salaryMax?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}

@Controller("jobs")
export class JobsController {
  constructor(@Inject(JobsService) private jobs: JobsService) {}

  @Get()
  list(@Query("q") q?: string, @Query("location") location?: string) {
    return this.jobs.listPublic(q, location);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RECRUITER)
  @Get("mine")
  mine(@Req() req: { user: { recruiter: { id: string } } }) {
    return this.jobs.listMine(req.user.recruiter.id);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.jobs.getPublic(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RECRUITER)
  @Patch(":id")
  update(
    @Req() req: { user: { recruiter: { id: string } } },
    @Param("id") id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobs.update(req.user.recruiter.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RECRUITER)
  @Post()
  create(
    @Req() req: { user: { recruiter: { id: string; companyId: string } } },
    @Body() dto: CreateJobDto,
  ) {
    return this.jobs.create(req.user.recruiter, dto);
  }
}
