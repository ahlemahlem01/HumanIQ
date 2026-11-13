-- Companies must be verified by an admin before their recruiters can reach candidate data.
ALTER TABLE "Company" ADD COLUMN "verifiedAt" TIMESTAMP(3);
-- Companies that already exist are considered verified (they were created before this rule).
UPDATE "Company" SET "verifiedAt" = NOW();
