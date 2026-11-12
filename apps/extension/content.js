function textOf(el) {
  return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
}

function first(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const value = textOf(el);
    if (value) return value;
  }
  return "";
}

function all(selectors, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((el) => {
      const value = textOf(el);
      if (value && value.length > 8 && !seen.has(value)) {
        seen.add(value);
        out.push(value);
      }
    });
  }
  return out.slice(0, limit);
}

function scrapeProfile() {
  const fullName = first(["[data-ng-name]", "h1.text-heading-xlarge", ".pv-text-details__left-panel h1", "h1"]);
  const headline = first([
    "[data-ng-headline]",
    ".text-body-medium.break-words",
    ".pv-text-details__left-panel .text-body-medium",
  ]);
  const location = first([
    "[data-ng-location]",
    ".text-body-small.inline.t-black--light.break-words",
    ".pv-text-details__left-panel .text-body-small",
  ]);
  const about = first(["[data-ng-about]", "#about ~ .display-flex .inline-show-more-text", "section #about"]);
  const experience = all(["[data-ng-experience] li", "#experience ~ div li .display-flex .t-bold span[aria-hidden='true']"]);
  const skills = all(["[data-ng-skills] li", ".pvs-list__paged-list-item .t-bold span[aria-hidden='true']"], 16);
  const rawBits = [fullName, headline, location, about, experience.join("\n"), skills.join(", ")].filter(Boolean);

  return {
    linkedinUrl: location.href.split("?")[0],
    fullName,
    headline,
    location,
    about,
    experience,
    skills,
    rawText: rawBits.join("\n"),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCRAPE_PROFILE") {
    sendResponse(scrapeProfile());
  }
  return true;
});
