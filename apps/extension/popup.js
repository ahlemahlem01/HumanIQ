"use strict";

/* HumanIQ sourcing popup: sign in, read the profile in the current tab, add it to a job pipeline. */

const DEFAULTS = { apiUrl: "http://localhost:4100/api", webUrl: "http://localhost:3100" };
const app = document.getElementById("app");

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const store = {
  async load() {
    const saved = await chrome.storage.local.get(["apiUrl", "webUrl", "token", "user", "lastJobId"]);
    return {
      apiUrl: saved.apiUrl || DEFAULTS.apiUrl,
      webUrl: saved.webUrl || DEFAULTS.webUrl,
      token: saved.token || "",
      user: saved.user || null,
      lastJobId: saved.lastJobId || "",
    };
  },
  save: (values) => chrome.storage.local.set(values),
  signOut: () => chrome.storage.local.remove(["token", "user"]),
};

async function request(state, path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
  let response;
  try {
    response = await fetch(state.apiUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, `Impossible de joindre l'API HumanIQ (${state.apiUrl}). Est-elle démarrée ?`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
    throw new ApiError(response.status, message || `Erreur ${response.status}`);
  }
  return data;
}

/** Tiny DOM helper: text is always inserted as text, never as HTML. */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value == null) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

const show = (...nodes) => app.replaceChildren(...nodes.filter(Boolean));
const notice = (tone, text) => h("div", { class: `notice ${tone}`, role: tone === "error" ? "alert" : "status" }, text);
const cleanUrl = (value) => value.trim().replace(/\/+$/, "");

/* ---------- sign in ---------- */

function loginView(state, message) {
  const email = h("input", { id: "email", type: "email", autocomplete: "username", required: true, placeholder: "vous@entreprise.com" });
  const password = h("input", { id: "password", type: "password", autocomplete: "current-password", required: true });
  const submit = h("button", { class: "btn", type: "submit" }, "Se connecter");
  const feedback = h("div");

  const form = h(
    "form",
    {
      onsubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        submit.textContent = "Connexion…";
        feedback.replaceChildren();
        try {
          const result = await request(state, "/auth/login", { method: "POST", auth: false, body: { email: email.value.trim(), password: password.value } });
          if (result.user?.role !== "RECRUITER") throw new ApiError(403, "Ce compte n'est pas un compte recruteur.");
          await store.save({ token: result.token, user: result.user });
          await start();
        } catch (error) {
          feedback.replaceChildren(notice("error", error.status === 401 ? "E-mail ou mot de passe incorrect." : error.message));
          submit.disabled = false;
          submit.textContent = "Se connecter";
        }
      },
    },
    h("label", { for: "email" }, "E-mail professionnel"),
    email,
    h("label", { for: "password" }, "Mot de passe"),
    password,
    feedback,
    submit,
  );

  show(
    h("h2", {}, "Connexion recruteur"),
    h("p", { class: "muted" }, "Utilisez le compte HumanIQ de votre entreprise. Le mot de passe n'est jamais enregistré dans l'extension."),
    message ? notice("warn", message) : null,
    form,
  );
  email.focus();
}

/* ---------- import ---------- */

const NO_ACCESS = /^(chrome|edge|about|chrome-extension|devtools|view-source):/i;

async function readTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("Aucun onglet actif.");
  if (!tab.url || NO_ACCESS.test(tab.url)) throw new Error("Cette page du navigateur ne peut pas être lue. Ouvrez un profil LinkedIn.");
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractProfile });
    return injection.result;
  } catch {
    throw new Error("Impossible de lire cet onglet. Rechargez la page, puis rouvrez l'extension.");
  }
}

