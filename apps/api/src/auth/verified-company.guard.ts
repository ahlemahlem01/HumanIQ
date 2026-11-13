import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

/**
 * Candidate data (CV library, talent pool, contact details, first contact) is only open to recruiters whose
 * company has been verified by an admin. Admins pass. Put it AFTER JwtAuthGuard (it reads request.user).
 */
@Injectable()
export class VerifiedCompanyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<{
      user?: { role?: string; recruiter?: { company?: { verifiedAt?: Date | null } } | null };
    }>().user;
    if (user?.role === "ADMIN") return true;
    if (user?.role === "RECRUITER" && !user.recruiter?.company?.verifiedAt) {
      throw new ForbiddenException(
        "Votre entreprise est en cours de vérification. L'accès aux données des candidats sera ouvert dès sa validation.",
      );
    }
    return true;
  }
}
