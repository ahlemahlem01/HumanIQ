import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { FeedService } from "./feed.service";

class CommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;
}

class PostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1500)
  body!: string;
}

@Controller("feed")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeedController {
  constructor(@Inject(FeedService) private feed: FeedService) {}

  @Roles(Role.CANDIDATE)
  @Get()
  mine(@Req() req: { user: { id: string } }) {
    return this.feed.forUser(req.user.id);
  }

  @Roles(Role.CANDIDATE)
  @Post()
  create(@Req() req: { user: { id: string } }, @Body() dto: PostDto) {
    return this.feed.create(req.user.id, dto.body);
  }

  @Roles(Role.CANDIDATE)
  @Get("saved")
  saved(@Req() req: { user: { id: string } }) {
    return this.feed.saved(req.user.id);
  }

  @Roles(Role.CANDIDATE)
  @Get(":id/comments")
  comments(@Param("id") id: string) {
    return this.feed.comments(id);
  }

  @Roles(Role.CANDIDATE)
  @Post(":id/comments")
  addComment(@Req() req: { user: { id: string } }, @Param("id") id: string, @Body() dto: CommentDto) {
    return this.feed.addComment(req.user.id, id, dto.body);
  }

  @Roles(Role.CANDIDATE)
  @Post(":id/like")
  like(@Req() req: { user: { id: string } }, @Param("id") id: string) {
    return this.feed.like(req.user.id, id);
  }

  @Roles(Role.CANDIDATE)
  @Post(":id/save")
  save(@Req() req: { user: { id: string } }, @Param("id") id: string) {
    return this.feed.save(req.user.id, id);
  }

  @Roles(Role.CANDIDATE)
  @Post(":id/repost")
  repost(@Req() req: { user: { id: string } }, @Param("id") id: string) {
    return this.feed.repost(req.user.id, id);
  }
}
