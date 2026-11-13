import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { VerifiedCompanyGuard } from "../auth/verified-company.guard";
import { MessagesService, type Viewer } from "./messages.service";

type Req = { user: Viewer };

@Controller("messages")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.RECRUITER, Role.CANDIDATE)
export class MessagesController {
  constructor(@Inject(MessagesService) private messages: MessagesService) {}

  @Get("unread")
  unread(@Req() req: Req) {
    return this.messages.unread(req.user);
  }

  @Get("preferences")
  preferences(@Req() req: Req) {
    return this.messages.preferences(req.user);
  }

  @Patch("preferences")
  setPreferences(@Req() req: Req, @Body() dto: { emailNotifications?: boolean }) {
    return this.messages.setPreferences(req.user, dto);
  }

  @Get("conversations")
  list(@Req() req: Req) {
    return this.messages.list(req.user);
  }

  @Get("conversations/:id")
  thread(@Req() req: Req, @Param("id") id: string) {
    return this.messages.thread(req.user, id);
  }

  @Post("conversations/:id")
  send(@Req() req: Req, @Param("id") id: string, @Body() dto: { body?: string }) {
    return this.messages.send(req.user, id, dto);
  }

  @Roles(Role.RECRUITER)
  @UseGuards(VerifiedCompanyGuard)
  @Get("prospect/:candidateId")
  prospect(@Req() req: Req, @Param("candidateId") candidateId: string) {
    return this.messages.prospect(req.user, candidateId);
  }

  @Roles(Role.RECRUITER)
  @UseGuards(VerifiedCompanyGuard)
  @Post("start")
  start(@Req() req: Req, @Body() dto: { candidateId?: string; jobId?: string; body?: string }) {
    return this.messages.start(req.user, dto);
  }
}
