"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, FormEvent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { api } from "@/lib/api";
import { homeFor, useAuth, type Role } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: IconName };

const PRIMARY: Record<Role, NavItem[]> = {
  CANDIDATE: [
    { href: "/candidat", label: "Accueil", icon: "home" },
    { href: "/candidat/emplois", label: "Emplois", icon: "brief" },
    { href: "/candidat/messages", label: "Messages", icon: "mail" },
    { href: "/candidat/profil", label: "Profil", icon: "user" },
    { href: "/candidat/cv", label: "CV", icon: "file" },
    { href: "/candidat/ats", label: "ATS", icon: "scan" },
    { href: "/candidat/cv-builder", label: "Créer", icon: "pen" },
    { href: "/candidat/entretien", label: "Entretien", icon: "chat" },
    { href: "/candidat/competences", label: "Écarts", icon: "chart" },
    { href: "/candidat/salaire", label: "Salaire", icon: "coin" },
    { href: "/candidat/visibilite", label: "Visibilité", icon: "eye" },
  ],
  RECRUITER: [
    { href: "/recruteur", label: "Accueil", icon: "home" },
    { href: "/recruteur/messages", label: "Messages", icon: "mail" },
    { href: "/recruteur/profil", label: "Profil", icon: "user" },
    { href: "/recruteur/offres", label: "Offres", icon: "brief" },
    { href: "/recruteur/sourcing", label: "Vivier", icon: "search" },
    { href: "/recruteur/cvtheque", label: "CVthèque", icon: "file" },
    { href: "/recruteur/equipe", label: "Équipe", icon: "users" },
  ],
  ADMIN: [
    { href: "/admin", label: "Stats", icon: "chart" },
    { href: "/admin/entreprises", label: "Entreprises", icon: "users" },
    { href: "/admin/annonces", label: "Annonces", icon: "brief" },
    { href: "/admin/conformite", label: "RGPD", icon: "shield" },
  ],
};

const PLACEHOLDER: Record<Role, string> = {
  CANDIDATE: "Rechercher une publication, une personne ou un emploi",
  RECRUITER: "Rechercher un CV",
  ADMIN: "Rechercher",
};

type ShellSearch = { query: string; setQuery: (value: string) => void };

const ShellSearchContext = createContext<ShellSearch>({ query: "", setQuery: () => undefined });

export function useShellSearch() {
  return useContext(ShellSearchContext);
}

