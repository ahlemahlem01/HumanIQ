import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, MinLength, IsObject } from "class-validator";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CandidatesService } from "./candidates.service";

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsInt()
  experienceYears?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsInt()
  salaryMin?: number;

  @IsOptional()
  @IsInt()
  salaryMax?: number;

  @IsOptional()
  @IsBoolean()
  reverseRecruiting?: boolean;

  @IsOptional()
  @IsBoolean()
  anonymousVisible?: boolean;

  @IsOptional()
  @IsString()
  linkedinUrl?: string;

  @IsOptional()
  @IsObject()
  cvSettings?: Record<string, unknown>;
}

class ExperienceDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(2)
  company!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  current?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

class ProjectDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class EducationDto {
  @IsString()
  @MinLength(2)
  school!: string;

  @IsOptional()
  @IsString()
  degree?: string;

  @IsOptional()
  @IsString()
  field?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller("candidates")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CandidatesController {
  constructor(@Inject(CandidatesService) private candidates: CandidatesService) {}

  @Roles(Role.CANDIDATE)
  @Get("me")
  me(@Req() req: { user: { candidate: { id: string } } }) {
    return this.candidates.getMe(req.user.candidate.id);
  }

  @Roles(Role.CANDIDATE)
  @Patch("me")
  update(@Req() req: { user: { candidate: { id: string } } }, @Body() dto: UpdateProfileDto) {
    return this.candidates.updateMe(req.user.candidate.id, dto);
  }

  @Roles(Role.CANDIDATE)
  @Post("me/cover")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  setCover(
    @Req() req: { user: { candidate: { id: string } } },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Aucune image reçue.");
    return this.candidates.setCover(req.user.candidate.id, file);
  }

  @Roles(Role.CANDIDATE)
  @Post("me/avatar")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  setAvatar(
    @Req() req: { user: { candidate: { id: string } } },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Aucune image reçue.");
    return this.candidates.setAvatar(req.user.candidate.id, file);
  }

  @Roles(Role.CANDIDATE)
  @Post("me/experiences")
  addExperience(@Req() req: { user: { candidate: { id: string } } }, @Body() dto: ExperienceDto) {
    return this.candidates.addExperience(req.user.candidate.id, dto);
  }

  @Roles(Role.CANDIDATE)
  @Patch("me/experiences/:id")
  updateExperience(
    @Req() req: { user: { candidate: { id: string } } },
    @Param("id") id: string,
    @Body() dto: ExperienceDto,
  ) {
    return this.candidates.updateExperience(req.user.candidate.id, id, dto);
  }

  @Roles(Role.CANDIDATE)
  @Delete("me/experiences/:id")
  removeExperience(@Req() req: { user: { candidate: { id: string } } }, @Param("id") id: string) {
    return this.candidates.removeExperience(req.user.candidate.id, id);
  }

  @Roles(Role.CANDIDATE)
  @Post("me/educations")
  addEducation(@Req() req: { user: { candidate: { id: string } } }, @Body() dto: EducationDto) {
    return this.candidates.addEducation(req.user.candidate.id, dto);
  }

  @Roles(Role.CANDIDATE)
  @Patch("me/educations/:id")
  updateEducation(
    @Req() req: { user: { candidate: { id: string } } },
    @Param("id") id: string,
    @Body() dto: EducationDto,
  ) {
    return this.candidates.updateEducation(req.user.candidate.id, id, dto);
  }

  @Roles(Role.CANDIDATE)
  @Delete("me/educations/:id")
  removeEducation(@Req() req: { user: { candidate: { id: string } } }, @Param("id") id: string) {
    return this.candidates.removeEducation(req.user.candidate.id, id);
  }

  @Roles(Role.CANDIDATE)
  @Post("me/projects")
  addProject(@Req() req: { user: { candidate: { id: string } } }, @Body() dto: ProjectDto) {
    return this.candidates.addProject(req.user.candidate.id, dto);
  }

  @Roles(Role.CANDIDATE)
  @Patch("me/projects/:id")
  updateProject(
    @Req() req: { user: { candidate: { id: string } } },
    @Param("id") id: string,
    @Body() dto: ProjectDto,
  ) {
    return this.candidates.updateProject(req.user.candidate.id, id, dto);
  }

  @Roles(Role.CANDIDATE)
  @Delete("me/projects/:id")
  removeProject(@Req() req: { user: { candidate: { id: string } } }, @Param("id") id: string) {
    return this.candidates.removeProject(req.user.candidate.id, id);
  }

  @Roles(Role.CANDIDATE)
  @Get("me/views")
  views(@Req() req: { user: { candidate: { id: string } } }) {
    return this.candidates.viewsFor(req.user.candidate.id);
  }

  @Roles(Role.RECRUITER, Role.ADMIN)
  @Get("cvtheque")
  library() {
    return this.candidates.library();
  }

  @Roles(Role.RECRUITER, Role.ADMIN)
  @Get("cvtheque/:id")
  libraryOne(@Req() req: { user: { id: string } }, @Param("id") id: string) {
    return this.candidates.libraryOne(id, req.user.id);
  }

  @Roles(Role.RECRUITER, Role.ADMIN)
  @Get("talents/search")
  searchTalents(
    @Query("q") q?: string,
    @Query("skills") skills?: string,
    @Query("location") location?: string,
    @Query("minYears") minYears?: string,
    @Query("maxYears") maxYears?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const num = (value?: string) => (value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : undefined);
    return this.candidates.searchTalents({
      q,
      skills: skills ? skills.split(",") : [],
      location: location || undefined,
      minYears: num(minYears),
      maxYears: num(maxYears),
      limit: num(limit),
      offset: num(offset),
    });
  }

  @Roles(Role.RECRUITER, Role.ADMIN)
  @Post("talents/reindex")
  reindexTalents() {
    return this.candidates.rebuildTalentIndex();
  }

  @Roles(Role.RECRUITER, Role.ADMIN)
  @Get("reverse-pool")
  pool() {
    return this.candidates.reversePool();
  }

  @Roles(Role.RECRUITER, Role.ADMIN)
  @Get("pool/:id")
  open(@Req() req: { user: { id: string } }, @Param("id") id: string) {
    return this.candidates.openForRecruiter(id, req.user.id);
  }
}
