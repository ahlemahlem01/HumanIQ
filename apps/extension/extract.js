/*
 * Reads the profile shown in the current tab.
 *
 * This function is serialized by chrome.scripting.executeScript and runs inside the page, so it must stay
 * self-contained (no imports, no outside variables). It only runs when the recruiter clicks the extension
 * icon: there is no content script and nothing is read in the background.
 *
 * Order of preference:
 *   1. the HumanIQ demo page (data-ng-* attributes),
 *   2. a LinkedIn profile (best-effort selectors, LinkedIn changes its markup often),
 *   3. any other page: the selected text, or the main text of the page.
 */
function extractProfile() {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const textOf = (node) => clean(node && (node.innerText || node.textContent));
  const firstText = (...selectors) => {
    for (const selector of selectors) {
      const value = textOf(document.querySelector(selector));
      if (value) return value;
    }
    return "";
  };
  const unique = (lines) => {
    const seen = new Set();
    return lines.filter((line) => {
      const key = line.toLowerCase();
      if (!line || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  // LinkedIn repeats each text twice (visible + screen-reader copy): keep one of each line.
  const linesOf = (node) => unique(((node && (node.innerText || "")) || "").split(/\n+/).map(clean));
  const sectionOf = (id) => {
    const anchor = document.getElementById(id);
    return anchor ? anchor.closest("section") : null;
  };

  const host = location.hostname;
  const onLinkedIn = /(^|\.)linkedin\.com$/.test(host);
  const onProfile = onLinkedIn && /^\/in\//.test(location.pathname);
  const demo = !!document.querySelector("[data-ng-name]");
  const kind = demo ? "demo" : onProfile ? "linkedin" : "page";

  let fullName = "";
  let headline = "";
  let place = "";
  let about = "";
  let experience = [];
  let skills = [];

  if (demo) {
    fullName = firstText("[data-ng-name]");
    headline = firstText("[data-ng-headline]");
    place = firstText("[data-ng-location]");
    about = firstText("[data-ng-about]");
    experience = Array.from(document.querySelectorAll("[data-ng-experience] li")).map(textOf).filter(Boolean);
    skills = Array.from(document.querySelectorAll("[data-ng-skills] li")).map(textOf).filter(Boolean);
  } else if (onProfile) {
    fullName = firstText("main h1", "h1");
    headline = firstText("main .text-body-medium.break-words", "main div.text-body-medium");
    place = firstText("main .text-body-small.inline.t-black--light.break-words", "main span.text-body-small.inline");

    const aboutSection = sectionOf("about");
    if (aboutSection) {
      const lines = linesOf(aboutSection).filter((line) => !/^(à propos|about|info)$/i.test(line));
      about = lines.join(" ");
    }
    const experienceSection = sectionOf("experience");
    if (experienceSection) {
      experience = Array.from(experienceSection.querySelectorAll(":scope > div > ul > li, :scope ul > li"))
        .map((item) => linesOf(item).slice(0, 5).join(" · "))
        .filter(Boolean);
      experience = unique(experience).slice(0, 12);
    }
    const skillsSection = sectionOf("skills");
    if (skillsSection) {
      skills = unique(
        Array.from(skillsSection.querySelectorAll("ul > li")).map((item) => linesOf(item)[0] || ""),
      ).slice(0, 30);
    }
  }

  if (!fullName) {
    const og = document.querySelector('meta[property="og:title"]');
    const title = clean((og && og.getAttribute("content")) || document.title)
      .replace(/^\(\d+\)\s*/, "")
      .split(/\s[|\-–—]\s/)[0];
    fullName = title;
  }

  let canonical = "";
  if (demo) {
    canonical = location.origin + location.pathname;
  } else if (onProfile) {
    const match = location.pathname.match(/^\/in\/[^/]+/);
    canonical = match ? "https://www.linkedin.com" + match[0] : "";
  }

  // Structured fields are enough when we have a name and some substance. Otherwise fall back to raw text,
  // which the server turns into a profile (selection first: the recruiter chose exactly what to import).
  const thin = !fullName || (!about && experience.length === 0);
  let rawText = "";
  if (thin) {
    const selection = (window.getSelection && String(window.getSelection())) || "";
    const main = document.querySelector("main") || document.body;
    rawText = (selection.trim().length > 40 ? selection : (main && main.innerText) || "").trim().slice(0, 8000);
  }

  return {
    kind,
    pageTitle: clean(document.title).slice(0, 200),
    linkedinUrl: canonical,
    fullName: fullName.slice(0, 120),
    headline: headline.slice(0, 180),
    location: place.slice(0, 120),
    about: about.slice(0, 2000),
    experience: experience.slice(0, 12).map((line) => line.slice(0, 600)),
    skills: skills.slice(0, 30).map((line) => line.slice(0, 80)),
    rawText,
    thin,
  };
}
