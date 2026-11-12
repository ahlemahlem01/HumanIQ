/** Imported (sourced) profiles have no account and did not sign up: say so, in muted text. */
export function isSourced(source: string | null | undefined) {
  return source === "LINKEDIN" || source === "PASTE";
}

export function SourcedNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-5 text-sage ${className}`}>
      Profil importé à votre initiative. Cette personne n&apos;a pas de compte HumanIQ et n&apos;a pas été informée : prévenez-la
      lors du premier contact et supprimez ses données sur simple demande (RGPD).
    </p>
  );
}
