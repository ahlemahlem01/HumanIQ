import { BadRequestException, Body, Controller, Delete, Get, Inject, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { RecruitersService } from "./recruiters.service";

class UpdateRecruiterDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

@Controller("recruiters")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecruitersController {
  constructor(@Inject(RecruitersService) private recruiters: RecruitersService) {}

  @Roles(Role.RECRUITER)
  @Get("team")
  team(@Req() req: { user: { recruiter: { id: string } } }) {
    return this.recruiters.team(req.user.recruiter.id);
  }

  @Roles(Role.RECRUITER)
  @Post("team")
  invite(
    @Req() req: { user: { id: string; recruiter: { id: string } } },
    @Body() dto: { email?: string; firstName?: string; lastName?: string; title?: string },
  ) {
    return this.recruiters.invite(req.user.recruiter.id, req.user.id, dto);
  }

  @Roles(Role.RECRUITER)
  @Get("me")
  me(@Req() req: { user: { recruiter: { id: string } } }) {
    return this.recruiters.getMe(req.user.recruiter.id);
  }

  @Roles(Role.RECRUITER)
  @Patch("me")
  update(@Req() req: { user: { recruiter: { id: string } } }, @Body() dto: UpdateRecruiterDto) {
    return this.recruiters.updateMe(req.user.recruiter.id, dto);
  }

  @Roles(Role.RECRUITER)
  @Patch("company")
  updateCompany(@Req() req: { user: { recruiter: { id: string } } }, @Body() dto: UpdateCompanyDto) {
    return this.recruiters.updateCompany(req.user.recruiter.id, dto);
  }

  @Roles(Role.RECRUITER)
  @Post("company/logo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  setLogo(@Req() req: { user: { recruiter: { id: string } } }, @UploadedFile() file?: Express.Multer.File) {
    return this.recruiters.setCompanyLogo(req.user.recruiter.id, file);
  }

  @Roles(Role.RECRUITER)
  @Delete("company/logo")
  removeLogo(@Req() req: { user: { recruiter: { id: string } } }) {
    return this.recruiters.removeCompanyLogo(req.user.recruiter.id);
  }

  @Roles(Role.RECRUITER)
  @Post("me/avatar")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  setAvatar(
    @Req() req: { user: { recruiter: { id: string } } },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Aucune image reçue.");
    return this.recruiters.setAvatar(req.user.recruiter.id, file);
  }
}
