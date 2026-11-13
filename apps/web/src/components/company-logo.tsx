import { mediaUrl } from "@/lib/api";

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** The company logo when there is one, otherwise its initials. `className` sets the size and shape of the box. */
export function CompanyLogo({
  company,
  className = "h-12 w-12 rounded-lg text-sm",
}: {
  company: { name: string; logoUrl?: string | null };
  className?: string;
}) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden border border-line bg-white font-bold text-forest ${className}`}>
      {company.logoUrl ? <img src={mediaUrl(company.logoUrl)} alt="" className="h-full w-full object-contain" /> : initials(company.name)}
    </span>
  );
}
