"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth, type Role } from "@/lib/auth";

type Conversation = {
  id: string;
  counterpart: { name: string; subtitle: string; candidateId: string | null };
  job: { id: string; title: string } | null;
  unread: number;
  updatedAt: string;
  lastMessage: { body: string; createdAt: string; mine: boolean } | null;
};

type Message = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  sender: { name: string; role: string };
};

type Thread = {
  id: string;
  counterpart: { name: string; subtitle: string; candidateId: string | null; location: string | null };
  job: { id: string; title: string } | null;
  messages: Message[];
};

type Prospect = {
  id: string;
  name: string;
  headline: string | null;
  location: string | null;
  canContact: boolean;
  conversationId: string | null;
};

const MAX = 4000;

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function shortTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return "Hier";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/** Tells the sidebar badge to refresh right away. */
function notifyChanged() {
  window.dispatchEvent(new Event("humaniq:messages"));
}

export function MessagesView({ role }: { role: Role }) {
  const { token } = useAuth();
  const params = useSearchParams();
  const prospectId = params.get("candidate");
  const jobParam = params.get("job");

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [mobileThread, setMobileThread] = useState(false);
  const [search, setSearch] = useState("");
  const [emailPref, setEmailPref] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const loadList = useCallback(async () => {
    if (!token) return;
    setConversations(await api<Conversation[]>("/messages/conversations", { token }));
  }, [token]);

  const loadThread = useCallback(
    async (id: string) => {
      if (!token) return;
      setThread(await api<Thread>(`/messages/conversations/${id}`, { token }));
      notifyChanged();
    },
    [token],
  );

  useEffect(() => {
    loadList().catch(() => setConversations([]));
  }, [loadList]);

  useEffect(() => {
    if (!token) return;
    api<{ emailNotifications: boolean }>("/messages/preferences", { token })
      .then((prefs) => setEmailPref(prefs.emailNotifications))
      .catch(() => setEmailPref(null));
  }, [token]);

  async function toggleEmails() {
    if (!token || emailPref === null) return;
    const next = !emailPref;
    setEmailPref(next); // optimistic
    try {
      await api("/messages/preferences", { method: "PATCH", token, body: { emailNotifications: next } });
    } catch {
      setEmailPref(!next);
      setError("Préférence non enregistrée.");
    }
  }

  // A recruiter arriving from a candidate card: open the existing thread, or prepare a first message.
  useEffect(() => {
    if (!token || role !== "RECRUITER" || !prospectId) return;
    api<Prospect>(`/messages/prospect/${prospectId}`, { token })
      .then((found) => {
        setProspect(found);
        if (found.conversationId) {
          setActiveId(found.conversationId);
          setProspect(null);
        } else {
          setActiveId(null);
        }
        setMobileThread(true);
      })
      .catch(() => setError("Ce candidat est introuvable."));
  }, [token, role, prospectId]);

  useEffect(() => {
    if (!activeId) {
      setThread(null);
      return;
    }
    lastCount.current = 0;
    loadThread(activeId)
      .then(() => loadList())
      .catch(() => setError("Conversation indisponible."));
  }, [activeId, loadThread, loadList]);

  // Light polling while the tab is visible: new messages show up without a reload.
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadList().catch(() => undefined);
      if (activeId) loadThread(activeId).catch(() => undefined);
    }, 6000);
    return () => clearInterval(timer);
  }, [token, activeId, loadList, loadThread]);

  useEffect(() => {
    const count = thread?.messages.length ?? 0;
    if (count !== lastCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: lastCount.current === 0 ? "auto" : "smooth", block: "end" });
      lastCount.current = count;
    }
  }, [thread]);

  async function send() {
    if (!token) return;
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      if (activeId) {
        await api(`/messages/conversations/${activeId}`, { method: "POST", token, body: { body } });
        setDraft("");
        await loadThread(activeId);
        await loadList();
      } else if (prospect) {
        const created = await api<Thread>("/messages/start", {
          method: "POST",
          token,
          body: { candidateId: prospect.id, jobId: jobParam || undefined, body },
        });
        setDraft("");
        setProspect(null);
        setActiveId(created.id);
        await loadList();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setSending(false);
    }
  }

  const needle = search.trim().toLowerCase();
  const shown = (conversations ?? []).filter(
    (c) => !needle || `${c.counterpart.name} ${c.counterpart.subtitle} ${c.job?.title ?? ""} ${c.lastMessage?.body ?? ""}`.toLowerCase().includes(needle),
  );
  const showingThread = Boolean(activeId || prospect);
  const title = thread?.counterpart.name ?? prospect?.name ?? "";
  const subtitle = thread?.counterpart.subtitle ?? prospect?.headline ?? "";

  let lastDay = "";

  return (
    <AppShell role={role} plain>
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          {emailPref !== null ? (
            <div className="flex items-center gap-3 rounded-full border border-line bg-white py-1.5 pl-4 pr-2 text-sm">
              <span id="email-pref-label" className="text-sage">
                Notifications par e-mail
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={emailPref}
                aria-labelledby="email-pref-label"
                onClick={() => void toggleEmails()}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 ${
                  emailPref ? "bg-forest" : "bg-line"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
                    emailPref ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid h-[calc(100vh-9rem)] min-h-[460px] overflow-hidden rounded-3xl border border-line bg-white shadow-sm lg:grid-cols-[330px_minmax(0,1fr)]">
          {/* Conversations */}
          <aside className={`min-h-0 flex-col border-line lg:flex lg:border-r ${mobileThread && showingThread ? "hidden" : "flex"}`}>
            <div className="px-4 pb-2 pt-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-base font-semibold">Conversations</span>
                {conversations && conversations.length > 0 ? <span className="text-xs text-sage">{conversations.length}</span> : null}
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher"
                aria-label="Rechercher une conversation"
                className="w-full rounded-full bg-paper px-4 py-2 text-sm outline-none placeholder:text-sage/70 focus:bg-white focus:ring-2 focus:ring-forest/20"
              />
            </div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
              {conversations === null ? <li className="p-5 text-sm text-sage">Chargement…</li> : null}
              {conversations && conversations.length === 0 ? (
                <li className="p-6 text-sm leading-6 text-sage">
                  {role === "RECRUITER"
                    ? "Aucune conversation. Écrivez à un candidat depuis le vivier, la CVthèque ou le dossier d'une candidature."
                    : "Aucun message pour l'instant. Les recruteurs qui vous contactent apparaîtront ici."}
                </li>
              ) : null}
              {conversations && conversations.length > 0 && shown.length === 0 ? (
                <li className="p-5 text-center text-sm text-sage">Aucune conversation trouvée.</li>
              ) : null}
              {shown.map((conversation) => {
                const active = conversation.id === activeId;
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(conversation.id);
                        setProspect(null);
                        setMobileThread(true);
                        setError("");
                      }}
                      className={`flex w-full gap-3 rounded-2xl px-3 py-3 text-left transition ${
                        active ? "bg-tint" : "hover:bg-paper"
                      }`}
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                          conversation.unread ? "bg-forest text-white" : "bg-tint text-forest"
                        }`}
                      >
                        {initials(conversation.counterpart.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm ${conversation.unread ? "font-bold" : "font-semibold"}`}>
                            {conversation.counterpart.name}
                          </span>
                          {conversation.lastMessage ? (
                            <span className="shrink-0 text-xs text-sage">{shortTime(conversation.lastMessage.createdAt)}</span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-sage">
                          {conversation.job ? conversation.job.title : conversation.counterpart.subtitle}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-sm ${conversation.unread ? "font-semibold text-ink" : "text-sage"}`}>
                            {conversation.lastMessage ? `${conversation.lastMessage.mine ? "Vous : " : ""}${conversation.lastMessage.body}` : "—"}
                          </span>
                          {conversation.unread > 0 ? (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-forest px-1.5 text-[11px] font-bold text-white">
                              {conversation.unread}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Thread */}
          <section className={`min-h-0 min-w-0 flex-col lg:flex ${mobileThread && showingThread ? "flex" : "hidden"}`}>
            {!showingThread ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-tint text-forest">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h16v12H4V6Zm0 1 8 6 8-6" />
                  </svg>
                </span>
                <p className="text-lg font-semibold">Sélectionnez une conversation</p>
                <p className="max-w-xs text-sm text-sage">Vos échanges avec {role === "RECRUITER" ? "les candidats" : "les recruteurs"} s&apos;affichent ici.</p>
              </div>
            ) : (
              <>
                <header className="flex items-center gap-3 border-b border-line bg-white px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => setMobileThread(false)}
                    aria-label="Retour aux conversations"
                    className="rounded-full p-1.5 text-lg text-sage hover:bg-paper lg:hidden"
                  >
                    ←
                  </button>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint text-sm font-semibold text-forest">
                    {initials(title)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{title}</p>
                    <p className="truncate text-xs text-sage">{subtitle}</p>
                  </div>
                  {thread?.job ? (
                    <span className="hidden max-w-[220px] shrink-0 truncate rounded-full bg-tint px-3 py-1 text-xs font-semibold text-forest sm:inline">
                      {thread.job.title}
                    </span>
                  ) : null}
                  {role === "RECRUITER" && (thread?.counterpart.candidateId || prospect?.id) ? (
                    <Link
                      href={`/recruteur/candidats/${thread?.counterpart.candidateId ?? prospect?.id}`}
                      className="shrink-0 rounded-full border border-forest px-4 py-1.5 text-xs font-semibold text-forest hover:bg-tint"
                    >
                      Voir le profil
                    </Link>
                  ) : null}
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto bg-paper/70 px-6 py-5">
                  {prospect && !activeId ? (
                    <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-5 text-center">
                      <p className="font-semibold">Nouvelle conversation avec {prospect.name}</p>
                      <p className="mt-1 text-sm text-sage">
                        {prospect.canContact
                          ? "Présentez-vous et expliquez pourquoi vous le contactez. Il verra le nom de votre entreprise."
                          : "Ce candidat n'est pas joignable : son profil n'est pas ouvert aux recruteurs."}
                      </p>
                    </div>
                  ) : null}
                  {thread?.messages.map((message) => {
                    const day = dayLabel(message.createdAt);
                    const showDay = day !== lastDay;
                    lastDay = day;
                    return (
                      <div key={message.id}>
                        {showDay ? (
                          <p className="my-4 flex items-center gap-3 text-xs font-medium capitalize text-sage before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
                            {day}
                          </p>
                        ) : null}
                        <div className={`mb-3 flex ${message.mine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[72%] ${message.mine ? "items-end" : "items-start"} flex flex-col`}>
                            {!message.mine ? <span className="mb-0.5 px-1 text-xs text-sage">{message.sender.name}</span> : null}
                            <p
                              className={`whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-sm leading-6 ${
                                message.mine ? "rounded-br-md bg-forest text-white" : "rounded-bl-md bg-white shadow-sm ring-1 ring-line"
                              }`}
                            >
                              {message.body}
                            </p>
                            <span className="mt-0.5 px-1 text-[11px] text-sage">
                              {shortTime(message.createdAt)}
                              {message.mine && role === "RECRUITER" ? ` · ${message.sender.name}` : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send();
                  }}
                  className="border-t border-line bg-white p-3"
                >
                  {error ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                  <div className="flex items-end gap-2 rounded-3xl border border-line bg-paper py-1.5 pl-4 pr-1.5 focus-within:border-forest focus-within:bg-white focus-within:ring-2 focus-within:ring-forest/15">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value.slice(0, MAX))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void send();
                        }
                      }}
                      rows={1}
                      disabled={Boolean(prospect && !prospect.canContact && !activeId)}
                      placeholder="Écrire un message…"
                      aria-label="Votre message"
                      className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-sage/70 disabled:opacity-50"
                    />
                    <button
                      disabled={sending || !draft.trim() || Boolean(prospect && !prospect.canContact && !activeId)}
                      aria-label="Envoyer"
                      className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:bg-forest-dark active:scale-95 disabled:bg-line disabled:text-sage"
                    >
                      {sending ? "Envoi…" : "Envoyer"}
                    </button>
                  </div>
                  <p className="mt-1.5 px-2 text-[11px] text-sage/80">Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne</p>
                  {draft.length > MAX * 0.9 ? <p className="mt-1 text-right text-xs text-sage">{draft.length} / {MAX}</p> : null}
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
