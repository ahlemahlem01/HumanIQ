"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function CompliancePage() {
  const { token } = useAuth();
  const [userId, setUserId] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [note, setNote] = useState("");

  async function exportUser(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setPayload(await api(`/admin/gdpr/${userId}`, { token }));
    setNote("Export généré — à transmettre à la personne concernée.");
  }

  async function anonymize() {
    if (!token || !userId) return;
    if (!confirm("Anonymiser définitivement ce compte ?")) return;
    await api(`/admin/gdpr/${userId}/anonymize`, { token });
    setNote("Compte anonymisé (droit à l'effacement).");
  }

  return (
    <AppShell role="ADMIN" title="Conformité RGPD / INPDP">
      <p className="max-w-xl text-sm text-forest/70">
        Export des données personnelles et anonymisation. Journal d'audit côté API. Chiffrement transit
        TLS 1.3 / repos AES-256 à activer en production.
      </p>
      <form onSubmit={exportUser} className="mt-6 flex max-w-xl gap-2">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="ID utilisateur"
          className="flex-1 rounded-xl border border-line bg-cream px-3 py-2"
        />
        <button className="rounded-full bg-forest px-4 py-2 text-cream">Exporter</button>
      </form>
      <button onClick={anonymize} className="mt-3 text-sm text-copper">
        Anonymiser le compte
      </button>
      {note ? <p className="mt-3 text-sm">{note}</p> : null}
      {payload ? (
        <pre className="mt-4 max-w-3xl overflow-auto rounded-xl bg-ink p-4 text-xs text-cream">
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : null}
    </AppShell>
  );
}
