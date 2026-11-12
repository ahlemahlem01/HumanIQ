import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AiService } from "./ai.service";
import { EmbeddingsService } from "./embeddings.service";
import { MAX_CV_BYTES } from "./parsing.service";

class ParseCvDto {
  @IsString()
  @MinLength(40)
  cvText!: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}

class RewriteCvDto {
  @IsString()
  jobId!: string;
}

class OfferGapDto {
  @IsString()
  @MinLength(40)
  description!: string;
}

class DraftJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  brief!: string;
}

type CandidateRequest = { user: { candidate: { id: string } } };
type RecruiterRequest = { user: { recruiter: { id: string } } };

@Controller("ai")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(
    @Inject(AiService) private ai: AiService,
    @Inject(EmbeddingsService) private embeddings: EmbeddingsService,
  ) {}

  @Get("status")
  status() {
    return this.ai.status();
  }

  @Roles(Role.CANDIDATE)
  @Post("parse-cv")
  parse(@Req() req: CandidateRequest, @Body() dto: ParseCvDto) {
    return this.ai.parseCvText(req.user.candidate.id, dto.cvText, dto.fileName);
  }

  @Roles(Role.CANDIDATE)
  @Post("cv/upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_CV_BYTES } }))
  upload(@Req() req: CandidateRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Aucun fichier reçu (champ attendu : 'file').");
    return this.ai.ingestCvFile(req.user.candidate.id, file);
  }

  @Roles(Role.CANDIDATE)
  @Post("cv/assist")
  assist(@Req() req: CandidateRequest, @Body() dto: Record<string, unknown>) {
    return this.ai.assistCv(req.user.candidate.id, dto as never);
  }

  @Roles(Role.CANDIDATE)
  @Post("cv/publish")
  publish(@Req() req: CandidateRequest, @Body() dto: { text?: string }) {
    return this.ai.publishCvDocument(req.user.candidate.id, dto.text ?? "");
  }

  @Roles(Role.CANDIDATE)
  @Get("cv/ats")
  cvAts(@Req() req: CandidateRequest) {
    return this.ai.cvAts(req.user.candidate.id);
  }

  @Roles(Role.CANDIDATE)
  @Get("cv/report")
  cvReport(@Req() req: CandidateRequest) {
    return this.ai.cvReport(req.user.candidate.id);
  }

  @Roles(Role.CANDIDATE)
  @Post("cv/rewrite")
  rewrite(@Req() req: CandidateRequest, @Body() dto: RewriteCvDto) {
    return this.ai.rewriteForJob(req.user.candidate.id, dto.jobId);
  }

  @Roles(Role.CANDIDATE)
  @Post("skill-gap")
  skillGap(@Req() req: CandidateRequest, @Body() dto: OfferGapDto) {
    return this.ai.skillGapForOffer(req.user.candidate.id, dto.description);
  }

  @Roles(Role.CANDIDATE)
  @Get("match/:jobId")
  match(@Req() req: CandidateRequest, @Param("jobId") jobId: string) {
    return this.ai.matchJob(req.user.candidate.id, jobId);
  }

  @Roles(Role.CANDIDATE)
  @Get("recommendations")
  recommendations(
    @Req() req: CandidateRequest,
    @Query("limit", new ParseIntPipe({ optional: true })) limit = 10,
  ) {
    return this.ai.recommendJobs(req.user.candidate.id, Math.min(limit, 50));
  }

  @Roles(Role.CANDIDATE)
  @Get("feedback/:jobId")
  feedback(@Req() req: CandidateRequest, @Param("jobId") jobId: string) {
    return this.ai.jobFeedback(req.user.candidate.id, jobId);
  }

  @Roles(Role.RECRUITER)
  @Post("job-draft")
  draftJob(@Req() req: RecruiterRequest, @Body() dto: DraftJobDto) {
    return this.ai.draftJob(req.user.recruiter.id, dto);
  }

  @Roles(Role.RECRUITER)
  @Get("job/:jobId/candidates")
  rank(
    @Req() req: RecruiterRequest,
    @Param("jobId") jobId: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit = 10,
  ) {
    return this.ai.rankCandidatesForJob(jobId, req.user.recruiter.id, Math.min(limit, 50));
  }

  @Get("semantic-search")
  semanticSearch(
    @Query("q") q: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    if (!q?.trim()) throw new BadRequestException("Paramètre 'q' requis.");
    return this.embeddings.searchJobs(q, Math.min(limit, 50));
  }

  @Get("salary/markets")
  salaryMarkets() {
    return this.ai.listSalaryBenchmarks();
  }

  @Get("salary")
  salary(
    @Query("role") role = "Software Engineer",
    @Query("tech") tech = "TypeScript",
    @Query("location") location = "Paris",
  ) {
    return this.ai.salaryBenchmark(role, tech, location);
  }

  @Roles(Role.ADMIN)
  @Get("embeddings/coverage")
  coverage() {
    return this.embeddings.coverage();
  }

  @Roles(Role.ADMIN)
  @Post("embeddings/reindex")
  reindex() {
    return this.embeddings.reindexAll();
  }
}
