import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { JobsModule } from "./jobs/jobs.module";
import { ApplicationsModule } from "./applications/applications.module";
import { CandidatesModule } from "./candidates/candidates.module";
import { AiModule } from "./ai/ai.module";
import { AdminModule } from "./admin/admin.module";
import { SearchModule } from "./search/search.module";
import { InterviewsModule } from "./interviews/interviews.module";
import { AssessmentsModule } from "./assessments/assessments.module";
import { SourcingModule } from "./sourcing/sourcing.module";
import { FeedModule } from "./feed/feed.module";
import { RecruitersModule } from "./recruiters/recruiters.module";
import { MessagesModule } from "./messages/messages.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SearchModule,
    AuthModule,
    JobsModule,
    ApplicationsModule,
    CandidatesModule,
    AiModule,
    InterviewsModule,
    AssessmentsModule,
    SourcingModule,
    FeedModule,
    RecruitersModule,
    MessagesModule,
    AdminModule,
  ],
})
export class AppModule {}
