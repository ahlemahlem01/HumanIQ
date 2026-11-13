import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AssessmentsModule } from "../assessments/assessments.module";
import { InterviewsModule } from "../interviews/interviews.module";
import { MessagesModule } from "../messages/messages.module";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";

@Module({
  imports: [AiModule, AssessmentsModule, InterviewsModule, MessagesModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
