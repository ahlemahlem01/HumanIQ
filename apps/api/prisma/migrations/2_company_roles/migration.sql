-- Company owners / members, join requests, and domain ownership (DNS) for automatic verification.
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'PENDING');

ALTER TABLE "RecruiterProfile"
  ADD COLUMN "memberRole" "MemberRole" NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN "memberStatus" "MemberStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "Company"
  ADD COLUMN "domain" TEXT,
  ADD COLUMN "domainToken" TEXT,
  ADD COLUMN "domainVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");

-- Existing companies: the oldest recruiter of each company becomes its owner.
UPDATE "RecruiterProfile" SET "memberRole" = 'OWNER' WHERE id IN (
  SELECT DISTINCT ON (rp."companyId") rp.id
  FROM "RecruiterProfile" rp JOIN "User" u ON u.id = rp."userId"
  ORDER BY rp."companyId", u."createdAt" ASC
);
