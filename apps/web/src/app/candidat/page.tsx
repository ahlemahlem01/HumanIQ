"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, useShellSearch } from "@/components/app-shell";
import { BannerCarousel, type BannerSlide } from "@/components/banner-carousel";
import { api, mediaUrl, STAGE_LABEL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type FeedItem = {
  id: string;
  reason: "suivi" | "recommande" | "pub" | "vous";
  body: string;
  createdAt: string;
  likes: number;
  comments: number;
  reposts: number;
  liked: boolean;
  saved: boolean;
  reposted: boolean;
  author: { id: string; firstName: string; lastName: string; headline: string };
};

type JobLite = {
  id: string;
  title: string;
  location: string;
  remote: boolean;
  contractType?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string;
  requiredSkills?: string[];
  createdAt?: string;
  company: { name: string };
};

type Recommendation = { score?: number; semanticScore: number; job: { id: string } };
type ApplicationLite = { id: string; stage: string; job: { id: string; title: string; company: { name: string } } };

type Comment = { id: string; body: string; createdAt: string; author: string };

type Profile = {
  headline: string | null;
  avatarImage: string | null;
  coverImage: string | null;
  location: string | null;
  skills?: string[];
  experiences: { company: string; current: boolean }[];
  user: { firstName: string; lastName: string };
};

const REASON: Record<FeedItem["reason"], string> = {
  suivi: "Personne suivie",
  recommande: "Recommandé pour vous",
  pub: "Publicité",
  vous: "Vous",
};

// The content must sit INSIDE AppShell: useShellSearch() reads the search box of the shell's header.
export default function CandidateHome() {
  return (
    <AppShell role="CANDIDATE" plain>
      <CandidateHomeContent />
    </AppShell>
  );
}

function CandidateHomeContent() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [profileViews, setProfileViews] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  const [savedItems, setSavedItems] = useState<FeedItem[] | null>(null);
  const { query } = useShellSearch();
  const [openId, setOpenId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, Comment[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [jobs, setJobs] = useState<JobLite[] | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [applications, setApplications] = useState<ApplicationLite[]>([]);
  const [todoTests, setTodoTests] = useState(0);
  const [todoInterviews, setTodoInterviews] = useState(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) return;
    api<{ items: FeedItem[]; savedCount: number }>("/feed", { token })
      .then((feed) => {
        setItems(feed.items);
        setSavedCount(feed.savedCount ?? 0);
      })
      .catch(() => setItems([]));
    api<Profile>("/candidates/me", { token }).then(setProfile).catch(() => setProfile(null));
    api<{ count: number }[]>("/candidates/me/views", { token })
      .then((rows) => setProfileViews(rows.reduce((total, row) => total + row.count, 0)))
      .catch(() => setProfileViews(0));
  }, [token]);

  // Offers for the banner, and the small "to do" and applications cards on the right.
  useEffect(() => {
    if (!token) return;
    api<JobLite[]>("/jobs", { token }).then(setJobs).catch(() => setJobs([]));
    api<Recommendation[]>("/ai/recommendations", { token })
      .then((rows) => setScores(Object.fromEntries(rows.map((row) => [row.job.id, row.score ?? row.semanticScore]))))
      .catch(() => setScores({}));
    api<ApplicationLite[]>("/applications/mine", { token }).then(setApplications).catch(() => setApplications([]));
    api<{ status: string }[]>("/assessments/mine", { token })
      .then((rows) => setTodoTests(rows.filter((row) => row.status !== "COMPLETED").length))
      .catch(() => undefined);
    api<{ status: string }[]>("/interviews", { token })
      .then((rows) => setTodoInterviews(rows.filter((row) => row.status !== "COMPLETED").length))
      .catch(() => undefined);
    api<{ count: number }>("/messages/unread", { token }).then((result) => setUnread(result.count)).catch(() => undefined);
  }, [token]);

  const slides = useMemo<BannerSlide[]>(() => {
    const mine = new Set((profile?.skills ?? []).map((skill) => skill.toLowerCase()));
    const applied = new Set(applications.map((item) => item.job.id));
    return [...(jobs ?? [])]
      .filter((job) => !applied.has(job.id))
      .sort((a, b) => (scores[b.id] ?? -1) - (scores[a.id] ?? -1) || new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .slice(0, 5)
      .map((job) => {
        const score = scores[job.id];
        const have = (job.requiredSkills ?? []).filter((skill) => mine.has(skill.toLowerCase())).length;
        const total = job.requiredSkills?.length ?? 0;
        const details = [job.company.name, job.location + (job.remote ? " · Télétravail" : ""), job.contractType, salaryLine(job)].filter(Boolean).join(" · ");
        return {
          id: job.id,
          // A very low score is noise from the local similarity model: only show it when it means something.
          kicker: typeof score === "number" && score >= 25 ? `Recommandée pour vous · ${score} % de correspondance` : "Recommandée pour vous",
          title: job.title,
          body: total > 0 && mine.size > 0 ? `${details}. Vous avez ${have} compétence${have > 1 ? "s" : ""} sur ${total}.` : details,
          icon: "M8 7V5h8v2M4 7h16v12H4V7Z",
          primary: { label: "Voir l'offre", href: `/offres/${job.id}` },
          secondary: { label: "Toutes les offres", href: "/candidat/emplois" },
        };
      });
  }, [jobs, scores, profile, applications]);

  const todo = [
    todoTests > 0 ? { label: `${todoTests} test${todoTests > 1 ? "s" : ""} à passer`, href: "/candidat/tests" } : null,
    unread > 0 ? { label: `${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`, href: "/candidat/messages" } : null,
    todoInterviews > 0 ? { label: `${todoInterviews} entretien${todoInterviews > 1 ? "s" : ""} à reprendre`, href: "/candidat/entretien" } : null,
  ].filter((item): item is { label: string; href: string } => item !== null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source = showSaved ? (savedItems ?? []) : (items ?? []);
    return source.filter((item) => {
      if (showSaved && !item.saved) return false;
      if (!needle) return true;
      return `${item.author.firstName} ${item.author.lastName} ${item.author.headline} ${item.body}`.toLowerCase().includes(needle);
    });
  }, [items, query, savedItems, showSaved]);

  const name = profile ? `${profile.user.firstName} ${profile.user.lastName}` : user ? `${user.firstName} ${user.lastName}` : "";
  const company = profile?.experiences.find((item) => item.current)?.company ?? profile?.experiences[0]?.company;

  async function openSaved() {
    if (!token) return;
    if (showSaved) {
      setShowSaved(false);
      return;
    }
    setShowSaved(true);
    const result = await api<{ items: FeedItem[] }>("/feed/saved", { token });
    setSavedItems(result.items);
  }

  function applyStats(id: string, stats: Partial<FeedItem>) {
    const next = (current: FeedItem[] | null) => current?.map((item) => (item.id === id ? { ...item, ...stats } : item)) ?? null;
    setItems(next);
    setSavedItems(next);
  }

  async function act(id: string, action: "like" | "save" | "repost") {
    if (!token) return;
    setBusy(`${action}-${id}`);
    const wasSaved = items?.find((item) => item.id === id)?.saved;
    try {
      const stats = await api<Partial<FeedItem>>(`/feed/${id}/${action}`, { method: "POST", token });
      applyStats(id, stats);
      if (action === "save" && wasSaved !== stats.saved) setSavedCount((count) => count + (stats.saved ? 1 : -1));
    } finally {
      setBusy(null);
    }
  }

  async function openComments(id: string) {
    if (!token) return;
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (threads[id]) return;
    const rows = await api<Comment[]>(`/feed/${id}/comments`, { token });
    setThreads((current) => ({ ...current, [id]: rows }));
  }

  async function sendComment(id: string) {
    if (!token) return;
    const body = (drafts[id] ?? "").trim();
    if (!body) return;
    setBusy(`comment-${id}`);
    try {
      const result = await api<{
        comment: Comment;
        likes: number;
        comments: number;
        reposts: number;
        liked: boolean;
        saved: boolean;
        reposted: boolean;
      }>(`/feed/${id}/comments`, { method: "POST", token, body: { body } });
      setThreads((current) => ({ ...current, [id]: [...(current[id] ?? []), result.comment] }));
      setDrafts((current) => ({ ...current, [id]: "" }));
      applyStats(id, result);
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!token) return;
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const created = await api<FeedItem>("/feed", { method: "POST", token, body: { body } });
      setItems((current) => [created, ...(current ?? [])]);
      setDraft("");
      setComposing(false);
    } finally {
      setPosting(false);
    }
  }

  const completion = profile
    ? Math.round(
        ([
          Boolean(profile.headline),
          Boolean(profile.location),
          profile.experiences.length > 0,
        ].filter(Boolean).length /
          3) *
          100,
      )
    : 0;

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Recommended offers, same banner as the recruiter home */}
      {jobs === null ? (
        <div className="mb-5 h-40 animate-pulse rounded-2xl bg-paper" aria-hidden />
      ) : slides.length > 0 ? (
        <div className="mb-5">
          <BannerCarousel slides={slides} compact interval={7000} label="Offres recommandées" />
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_300px]">
        {/* Left column */}
        {/* Side columns stay in place while the feed scrolls (sticky; scrolls on its own if taller than the screen) */}
        <aside className="hidden space-y-3 lg:sticky lg:top-16 lg:block lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          <section className="overflow-hidden rounded-2xl border border-line bg-cream">
            <div className="h-16 bg-forest">
              {profile?.coverImage ? (
                <img src={mediaUrl(`/uploads/covers/${profile.coverImage}`)} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="px-4 pb-4 text-center">
              <Link
                href="/candidat/profil"
                className="-mt-8 mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-forest text-base font-semibold text-white"
              >
                {profile?.avatarImage ? (
                  <img src={mediaUrl(`/uploads/avatars/${profile.avatarImage}`)} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(name)
                )}
              </Link>
              <Link href="/candidat/profil" className="mt-2 block text-base font-semibold leading-tight hover:underline">
                {name}
              </Link>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-sage">{profile?.headline || "Ajoutez un titre"}</p>
              {profile?.location ? <p className="mt-1 text-xs text-sage">{profile.location}</p> : null}
              {company ? <p className="mt-1 text-xs font-medium">{company}</p> : null}
            </div>
            <div className="border-t border-line px-4 py-3 text-xs">
              <Link href="/candidat/visibilite" className="flex items-center justify-between gap-3 hover:text-forest">
                <span className="text-sage">Vues du profil</span>
                <span className="font-semibold text-forest">{profileViews}</span>
              </Link>
              <button type="button" onClick={() => void openSaved()} className="mt-2 flex w-full items-center justify-between gap-3 text-left hover:text-forest">
                <span className="text-sage">Publications enregistrées</span>
                <span className="font-semibold text-forest">{savedCount}</span>
              </button>
            </div>
            {completion < 100 ? (
              <Link href="/candidat/profil" className="block border-t border-line px-4 py-3 text-xs hover:bg-paper">
                <span className="flex items-center justify-between">
                  <span className="font-semibold">Force du profil</span>
                  <span className="text-forest">{completion}%</span>
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-paper">
                  <span className="block h-full rounded-full bg-forest" style={{ width: `${completion}%` }} />
                </span>
              </Link>
            ) : null}
          </section>

          <section className="rounded-2xl border border-line bg-cream p-2 text-sm">
            <RailLink icon="save" onClick={() => void openSaved()} active={showSaved}>
              Éléments enregistrés
            </RailLink>
            <RailLink href="/candidat/visibilite" icon="eye">
              Visibilité
            </RailLink>
            <RailLink href="/candidat/cv" icon="file">
              Mon CV
            </RailLink>
            <RailLink href="/candidat/emplois" icon="brief">
              Emplois
            </RailLink>
          </section>
        </aside>

        {/* Feed */}
        <div className="min-w-0">
          {todo.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2 xl:hidden" aria-label="À faire">
              {todo.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-medium hover:border-forest hover:text-forest">
                  {item.label} →
                </Link>
              ))}
            </div>
          ) : null}
          <section className="rounded-2xl border border-line bg-cream p-4">
            <div className="flex items-center gap-3">
              <Link
                href="/candidat/profil"
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest text-sm font-semibold text-white"
              >
                {profile?.avatarImage ? (
                  <img src={mediaUrl(`/uploads/avatars/${profile.avatarImage}`)} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(name)
                )}
              </Link>
              {composing ? (
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={1500}
                  rows={4}
                  placeholder="De quoi voulez-vous parler ?"
                  className="min-w-0 flex-1 resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="h-12 min-w-0 flex-1 rounded-full border border-line px-5 text-left text-sm font-medium text-sage hover:bg-paper"
                >
                  Commencer une publication
                </button>
              )}
            </div>
            {composing ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-sage">{draft.length} / 1500</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(false);
                      setDraft("");
                    }}
                    className="rounded-full px-4 py-2 text-sm font-semibold text-sage hover:bg-paper"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => void publish()}
                    disabled={posting || !draft.trim()}
                    className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {posting ? "Publication…" : "Publier"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-1 text-sm font-medium text-sage">
                {[
                  ["Rédiger un article", "M4 6h16M4 12h16M4 18h10"],
                  ["Partager une réussite", "M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8L12 3z"],
                  ["Chercher un emploi", "M8 7V5h8v2M4 7h16v12H4V7Z"],
                ].map(([label, icon], index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => (index === 2 ? (window.location.href = "/candidat/emplois") : setComposing(true))}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 hover:bg-paper"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-forest" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d={icon} />
                    </svg>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="my-4 flex items-center gap-3 text-xs text-sage">
            <hr className="flex-1 border-line" />
            <span>
              {showSaved ? "Publications enregistrées" : "Trier par : "}
              {showSaved ? null : <span className="font-semibold text-ink">Pertinence</span>}
            </span>
          </div>

          {query.trim() ? (
            <Link href={`/candidat/emplois?q=${encodeURIComponent(query.trim())}`} className="mb-3 inline-block text-xs font-semibold text-forest">
              Voir les emplois pour « {query.trim()} »
            </Link>
          ) : null}
          <ul className="space-y-3">
            {(showSaved ? savedItems : items) === null ? <li className="text-sm text-sage">Chargement du fil…</li> : null}
            {(showSaved ? savedItems : items) && visible.length === 0 ? (
              <li className="rounded-2xl border border-line bg-cream px-4 py-6 text-sm text-sage">
                {showSaved ? "Aucune publication enregistrée." : query.trim() ? "Aucune publication pour cette recherche." : "Aucune publication pour le moment."}
              </li>
            ) : null}
            {visible.map((item) => (
              <li key={item.id} className={`rounded-2xl border bg-cream ${item.reason === "pub" ? "border-forest/30" : "border-line"}`}>
                <div className="flex items-start gap-3 px-4 pt-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-semibold text-white">
                    {initials(`${item.author.firstName} ${item.author.lastName}`)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {item.author.firstName} {item.author.lastName}
                    </p>
                    <p className="truncate text-xs text-sage">{item.author.headline}</p>
                    <p className="text-xs text-sage">
                      {REASON[item.reason]} · {postedAgo(item.createdAt)}
                    </p>
                  </div>
                  <span className="select-none px-1 text-lg leading-none text-sage" aria-hidden>
                    ···
                  </span>
                </div>
                <p className="whitespace-pre-wrap px-4 pt-3 text-sm leading-6">{item.body}</p>
                {item.reason === "pub" ? (
                  <div className="px-4 pt-3">
                    <Link href="/candidat/emplois" className="inline-block rounded-full border border-forest px-4 py-1.5 text-xs font-semibold text-forest hover:bg-tint">
                      Voir les emplois
                    </Link>
                  </div>
                ) : null}
                {item.likes + item.comments + item.reposts > 0 ? (
                  <div className="mt-3 flex items-center justify-between px-4 text-xs text-sage">
                    <span>{item.likes > 0 ? `${item.likes} j'aime` : ""}</span>
                    <span>
                      {[
                        item.comments > 0 ? `${item.comments} commentaire${item.comments > 1 ? "s" : ""}` : "",
                        item.reposts > 0 ? `${item.reposts} republication${item.reposts > 1 ? "s" : ""}` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                ) : null}
                <div className="mx-2 mb-1 mt-2 flex border-t border-line pt-1">
                  <Action icon="like" on={item.liked} disabled={busy === `like-${item.id}`} onClick={() => act(item.id, "like")}>
                    J'aime
                  </Action>
                  <Action icon="comment" on={openId === item.id} onClick={() => openComments(item.id)}>
                    Commenter
                  </Action>
                  <Action icon="repost" on={item.reposted} disabled={busy === `repost-${item.id}`} onClick={() => act(item.id, "repost")}>
                    Republier
                  </Action>
                  <Action icon="save" on={item.saved} disabled={busy === `save-${item.id}`} onClick={() => act(item.id, "save")}>
                    Enregistrer
                  </Action>
                </div>
                {openId === item.id ? (
                  <div className="border-t border-line px-4 py-3">
                    <ul className="space-y-3">
                      {(threads[item.id] ?? []).map((comment) => (
                        <li key={comment.id} className="flex gap-2 text-sm">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint text-[11px] font-semibold text-forest">
                            {initials(comment.author)}
                          </span>
                          <div className="rounded-xl bg-paper px-3 py-2">
                            <p>
                              <span className="font-semibold">{comment.author}</span>
                              <span className="text-xs text-sage"> · {postedAgo(comment.createdAt)}</span>
                            </p>
                            <p>{comment.body}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <form
                      className="mt-3 flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void sendComment(item.id);
                      }}
                    >
                      <input
                        value={drafts[item.id] ?? ""}
                        onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="Ajouter un commentaire…"
                        className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                      />
                      <button disabled={busy === `comment-${item.id}`} className="rounded-full bg-forest px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                        Publier
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {/* Right column */}
        <aside className="hidden space-y-3 xl:sticky xl:top-16 xl:block xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto">
          {todo.length > 0 ? (
            <section className="rounded-2xl border border-line bg-cream p-4">
              <h2 className="text-sm font-semibold">À faire</h2>
              <ul className="mt-2 space-y-0.5">
                {todo.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper">
                      {item.label}
                      <span aria-hidden className="text-forest">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl border border-line bg-cream p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Mes candidatures</h2>
              {applications.length > 0 ? (
                <Link href="/candidat/emplois?tab=applied" className="text-xs font-semibold text-forest hover:underline">
                  Voir tout
                </Link>
              ) : null}
            </div>
            {applications.length === 0 ? (
              <p className="mt-2 text-xs leading-5 text-sage">Vous n&apos;avez pas encore postulé. Vos candidatures apparaîtront ici.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {applications.slice(0, 3).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.job.title}</span>
                      <span className="block truncate text-xs text-sage">{item.job.company.name}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-tint px-2.5 py-0.5 text-xs font-semibold text-forest">{STAGE_LABEL[item.stage] ?? item.stage}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="px-2 text-center text-[11px] leading-4 text-sage">
            HumanIQ © 2026 · Conforme RGPD et INPDP
          </p>
        </aside>
      </div>
    </div>
  );
}

function salaryLine(job: JobLite) {
  if (!job.salaryMin) return "";
  const max = job.salaryMax ?? job.salaryMin;
  if (job.currency === "TND") return `${Math.round(job.salaryMin / 12).toLocaleString("fr-FR")}–${Math.round(max / 12).toLocaleString("fr-FR")} DT / mois`;
  return `${job.salaryMin.toLocaleString("fr-FR")}–${max.toLocaleString("fr-FR")} € / an`;
}

function RailLink({
  href,
  icon,
  active,
  onClick,
  children,
}: {
  href?: string;
  icon: "save" | "eye" | "file" | "brief";
  active?: boolean;
  onClick?: () => void;
  children: string;
}) {
  const className = `flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${active ? "bg-paper font-semibold" : "hover:bg-paper"}`;
  const body = (
    <>
      <RailIcon name={icon} />
      <span>{children}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function RailIcon({ name }: { name: "save" | "eye" | "file" | "brief" }) {
  const paths = {
    save: "M7 4h10a1 1 0 0 1 1 1v15l-6-3.2L6 20V5a1 1 0 0 1 1-1Z",
    eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    file: "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
    brief: "M8 7V5h8v2M4 7h16v12H4V7Z",
  };
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-forest" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d={paths[name]} strokeLinejoin="round" />
    </svg>
  );
}

function Action({
  icon,
  on,
  count = 0,
  disabled,
  onClick,
  children,
}: {
  icon: "like" | "comment" | "save" | "repost";
  on?: boolean;
  count?: number;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={children}
      title={children}
      className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-1 py-2.5 text-sm font-medium disabled:opacity-50 ${
        on ? "text-forest" : "text-sage hover:bg-paper hover:text-forest"
      }`}
    >
      <ActionIcon name={icon} on={!!on} />
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

function ActionIcon({ name, on }: { name: "like" | "comment" | "save" | "repost"; on: boolean }) {
  const common = { viewBox: "0 0 24 24", className: "h-4 w-4", "aria-hidden": true } as const;
  if (name === "like") {
    return (
      <svg {...common} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
      </svg>
    );
  }
  if (name === "comment") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  if (name === "save") {
    return (
      <svg {...common} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function postedAgo(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}
