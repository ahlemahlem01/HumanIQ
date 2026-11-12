const loginForm = document.getElementById("login");
const workspace = document.getElementById("workspace");
const statusEl = document.getElementById("status");
const whoEl = document.getElementById("who");
const jobEl = document.getElementById("job");
const previewEl = document.getElementById("preview");
const importBtn = document.getElementById("import");
const logoutBtn = document.getElementById("logout");

let scraped = null;

function setStatus(text) {
  statusEl.textContent = text || "";
}

function send(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
}

async function scrapeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PROFILE" });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PROFILE" });
    } catch {
      return null;
    }
  }
}

function showPreview(profile) {
  scraped = profile;
  if (!profile?.fullName) {
    previewEl.textContent =
      "Aucun profil détecté. Ouvrez linkedin.com/in/… ou http://localhost:3100/demo/linkedin";
    return;
  }
  previewEl.textContent = [
    profile.fullName,
    profile.headline,
    profile.location,
    profile.skills?.length ? `Skills : ${profile.skills.slice(0, 8).join(", ")}` : "",
    profile.linkedinUrl,
  ]
    .filter(Boolean)
    .join("\n");
}

async function bootWorkspace() {
  loginForm.classList.add("hidden");
  workspace.classList.remove("hidden");
  const stored = await chrome.storage.local.get(["email"]);
  whoEl.textContent = stored.email || "Recruteur connecté";
  const { jobs } = await send({ type: "JOBS" });
  jobEl.innerHTML = (jobs || [])
    .filter((job) => job.status === "PUBLISHED")
    .map((job) => `<option value="${job.id}">${job.title}</option>`)
    .join("");
  showPreview(await scrapeActiveTab());
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");
  const data = new FormData(loginForm);
  try {
    const email = String(data.get("email"));
    await send({ type: "LOGIN", email, password: String(data.get("password")) });
    await chrome.storage.local.set({ email });
    await bootWorkspace();
  } catch (err) {
    setStatus(err.message);
  }
});

importBtn.addEventListener("click", async () => {
  setStatus("");
  if (!scraped?.fullName) {
    setStatus("Ouvrez d'abord un profil à importer.");
    return;
  }
  if (!jobEl.value) {
    setStatus("Choisissez une offre.");
    return;
  }
  importBtn.disabled = true;
  try {
    const result = await send({
      type: "IMPORT",
      payload: { ...scraped, jobId: jobEl.value },
    });
    const name = result.application?.candidate?.user;
    setStatus(
      `Importé : ${name?.firstName ?? ""} ${name?.lastName ?? ""} — ATS ${result.application?.atsScore ?? "—"}%. Ouvrez le Kanban.`,
    );
  } catch (err) {
    setStatus(err.message);
  } finally {
    importBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await send({ type: "LOGOUT" });
  workspace.classList.add("hidden");
  loginForm.classList.remove("hidden");
});

chrome.storage.local.get(["token"]).then((stored) => {
  if (stored.token) bootWorkspace().catch((err) => setStatus(err.message));
});