async function importView(state) {
  show(h("p", { class: "muted" }, "Lecture du profil…"));

  let profile;
  let jobs;
  try {
    [profile, jobs] = await Promise.all([readTab(), request(state, "/jobs/mine")]);
  } catch (error) {
    if (error.status === 401) {
      await store.signOut();
      return loginView({ ...state, token: "" }, "Session expirée : reconnectez-vous.");
    }
    return show(notice("error", error.message), h("button", { class: "btn ghost", type: "button", onclick: () => importView(state) }, "Réessayer"), footer(state));
  }

  const published = jobs.filter((job) => job.status === "PUBLISHED");
  const name = h("input", { id: "name", value: profile.fullName, required: true });
  const headline = h("input", { id: "headline", value: profile.headline });
  const place = h("input", { id: "place", value: profile.location });
  const job = h(
    "select",
    { id: "job" },
    published.map((item) => h("option", { value: item.id, selected: item.id === state.lastJobId }, item.title)),
  );
  const submit = h("button", { class: "btn", type: "submit", disabled: published.length === 0 }, "Ajouter au pipeline");
  const feedback = h("div");

  const intro =
    profile.kind === "page"
      ? notice("warn", "Cette page n'est pas un profil LinkedIn : sa sélection (ou son texte) sera analysée pour créer le profil.")
      : profile.thin
        ? notice("warn", "Peu d'informations lues. Sélectionnez le texte du profil avant d'ouvrir l'extension pour un meilleur résultat.")
        : null;

  const chips = profile.skills.slice(0, 10).map((skill) => h("span", { class: "chip" }, skill));
  const summary = h(
    "div",
    { class: "card" },
    h("b", {}, profile.fullName || "Nom non détecté"),
    h("span", { class: "muted small" }, `${profile.experience.length} expérience(s) · ${profile.skills.length} compétence(s)`),
    chips.length ? h("div", { class: "chips" }, chips) : null,
  );

  const form = h(
    "form",
    {
      onsubmit: async (event) => {
        event.preventDefault();
        if (!name.value.trim()) return;
        submit.disabled = true;
        submit.textContent = "Import en cours…";
        feedback.replaceChildren();
        try {
          const created = await request(state, "/sourcing/linkedin", {
            method: "POST",
            body: {
              jobId: job.value,
              linkedinUrl: profile.linkedinUrl || undefined,
              fullName: name.value.trim(),
              headline: headline.value.trim() || undefined,
              location: place.value.trim() || undefined,
              about: profile.about || undefined,
              experience: profile.experience,
              skills: profile.skills,
              rawText: profile.rawText || undefined,
            },
          });
          await store.save({ lastJobId: job.value });
          resultView(state, created, published.find((item) => item.id === job.value));
        } catch (error) {
          if (error.status === 401) {
            await store.signOut();
            return loginView({ ...state, token: "" }, "Session expirée : reconnectez-vous.");
          }
          feedback.replaceChildren(notice(error.status === 409 ? "warn" : "error", error.message));
          submit.disabled = false;
          submit.textContent = "Ajouter au pipeline";
        }
      },
    },
    h("label", { for: "name" }, "Nom"),
    name,
    h("label", { for: "headline" }, "Titre"),
    headline,
    h("label", { for: "place" }, "Lieu"),
    place,
    h("label", { for: "job" }, "Offre cible"),
    job,
    published.length === 0 ? notice("warn", "Aucune offre publiée : publiez une offre dans HumanIQ pour y ajouter des profils.") : null,
    feedback,
    submit,
    h(
      "p",
      { class: "muted small", style: "margin-top:10px" },
      "Vous ajoutez ce profil à votre initiative. Il est conservé dans votre pipeline avec sa source et peut être supprimé sur demande (RGPD).",
    ),
  );

  show(intro, summary, form, footer(state));
}

function resultView(state, created, job) {
  const score = created.score?.score;
  const target = `${state.webUrl}/recruteur/offres/${created.jobId || job?.id || ""}`;
  show(
    notice("ok", "Profil ajouté au pipeline (étape Sourcing)."),
    h(
      "div",
      { class: "card" },
      h("b", {}, [created.candidate?.user?.firstName, created.candidate?.user?.lastName].filter(Boolean).join(" ") || "Profil importé"),
      h("span", { class: "muted small" }, job ? job.title : ""),
      typeof score === "number" ? h("div", { class: "score" }, h("strong", {}, `${score} %`), "de correspondance avec l'offre") : null,
    ),
    h("button", { class: "btn", type: "button", onclick: () => chrome.tabs.create({ url: target }) }, "Ouvrir le pipeline dans HumanIQ"),
    h("button", { class: "btn ghost", type: "button", onclick: () => importView(state) }, "Importer un autre profil"),
    footer(state),
  );
}

function footer(state) {
  return h(
    "div",
    { class: "row" },
    h("span", { class: "muted" }, state.user ? `${state.user.firstName} ${state.user.lastName}` : ""),
    h(
      "button",
      {
        class: "link",
        type: "button",
        onclick: async () => {
          await store.signOut();
          loginView({ ...state, token: "" });
        },
      },
      "Se déconnecter",
    ),
  );
}

/* ---------- settings ---------- */

function settingsView(state) {
  const api = h("input", { id: "api", value: state.apiUrl, required: true });
  const web = h("input", { id: "web", value: state.webUrl, required: true });
  const feedback = h("div");

  const form = h(
    "form",
    {
      onsubmit: async (event) => {
        event.preventDefault();
        feedback.replaceChildren();
        let apiUrl;
        let webUrl;
        try {
          apiUrl = cleanUrl(api.value);
          webUrl = cleanUrl(web.value);
          const parsed = new URL(apiUrl);
          new URL(webUrl);
          if (!/^https?:$/.test(parsed.protocol)) throw new Error();
          const origins = [`${parsed.origin}/*`];
          if (!(await chrome.permissions.contains({ origins }))) {
            const granted = await chrome.permissions.request({ origins });
            if (!granted) return feedback.replaceChildren(notice("error", "Autorisation refusée pour cette adresse."));
          }
        } catch {
          return feedback.replaceChildren(notice("error", "Adresse invalide (exemple : https://api.exemple.com/api)."));
        }
        const changedApi = apiUrl !== state.apiUrl;
        await store.save({ apiUrl, webUrl });
        if (changedApi) await store.signOut();
        await start();
      },
    },
    h("label", { for: "api" }, "Adresse de l'API"),
    api,
    h("label", { for: "web" }, "Adresse de l'application web"),
    web,
    feedback,
    h("button", { class: "btn", type: "submit" }, "Enregistrer"),
    h(
      "button",
      {
        class: "btn ghost",
        type: "button",
        onclick: async () => {
          await store.save({ apiUrl: DEFAULTS.apiUrl, webUrl: DEFAULTS.webUrl });
          await store.signOut();
          await start();
        },
      },
      "Valeurs par défaut",
    ),
    h("button", { class: "btn ghost", type: "button", onclick: () => start() }, "Retour"),
  );

  show(h("h2", {}, "Réglages"), h("p", { class: "muted" }, "Changer l'API vous déconnecte."), form);
}

/* ---------- start ---------- */

async function start() {
  const state = await store.load();
  if (!state.token) return loginView(state);
  return importView(state);
}

document.getElementById("settings-toggle").addEventListener("click", async () => settingsView(await store.load()));
start();
