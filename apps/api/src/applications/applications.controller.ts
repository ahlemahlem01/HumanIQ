import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApplicationStage, AssessmentType, Role } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ApplicationsService } from "./applications.service";
import { AssessmentsService } from "../assessments/assessments.service";
import { InterviewsService } from "../interviews/interviews.service";

class ShortlistDto {
  @IsString()
  jobId!: string;

  @IsString()
  candidateId!: string;
}

class ApplyDto {
  @IsString()
  jobId!: string;

  @IsOptional()
  @IsString()
  coverNote?: string;
}

class NoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

class MoveDto {
  @IsEnum(ApplicationStage)
  stage!: ApplicationStage;

  @IsInt()
  kanbanOrder!: number;
}

class AssessmentDto {
  @IsEnum(AssessmentType)
  type!: AssessmentType;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsInt()
  score?: number;
}

@Controller("applications")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(
    @Inject(ApplicationsService) private applications: ApplicationsService,
    @Inject(AssessmentsService) private assessments: AssessmentsService,
    @Inject(InterviewsService) private interviews: InterviewsService,
  ) {}

  @Roles(Role.CANDIDATE)
  @Post()
  apply(@Req() req: { user: { candidate: { id: string } } }, @Body() dto: ApplyDto) {
    return this.applications.apply(req.user.candidate.id, dto.jobId, dto.coverNote);
  }

  @Roles(Role.RECRUITER)
  @Post("shortlist")
  shortlist(
    @Req() req: { user: { recruiter: { id: string } } },
    @Body() dto: ShortlistDto,
  ) {
    return this.applications.shortlist(req.user.recruiter.id, dto.jobId, dto.candidateId);
  }

  @Roles(Role.CANDIDATE)
  @Get("mine")
  mine(@Req() req: { user: { candidate: { id: string } } }) {
    return this.applications.mine(req.user.candidate.id);
  }

  @Roles(Role.RECRUITER)
  @Get("stats")
  stats(@Req() req: { user: { recruiter: { id: string } } }, @Query("days") days?: string) {
    const parsed = Number(days);
    const window = [7, 30, 90].includes(parsed) ? parsed : 30;
    return this.applications.stats(req.user.recruiter.id, window);
  }

  @Roles(Role.RECRUITER)
  @Get("pipeline/:jobId")
  pipeline(@Req() req: { user: { recruiter: { id: string } } }, @Param("jobId") jobId: string) {
    return this.applications.pipeline(jobId, req.user.recruiter.id);
  }

  @Roles(Role.RECRUITER)
  @Patch(":id/move")
  move(
    @Req() req: { user: { recruiter: { id: string } } },
    @Param("id") id: string,
    @Body() dto: MoveDto,
  ) {
    return this.applications.move(id, req.user.recruiter.id, dto.stage, dto.kanbanOrder);
  }

  @Roles(Role.RECRUITER)
  @Post(":id/assessments")
  assess(
    @Req() req: { user: { recruiter: { id: string } } },
    @Param("id") id: string,
    @Body() dto: AssessmentDto,
  ) {
    return this.applications.addAssessment(id, req.user.recruiter.id, dto);
  }

  @Roles(Role.RECRUITER)
  @Get(":id/notes")
  notes(@Req() req: { user: { recruiter: { id: string } } }, @Param("id") id: string) {
    return this.applications.listNotes(id, req.user.recruiter.id);
  }

  @Roles(Role.RECRUITER)
  @Post(":id/notes")
  addNote(
    @Req() req: { user: { id: string; recruiter: { id: string } } },
    @Param("id") id: string,
    @Body() dto: NoteDto,
  ) {
    return this.applications.addNote(id, req.user.recruiter.id, req.user.id, dto.body);
  }

  @Roles(Role.RECRUITER)
  @Post(":id/tests")
  assignTests(@Req() req: { user: { recruiter: { id: string } } }, @Param("id") id: string) {
    return this.assessments.assignBundle(id, req.user.recruiter.id);
  }

  @Roles(Role.RECRUITER)
  @Post(":id/interview")
  inviteInterview(@Req() req: { user: { recruiter: { id: string } } }, @Param("id") id: string) {
    return this.interviews.invite(id, req.user.recruiter.id);
  }
}
