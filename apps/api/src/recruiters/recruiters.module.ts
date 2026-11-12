import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RecruitersController } from "./recruiters.controller";
import { RecruitersService } from "./recruiters.service";

@Module({
  imports: [AuthModule],
  controllers: [RecruitersController],
  providers: [RecruitersService],
})
export class RecruitersModule {}
