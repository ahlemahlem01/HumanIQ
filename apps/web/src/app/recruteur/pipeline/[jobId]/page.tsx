"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { isSourced, SourcedNote } from "@/components/sourced-note";
import { api, STAGE_LABEL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STAGES = ["SOURCING", "PRESELECTION", "INTERVIEW", "TEST", "OFFER", "HIRED"] as const;

const STAGE_DOT: Record<string, string> = {
  SOURCING: "bg-slate-400",
  PRESELECTION: "bg-sky-500",
  INTERVIEW: "bg-indigo-500",
  TEST: "bg-amber-500",
  OFFER: "bg-violet-500",
  HIRED: "bg-emerald-500",
};

const TEST_LABEL: Record<string, string> = {
  QCM: "QCM technique",
  CODE: "Test de code",
  CULTURE: "Fit culturel",
  INTERVIEW: "Entretien",
};

type Assessment = {
  id: string;
  type: string;
  title: string;
  score: number | null;
  status: string;
  completedAt: string | null;
};

type InterviewRef = { id: string; status: string; overallScore: number | null; createdAt: string };

type Card = {
  id: string;
  stage: string;
  atsScore: number | null;
  keywordSuggestions: string[];
  candidate: {
    id: string;
    source?: string | null;
    user: { firstName: string; lastName: string; email: string };
  };
  assessments: Assessment[];
  interviews: InterviewRef[];
};

type Pipeline = {
  job: { title: string };
  columns: { stage: string; items: Card[] }[];
};

type Note = { id: string; body: string; createdAt: string; author: { id: string; name: string } };

type InterviewDetail = {
  id: string;
  status: string;
  overallScore: number | null;
  summary: string | null;
  history: { index: number; competency: string; question: string; answer: string | null; score: number | null; feedback: string | null }[];
};

function testsDone(card: Card) {
  return card.assessments.filter((item) => item.status === "COMPLETED").length;
}

function interviewLabel(interview: InterviewRef) {
  return interview.status === "COMPLETED"
    ? `Entretien terminé${interview.overallScore != null ? ` · ${interview.overallScore}/100` : ""}`
    : "Entretien en cours";
}

export default function PipelinePage() {
  const params = useParams<{ jobId: string }>();
  const { token } = useAuth();
  const [data, setData] = useState<Pipeline | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"tests" | "interview" | null>(null);
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<InterviewDetail | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  async function load() {
    if (!token) return;
    setData(await api<Pipeline>(`/applications/pipeline/${params.jobId}`, { token }));
  }

  useEffect(() => {
    load();
  }, [token, params.jobId]);

  async function move(applicationId: string, stage: string) {
    if (!token) return;
    await api(`/applications/${applicationId}/move`, {
      method: "PATCH",
      token,
      body: { stage, kanbanOrder: 0 },
    });
    load();
  }

  const all = data?.columns.flatMap((column) => column.items) ?? [];
  const open = all.find((item) => item.id === openId) ?? null;
  const openInterview = open?.interviews[0] ?? null;
  const openInterviewDone = openInterview?.status === "COMPLETED" ? openInterview.id : null;

  useEffect(() => {
    setDetail(null);
    if (!token || !openInterviewDone) return;
    api<InterviewDetail>(`/interviews/${openInterviewDone}`, { token })
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [token, openInterviewDone]);

  useEffect(() => {
    setNotes([]);
    setNoteDraft("");
    if (!token || !openId) return;
    api<Note[]>(`/applications/${openId}/notes`, { token })
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [token, openId]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  function openCard(id: string) {
    setNotice("");
    setOpenId(id);
  }

  async function addNote(applicationId: string) {
    if (!token) return;
    const body = noteDraft.trim();
    if (!body) return;
    setNoteBusy(true);
    try {
      const created = await api<Note>(`/applications/${applicationId}/notes`, { method: "POST", token, body: { body } });
      setNotes((current) => [...current, created]);
      setNoteDraft("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Note impossible à enregistrer.");
    } finally {
      setNoteBusy(false);
    }
  }

  async function assignTests(applicationId: string) {
    if (!token) return;
    setBusy("tests");
    setNotice("");
    try {
      const result = await api<{ assigned: number }>(`/applications/${applicationId}/tests`, { method: "POST", token });
      setNotice(
        result.assigned > 0
          ? `${result.assigned} test${result.assigned > 1 ? "s" : ""} assigné${result.assigned > 1 ? "s" : ""} au candidat.`
          : "Les tests sont déjà assignés.",
      );
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Impossible d'assigner les tests.");
    } finally {
      setBusy(null);
    }
  }

  async function inviteInterview(applicationId: string) {
    if (!token) return;
    setBusy("interview");
    setNotice("");
    try {
      await api(`/applications/${applicationId}/interview`, { method: "POST", token });
      setNotice("Entretien virtuel envoyé : le candidat le retrouve dans son espace.");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Impossible d'inviter à l'entretien.");
    } finally {
      setBusy(null);
    }
  }

  const total = all.length;

  return (
    <AppShell role="RECRUITER" plain>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/recruteur" className="text-sm font-semibold text-forest hover:underline">
            ← Retour aux offres
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{data?.job.title ?? "Candidatures"}</h1>
          <p className="mt-1 text-sm text-sage">
            {total} candidature{total > 1 ? "s" : ""} · glissez une carte vers une autre étape, ou ouvrez le dossier.
          </p>
        </div>
        <Link
          href={`/recruteur/matching/${params.jobId}`}
          className="rounded-full border border-forest px-5 py-2.5 text-sm font-semibold text-forest hover:bg-tint"
        >
          Profils proches
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-6">
        {STAGES.map((stage) => {
          const items = data?.columns.find((column) => column.stage === stage)?.items ?? [];
          const active = overStage === stage;
          return (
            <section
              key={stage}
              onDragOver={(event) => {
                event.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((current) => (current === stage ? null : current))}
              onDrop={(event) => {
                const id = event.dataTransfer.getData("text/plain");
                setOverStage(null);
                setDragId(null);
                if (id) void move(id, stage);
              }}
              className={`min-w-[250px] flex-1 rounded-xl border p-3 transition ${
                active ? "border-forest bg-tint" : "border-transparent bg-paper"
              }`}
            >
              <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${STAGE_DOT[stage]}`} />
                {STAGE_LABEL[stage]}
                <span className="ml-auto rounded-lg bg-white px-2 py-0.5 text-xs font-semibold text-sage">
                  {items.length}
                </span>
              </h2>
              <ul className="mt-3 space-y-3">
                {items.map((item) => {
                  const name = `${item.candidate.user.firstName} ${item.candidate.user.lastName}`;
                  const score = item.atsScore;
                  const interview = item.interviews[0];
                  return (
                    <li
                      key={item.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", item.id);
                        setDragId(item.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverStage(null);
                      }}
                      className={`cursor-grab rounded-xl border border-line bg-white p-4 shadow-sm transition hover:shadow-md ${
                        dragId === item.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint text-xs font-bold text-forest">
                          {item.candidate.user.firstName[0]}
                          {item.candidate.user.lastName[0]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{name}</p>
                          <p className="text-xs text-sage">
                            {score == null ? "Non évalué" : score >= 75 ? "Excellent match" : score >= 55 ? "Bon match" : score >= 35 ? "Match partiel" : "Match faible"}
                          </p>
                        </div>
                        <MiniRing value={score} />
                      </div>
                      {item.keywordSuggestions.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.keywordSuggestions.slice(0, 3).map((keyword) => (
                            <span key={keyword} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-warn">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {item.assessments.length > 0 || interview ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.assessments.length > 0 ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                testsDone(item) === item.assessments.length ? "bg-emerald-50 text-good" : "bg-tint text-forest"
                              }`}
                            >
                              Tests {testsDone(item)}/{item.assessments.length}
                            </span>
                          ) : null}
                          {interview ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                interview.status === "COMPLETED" ? "bg-emerald-50 text-good" : "bg-tint text-forest"
                              }`}
                            >
                              {interviewLabel(interview)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={stage}
                          onChange={(event) => void move(item.id, event.target.value)}
                          aria-label={`Étape de ${name}`}
                          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-xs outline-none focus:border-forest"
                        >
                          {STAGES.map((value) => (
                            <option key={value} value={value}>
                              {STAGE_LABEL[value]}
                            </option>
                          ))}
                          <option value="REJECTED">Refuser</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => openCard(item.id)}
                          className="shrink-0 rounded-lg bg-forest px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Dossier
                        </button>
                      </div>
                    </li>
                  );
                })}
                {items.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-sage">
                    Déposez une carte ici
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Dossier candidat">
          <button
            type="button"
            aria-label="Fermer le dossier"
            onClick={() => setOpenId(null)}
            className="absolute inset-0 bg-ink/40"
          />
          <aside className="relative h-full w-full max-w-[460px] overflow-y-auto border-l border-line bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tint text-sm font-bold text-forest">
                {open.candidate.user.firstName[0]}
                {open.candidate.user.lastName[0]}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold">
                  {open.candidate.user.firstName} {open.candidate.user.lastName}
                </h2>
                {isSourced(open.candidate.source) ? (
                  <SourcedNote className="mt-1" />
                ) : (
                  <p className="truncate text-sm text-sage">{open.candidate.user.email}</p>
                )}
                <p className="mt-1 text-xs font-medium text-forest">Étape : {STAGE_LABEL[open.stage] ?? open.stage}</p>
                {isSourced(open.candidate.source) ? null : (
                  <Link
                    href={`/recruteur/messages?candidate=${open.candidate.id}&job=${params.jobId}`}
                    className="mt-2 inline-block rounded-full bg-forest px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    Écrire au candidat
                  </Link>
                )}
              </div>
              <MiniRing value={open.atsScore} />
              <button
                type="button"
                autoFocus
                onClick={() => setOpenId(null)}
                aria-label="Fermer"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-sage hover:bg-paper"
              >
                ×
              </button>
            </div>

            {notice ? <p className="mt-4 rounded-xl bg-tint px-4 py-3 text-sm font-medium text-forest">{notice}</p> : null}

            <section className="mt-6">
              <h3 className="text-base font-semibold">Tests techniques</h3>
              {open.assessments.length === 0 ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-sage">
                    Aucun test pour l&apos;instant. Assignez un QCM technique, un test de code et un questionnaire de fit culturel adaptés aux compétences de l&apos;offre.
                  </p>
                  <button
                    type="button"
                    onClick={() => void assignTests(open.id)}
                    disabled={busy === "tests"}
                    className="mt-3 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy === "tests" ? "Envoi…" : "Assigner les tests"}
                  </button>
                </>
              ) : (
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {open.assessments.map((test) => (
                    <li key={test.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{TEST_LABEL[test.type] ?? test.title}</p>
                        <p className="text-xs text-sage">
                          {test.status === "COMPLETED" ? "Rendu" : "En attente du candidat"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                          test.status === "COMPLETED" ? "bg-emerald-50 text-good" : "bg-paper text-sage"
                        }`}
                      >
                        {test.status === "COMPLETED" && test.score != null ? `${test.score}/100` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8">
              <h3 className="text-base font-semibold">Entretien virtuel IA</h3>
              {!openInterview ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-sage">
                    Le candidat répond à des questions adaptées au poste. Vous recevez un score et un résumé.
                  </p>
                  <button
                    type="button"
                    onClick={() => void inviteInterview(open.id)}
                    disabled={busy === "interview"}
                    className="mt-3 rounded-full border border-forest px-5 py-2.5 text-sm font-semibold text-forest hover:bg-tint disabled:opacity-60"
                  >
                    {busy === "interview" ? "Envoi…" : "Inviter à l'entretien"}
                  </button>
                </>
              ) : (
                <div className="mt-3 rounded-xl border border-line p-4">
                  <p className="text-sm font-medium">{interviewLabel(openInterview)}</p>
                  {openInterview.status !== "COMPLETED" ? (
                    <p className="mt-1 text-xs text-sage">Le candidat n&apos;a pas encore terminé. Le résultat apparaîtra ici.</p>
                  ) : detail ? (
                    <>
                      {detail.summary ? <p className="mt-2 text-sm leading-6">{detail.summary}</p> : null}
                      <ul className="mt-3 space-y-3">
                        {detail.history.map((turn) => (
                          <li key={turn.index} className="rounded-lg bg-paper p-3 text-sm">
                            <p className="flex items-center justify-between gap-2 text-xs font-semibold text-forest">
                              <span>{turn.competency}</span>
                              {turn.score != null ? <span>{turn.score}/100</span> : null}
                            </p>
                            <p className="mt-1 font-medium">{turn.question}</p>
                            {turn.answer ? <p className="mt-1 text-sage">{turn.answer}</p> : null}
                            {turn.feedback ? <p className="mt-1 text-xs text-ink/80">{turn.feedback}</p> : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-sage">Chargement du résultat…</p>
                  )}
                </div>
              )}
            </section>

            <section className="mt-8">
              <h3 className="text-base font-semibold">Notes de l&apos;équipe</h3>
              <p className="mt-1 text-xs text-sage">Visibles par les recruteurs de votre entreprise, jamais par le candidat.</p>
              {notes.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {notes.map((note) => (
                    <li key={note.id} className="flex gap-2">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint text-[11px] font-bold text-forest">
                        {note.author.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl bg-paper px-3 py-2">
                        <p className="text-xs text-sage">
                          <span className="font-semibold text-ink">{note.author.name}</span>
                          {" · "}
                          {new Date(note.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm">{note.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-sage">Aucune note pour l&apos;instant.</p>
              )}
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addNote(open.id);
                }}
              >
                <input
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  maxLength={2000}
                  placeholder="Ajouter une note pour l'équipe…"
                  className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                />
                <button
                  disabled={noteBusy || !noteDraft.trim()}
                  className="rounded-full bg-forest px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Publier
                </button>
              </form>
            </section>

            <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-5">
              {open.keywordSuggestions.length ? (
                <p className="w-full text-xs text-sage">À préciser : {open.keywordSuggestions.join(", ")}</p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </AppShell>
  );
}

function MiniRing({ value }: { value: number | null }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(value ?? 0));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const size = 44;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const colour = value == null ? "text-sage" : value >= 70 ? "text-good" : value >= 40 ? "text-forest" : "text-warn";

  return (
    <div className={`relative h-11 w-11 shrink-0 ${colour}`} role="img" aria-label={value == null ? "Non évalué" : `Compatibilité ${value} %`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-line" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink">
        {value == null ? "—" : value}
      </span>
    </div>
  );
}