export function AppShell({
  role,
  title,
  plain = false,
  children,
}: {
  role: Role;
  title?: string;
  plain?: boolean;
  children: React.ReactNode;
}) {
  const { user, loading, logout, token } = useAuth();
  const [unread, setUnread] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQueryState] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  // The menu is "open" only on the page where it was opened, so it closes by itself when the route changes.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const setMenuOpen = (open: boolean | ((current: boolean) => boolean)) =>
    setMenuPath((current) => ((typeof open === "function" ? open(current === pathname) : open) ? pathname : null));
  const searchRef = useRef<HTMLInputElement>(null);

  const setQuery = useCallback((value: string) => setQueryState(value), []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== role) router.replace(homeFor(user.role));
  }, [loading, user, role, router]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    if (q) {
      setQueryState(q);
      setSearchOpen(true);
    }
  }, [pathname]);

  // Unread messages: poll lightly, and refresh at once when the messages page reports a change.
  useEffect(() => {
    if (!token || !user || user.role !== role || role === "ADMIN") return;
    let alive = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      api<{ count: number }>("/messages/unread", { token })
        .then((result) => {
          if (alive) setUnread(result.count);
        })
        .catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, 20000);
    window.addEventListener("humaniq:messages", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("humaniq:messages", refresh);
    };
  }, [token, user, role]);

  if (loading || !user || user.role !== role) {
    return <div className="p-10 text-sm text-forest/70">Chargement de l'espace…</div>;
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (role === "CANDIDATE" && pathname !== "/candidat/emplois") {
      router.push(`/candidat/emplois?q=${encodeURIComponent(q)}`);
    }
    if (role === "RECRUITER" && pathname !== "/recruteur/sourcing" && pathname !== "/recruteur/imports" && !pathname.startsWith("/recruteur/cvtheque")) {
      router.push(`/recruteur/cvtheque?q=${encodeURIComponent(q)}`);
    }
  }

  const initial = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const profileHref = role === "RECRUITER" ? "/recruteur/profil" : role === "ADMIN" ? "/admin" : "/candidat/profil";

  function openSearch() {
    setSearchOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  return (
    <ShellSearchContext.Provider value={{ query, setQuery }}>
      <div className="app-shell flex min-h-screen flex-col bg-[#0e2358] md:flex-row">
        <div className="sticky top-0 z-40 flex h-14 items-center gap-2 px-3 md:hidden print:hidden">
          <Link href="/" aria-label="HumanIQ" className="shrink-0 rounded-full">
            <Logo size={36} />
          </Link>
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Rechercher"
            onClick={() => {
              setMenuOpen(false);
              openSearch();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 active:scale-95 active:bg-white/10"
          >
            <Icon name="search" className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-white/90 active:scale-95 active:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d={menuOpen ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} />
            </svg>
            {unread > 0 && !menuOpen ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#ff4d4f] ring-2 ring-[#0e2358]" /> : null}
          </button>
        </div>

        {menuOpen ? (
          <div className="fixed inset-x-0 bottom-0 top-14 z-30 overflow-y-auto bg-[#0e2358] px-3 pb-8 pt-2 md:hidden print:hidden" role="dialog" aria-label="Menu">
            <Link
              href={profileHref}
              className="mb-3 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 text-white"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xs font-semibold ring-1 ring-white/30">{initial}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block text-xs text-white/70">Voir mon profil</span>
              </span>
            </Link>
            <nav className="grid grid-cols-3 gap-2">
              {PRIMARY[role].map((item) => (
                <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} badge={item.icon === "mail" ? unread : 0} large />
              ))}
            </nav>
            <button
              type="button"
              onClick={() => {
                logout();
                router.push("/");
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 py-3 text-sm font-medium text-white/90 active:scale-[0.98]"
            >
              <Icon name="logout" className="h-4 w-4" />
              Se déconnecter
            </button>
          </div>
        ) : null}

        <aside className="sticky top-0 z-30 hidden h-screen w-[84px] shrink-0 flex-col md:flex print:hidden">
          <Link
            href="/"
            aria-label="HumanIQ"
            className="mx-auto mt-4 block rounded-full transition duration-300 ease-out hover:-rotate-6 hover:scale-110 hover:drop-shadow-[0_0_12px_rgba(0,136,255,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
          >
            <Logo size={52} />
          </Link>
          <nav className="mt-4 flex min-h-0 flex-1 flex-col justify-evenly overflow-hidden px-2">
            <button type="button" onClick={openSearch} className={railClass(searchOpen)}>
              <Icon name="search" className={RAIL_ICON} />
              <span>Recherche</span>
            </button>
            {PRIMARY[role].map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} badge={item.icon === "mail" ? unread : 0} />
            ))}
          </nav>
          <button
            type="button"
            onClick={() => {
              logout();
              router.push("/");
            }}
            className={`mx-2 mb-3 w-auto ${railClass(false)}`}
          >
            <Icon name="logout" className={`${RAIL_ICON} group-hover:translate-x-0.5 group-hover:translate-y-0`} />
            <span>Sortir</span>
          </button>
        </aside>

        <div className="min-h-[calc(100vh-3.5rem)] min-w-0 flex-1 overflow-clip rounded-t-2xl bg-white md:my-2 md:mr-2 md:min-h-[calc(100vh-1rem)] md:rounded-2xl print:m-0 print:rounded-none">
          {searchOpen ? (
            <header className="sticky top-14 z-20 border-b md:top-0 border-line bg-cream print:hidden">
              <form onSubmit={onSearch} className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 md:px-8">
                <label className="relative block w-full max-w-md">
                  <span className="sr-only">Rechercher</span>
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sage" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={PLACEHOLDER[role]}
                    className="w-full rounded-full border border-line bg-paper py-2 pl-9 pr-3 text-sm outline-none ring-forest focus:ring-2 focus:border-forest"
                  />
                </label>
              </form>
            </header>
          ) : null}
          <main className={plain ? "page-in mx-auto max-w-[1400px] px-4 py-6 md:px-8 print:p-0" : "page-in mx-auto max-w-[1400px] px-5 py-8 md:px-10 print:p-0"}>
            {title ? <h1 className="serif text-3xl md:text-4xl">{title}</h1> : null}
            <div className={title ? "mt-8" : ""}>{children}</div>
          </main>
        </div>
      </div>
    </ShellSearchContext.Provider>
  );
}

const RAIL_ICON =
  "h-4 w-4 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-125 group-active:scale-90";

function railClass(active: boolean) {
  return `group relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-center text-[11px] leading-none transition-colors duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
    active
      ? "rail-active bg-white/15 font-semibold text-white"
      : "text-white/70 hover:bg-white/10 hover:text-white"
  }`;
}

function NavLink({ item, active, badge = 0, large = false }: { item: NavItem; active: boolean; badge?: number; large?: boolean }) {
  return (
    <Link href={item.href} className={large ? `${railClass(active)} !gap-2 !rounded-2xl !py-4 !text-xs ${active ? "" : "bg-white/5"}` : railClass(active)}>
      <Icon name={item.icon} className={RAIL_ICON} />
      <span>{item.label}</span>
      {badge > 0 ? (
        <span
          className="absolute right-1.5 top-0.5 flex h-4 min-w-4 animate-[badgePop_0.35s_ease-out] items-center justify-center rounded-full bg-[#ff4d4f] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0e2358]"
          aria-label={`${badge} message${badge > 1 ? "s" : ""} non lu${badge > 1 ? "s" : ""}`}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

type IconName = "home" | "user" | "file" | "scan" | "pen" | "chat" | "check" | "chart" | "coin" | "eye" | "brief" | "search" | "shield" | "logout" | "users" | "mail";

function isActive(pathname: string, href: string) {
  if (href === "/candidat" || href === "/recruteur" || href === "/admin" || href === "/offres") return pathname === href;
  // "Mes imports" is the second tab of the Vivier area.
  if (href === "/recruteur/sourcing" && pathname === "/recruteur/imports") return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, string> = {
    home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z",
    user: "M12 12a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 12 12Zm-7 8a7 7 0 0 1 14 0",
    file: "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 1.5V9h4.5",
    scan: "M8 4H5v3M16 4h3v3M8 20H5v-3M16 20h3v-3M8 12h8",
    pen: "M4 20h4l10-10-4-4L4 16v4Zm9-13 4 4",
    chat: "M5 6h14v9H8l-3 3V6Z",
    check: "M8 12.5 10.5 15 16 9M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    chart: "M5 19V10M12 19V5M19 19v-7",
    coin: "M12 6c4 0 7 1.3 7 3s-3 3-7 3-7-1.3-7-3 3-3 7-3Zm7 5c0 1.7-3 3-7 3s-7-1.3-7-3M19 14c0 1.7-3 3-7 3s-7-1.3-7-3",
    eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    brief: "M8 7V5h8v2M4 7h16v12H4V7Z",
    search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4 4",
    shield: "M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3Z",
    logout: "M10 7V5H5v14h5v-2M10 12h9M16 9l3 3-3 3",
    mail: "M4 6h16v12H4V6Zm0 1 8 6 8-6",
    users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M21 19a5 5 0 0 0-4-4.9",
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d={paths[name]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
