import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@prisma/client";
import { ALLOW_PENDING_KEY, ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (!roles?.length) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!roles.includes(user?.role)) return false;
    // A recruiter waiting for the owner of the company to accept the join request has no access yet.
    const status = user?.recruiter?.memberStatus;
    if (user?.role === "RECRUITER" && (status === "PENDING" || status === "REJECTED") && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_KEY, targets)) {
      throw new ForbiddenException(
        status === "PENDING"
          ? "Votre demande d'accès est en attente : le responsable de l'entreprise doit l'accepter."
          : "Votre demande d'accès a été refusée par le responsable de l'entreprise.",
      );
    }
    return true;
  }
}
