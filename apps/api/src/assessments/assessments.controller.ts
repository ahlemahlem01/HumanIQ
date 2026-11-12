import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsInt, IsObject, IsOptional, IsString } from "class-validator";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AssessmentsService } from "./assessments.service";

class SubmitDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  answers?: number[];

  @IsOptional()
  @IsObject()
  code?: Record<string, string>;
}

class RunCodeDto {
  @IsString()
  challengeId!: string;

  @IsString()
  source!: string;
}

@Controller("assessments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentsController {
  constructor(@Inject(AssessmentsService) private assessments: AssessmentsService) {}

  @Roles(Role.CANDIDATE)
  @Get("mine")
  mine(@Req() req: { user: { candidate: { id: string } } }) {
    return this.assessments.mine(req.user.candidate.id);
  }

  @Roles(Role.CANDIDATE)
  @Get(":id")
  get(@Req() req: { user: { candidate: { id: string } } }, @Param("id") id: string) {
    return this.assessments.getForCandidate(id, req.user.candidate.id);
  }

  @Roles(Role.CANDIDATE)
  @Post(":id/run")
  run(
    @Req() req: { user: { candidate: { id: string } } },
    @Param("id") id: string,
    @Body() dto: RunCodeDto,
  ) {
    return this.assessments.runPublic(id, req.user.candidate.id, dto.challengeId, dto.source);
  }

  @Roles(Role.CANDIDATE)
  @Post(":id/submit")
  submit(
    @Req() req: { user: { candidate: { id: string } } },
    @Param("id") id: string,
    @Body() dto: SubmitDto,
  ) {
    return this.assessments.submit(id, req.user.candidate.id, dto);
  }
}
