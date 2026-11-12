import { Global, Injectable, Logger, Module, OnModuleInit } from "@nestjs/common";
import { MeiliSearch } from "meilisearch";

export type TalentDoc = {
  id: string;
  headline: string;
  location: string;
  experienceYears: number;
  skills: string[];
  bio: string;
  /** Experience titles and companies, searchable but never displayed. */
  background: string;
  /** Real name, only indexed when the candidate is not anonymous. */
  searchName: string;
  displayName: string;
  anonymous: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
};

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  client: MeiliSearch | null = null;
  private ready = false;

  async onModuleInit() {
    try {
      this.client = new MeiliSearch({
        host: process.env.MEILI_HOST ?? "http://localhost:7701",
        apiKey: process.env.MEILI_KEY,
      });
      await this.client.health();
      const index = this.client.index("jobs");
      await index.updateFilterableAttributes(["status", "location", "remote", "contractType"]);
      await index.updateSearchableAttributes(["title", "description", "requiredSkills", "companyName", "location"]);

      const talents = this.client.index("talents");
      await this.client.createIndex("talents", { primaryKey: "id" }).catch(() => undefined);
      await talents.updateFilterableAttributes(["skills", "location", "experienceYears"]);
      await talents.updateSortableAttributes(["experienceYears"]);
      await talents.updateSearchableAttributes(["headline", "skills", "searchName", "location", "bio", "background"]);
      this.ready = true;
    } catch {
      this.logger.warn("Meilisearch unavailable — fallback to PostgreSQL search.");
      this.client = null;
      this.ready = false;
    }
  }

  isReady() {
    return this.ready && !!this.client;
  }

  async indexJob(job: {
    id: string;
    title: string;
    description: string;
    location: string;
    remote: boolean;
    contractType: string;
    requiredSkills: string[];
    status: string;
    companyName: string;
  }) {
    if (!this.isReady()) return;
    await this.client!.index("jobs").addDocuments([job]);
  }

  async replaceTalents(docs: TalentDoc[]) {
    if (!this.isReady()) return false;
    const index = this.client!.index("talents");
    const cleared = await index.deleteAllDocuments();
    const last = docs.length ? await index.addDocuments(docs) : cleared;
    // Tasks run in order: waiting for the last one means the index is ready to search.
    await this.client!.tasks.waitForTask(last.taskUid, { timeout: 8000 });
    return true;
  }

  async indexTalent(doc: TalentDoc) {
    if (!this.isReady()) return;
    await this.client!.index("talents").addDocuments([doc]);
  }

  async removeTalent(id: string) {
    if (!this.isReady()) return;
    await this.client!.index("talents").deleteDocument(id);
  }

  async searchTalents(
    query: string,
    options: { skills?: string[]; location?: string; minYears?: number; maxYears?: number; limit?: number; offset?: number },
  ) {
    if (!this.isReady()) return null;
    const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const filter: string[] = [];
    for (const skill of options.skills ?? []) filter.push(`skills = ${quote(skill)}`);
    if (options.location) filter.push(`location = ${quote(options.location)}`);
    if (options.minYears != null) filter.push(`experienceYears >= ${Number(options.minYears)}`);
    if (options.maxYears != null) filter.push(`experienceYears <= ${Number(options.maxYears)}`);

    const result = await this.client!.index("talents").search(query, {
      limit: options.limit ?? 30,
      offset: options.offset ?? 0,
      filter: filter.length ? filter : undefined,
      facets: ["skills", "location"],
      attributesToHighlight: ["headline", "skills"],
      highlightPreTag: "\u27e6",
      highlightPostTag: "\u27e7",
      showRankingScore: true,
    });
    return result;
  }

  async searchJobs(query: string, limit = 20) {
    if (!this.isReady() || !query.trim()) return null;
    const result = await this.client!.index("jobs").search(query, {
      limit,
      filter: 'status = "PUBLISHED"',
    });
    return result.hits as { id: string }[];
  }
}

@Global()
@Module({
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
