import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MinLength } from "class-validator";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { InterviewsService } from "./interviews.service";

class StartDto {
  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  applicationId?: string;
}

class AnswerDto {
  @IsString()
  @MinLength(20)
  text!: string;
}

@Controller("interviews")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InterviewsController {
  constructor(@Inject(InterviewsService) private interviews: InterviewsService) {}

  @Roles(Role.CANDIDATE)
  @Get()
  list(@Req() req: { user: { candidate: { id: string } } }) {
    return this.interviews.list(req.user.candidate.id);
  }

  @Roles(Role.CANDIDATE)
  @Post()
  start(@Req() req: { user: { candidate: { id: string } } }, @Body() dto: StartDto) {
    return this.interviews.start(req.user.candidate.id, dto);
  }

  @Roles(Role.CANDIDATE, Role.RECRUITER)
  @Get(":id")
  get(
    @Req() req: { user: { role: Role; candidate?: { id: string }; recruiter?: { id: string } } },
    @Param("id") id: string,
  ) {
    return this.interviews.get(
      id,
      req.user.role === "CANDIDATE" ? req.user.candidate?.id : undefined,
      req.user.role === "RECRUITER" ? req.user.recruiter?.id : undefined,
    );
  }

  @Roles(Role.CANDIDATE)
  @Post(":id/answer")
  answer(
    @Req() req: { user: { candidate: { id: string } } },
    @Param("id") id: string,
    @Body() dto: AnswerDto,
  ) {
    return this.interviews.answer(id, req.user.candidate.id, dto.text);
  }
}
