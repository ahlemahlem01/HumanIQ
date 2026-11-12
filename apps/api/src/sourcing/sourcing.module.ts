import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { SourcingController } from "./sourcing.controller";
import { SourcingService } from "./sourcing.service";

@Module({
  imports: [AiModule],
  controllers: [SourcingController],
  providers: [SourcingService],
})
export class SourcingModule {}
