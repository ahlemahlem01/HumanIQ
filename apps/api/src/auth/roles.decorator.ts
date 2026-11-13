import { SetMetadata } from "@nestjs/common";
import { Role } from "@prisma/client";

export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const ALLOW_PENDING_KEY = "allowPendingMember";
/** A recruiter who asked to join a company (not accepted yet) may only call routes marked with this. */
export const AllowPending = () => SetMetadata(ALLOW_PENDING_KEY, true);
