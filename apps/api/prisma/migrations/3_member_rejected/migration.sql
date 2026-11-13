-- A refused join request keeps the account (and its history) instead of deleting it.
ALTER TYPE "MemberStatus" ADD VALUE 'REJECTED';
