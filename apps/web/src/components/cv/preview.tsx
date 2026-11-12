"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { bulletLines, contactItems, fullName, isVisible, periodLabel, type CvDoc } from "./types";

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

type Theme = {
  font: string;
  base: number;
  pad: string;
  name: CSSProperties;
  headline: CSSProperties;
  h2: CSSProperties;
  gap: number;
};

function themeFor(doc: CvDoc): Theme {
  const accent = doc.accent;
  if (doc.template === "modern") {
    return {
      font: "Inter, 'Helvetica Neue', Arial, sans-serif",
      base: 12.5,
      pad: "52px 58px",
      name: { fontSize: 32, fontWeight: 800, color: accent, letterSpacing: "-0.02em", lineHeight: 1.1 },
      headline: { fontSize: 15, color: "#374151", marginTop: 6 },
      h2: { fontSize: 11.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#111827", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 },
      gap: 20,
    };
  }
  if (doc.template === "compact") {
    return {
      font: "Arial, Helvetica, sans-serif",
      base: 11,
      pad: "40px 44px",
      name: { fontSize: 24, fontWeight: 700, color: "#111827", lineHeight: 1.15 },
      headline: { fontSize: 12.5, color: accent, marginTop: 3, fontWeight: 600 },
      h2: { fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, margin: "0 0 5px", borderBottom: `1px solid ${accent}`, paddingBottom: 2 },
      gap: 13,
    };
  }
  return {
    font: "Arial, Helvetica, sans-serif",
    base: 12.5,
    pad: "48px 56px",
    name: { fontSize: 26, fontWeight: 700, color: "#111111", lineHeight: 1.15 },
    headline: { fontSize: 14, color: accent, marginTop: 4, fontWeight: 600 },
    h2: { fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, margin: "0 0 6px", borderBottom: `1px solid ${accent}`, paddingBottom: 3 },
    gap: 18,
  };
}

function Block({ doc, theme, title, children }: { doc: CvDoc; theme: Theme; title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: theme.gap }}>
      <h2 style={theme.h2}>
        {doc.template === "modern" ? <span style={{ width: 4, height: 14, background: doc.accent, borderRadius: 2, display: "inline-block" }} /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return <span className="cv-placeholder" style={{ color: "#9ca3af", fontStyle: "italic" }}>{children}</span>;
}

function Bullets({ text }: { text: string }) {
  const lines = bulletLines(text);
  if (!lines.length) return null;
  return (
    <ul style={{ margin: "4px 0 0", paddingLeft: 16, listStyle: "disc" }}>
      {lines.map((line, index) => (
        <li key={index} style={{ marginTop: 2 }}>
          {line}
        </li>
      ))}
    </ul>
  );
}

function sections(doc: CvDoc, theme: Theme) {
  const accent = doc.accent;
  const modern = doc.template === "modern";
  const roles = doc.experiences.filter((role) => role.title.trim() || role.company.trim());
  const schools = doc.educations.filter((school) => school.school.trim());
  const projects = doc.projects.filter((project) => project.name.trim());
  const certs = doc.certifications.filter((item) => item.name.trim());
  const langs = doc.languages.filter((item) => item.name.trim());

  const summary =
    isVisible(doc, "summary") && (doc.summary.trim() || true) ? (
      <Block key="summary" doc={doc} theme={theme} title="Résumé">
        {doc.summary.trim() ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{doc.summary.trim()}</p> : <Placeholder>Trois ou quatre phrases qui présentent votre profil.</Placeholder>}
      </Block>
    ) : null;

  const skills =
    isVisible(doc, "skills") && doc.skills.length ? (
      <Block key="skills" doc={doc} theme={theme} title="Compétences">
        {modern ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {doc.skills.map((skill) => (
              <span key={skill} style={{ background: `${accent}14`, color: accent, borderRadius: 999, padding: "2px 10px", fontWeight: 600, fontSize: theme.base - 1 }}>
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0 }}>{doc.skills.join(" · ")}</p>
        )}
      </Block>
    ) : null;

  const experience =
    isVisible(doc, "experience") && roles.length ? (
      <Block key="experience" doc={doc} theme={theme} title="Expérience">
        {roles.map((role) => (
          <div key={role.key} style={{ marginTop: 9, breakInside: "avoid" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong>{role.title || <Placeholder>Poste</Placeholder>}</strong>
              <span style={{ color: "#4b5563", whiteSpace: "nowrap", fontSize: theme.base - 1 }}>{periodLabel(role.start, role.end, role.current)}</span>
            </div>
            <div style={{ color: modern ? accent : "#374151", fontWeight: modern ? 600 : 400 }}>
              {role.company || <Placeholder>Entreprise</Placeholder>}
              {role.location.trim() ? <span style={{ color: "#6b7280", fontWeight: 400 }}> · {role.location.trim()}</span> : null}
            </div>
            <Bullets text={role.bullets} />
          </div>
        ))}
      </Block>
    ) : null;

  const projectsBlock =
    isVisible(doc, "projects") && projects.length ? (
      <Block key="projects" doc={doc} theme={theme} title="Projets">
        {projects.map((project) => (
          <div key={project.key} style={{ marginTop: 7, breakInside: "avoid" }}>
            <strong>{project.name}</strong>
            {project.url.trim() ? <span style={{ color: "#6b7280" }}> — {project.url.trim().replace(/^https?:\/\/(www\.)?/, "")}</span> : null}
            <Bullets text={project.description} />
          </div>
        ))}
      </Block>
    ) : null;

  const education =
    isVisible(doc, "education") && schools.length ? (
      <Block key="education" doc={doc} theme={theme} title="Formation">
        {schools.map((school) => (
          <div key={school.key} style={{ marginTop: 7, breakInside: "avoid" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong>{[school.degree, school.field].filter((v) => v.trim()).join(", ") || school.school}</strong>
              <span style={{ color: "#4b5563", whiteSpace: "nowrap", fontSize: theme.base - 1 }}>{periodLabel(school.start, school.end, false)}</span>
            </div>
            {[school.degree, school.field].some((v) => v.trim()) ? <div style={{ color: "#374151" }}>{school.school}</div> : null}
            <Bullets text={school.bullets} />
          </div>
        ))}
      </Block>
    ) : null;

  const certsBlock =
    isVisible(doc, "certifications") && certs.length ? (
      <Block key="certs" doc={doc} theme={theme} title="Certifications">
        {certs.map((item, index) => (
          <div key={index} style={{ marginTop: 3 }}>
            <strong>{item.name}</strong>
            {item.issuer ? <span style={{ color: "#4b5563" }}> — {item.issuer}</span> : null}
            {item.year ? <span style={{ color: "#6b7280" }}> ({item.year})</span> : null}
          </div>
        ))}
      </Block>
    ) : null;

  const langsBlock =
    isVisible(doc, "languages") && langs.length ? (
      <Block key="langs" doc={doc} theme={theme} title="Langues">
        <p style={{ margin: 0 }}>{langs.map((item) => `${item.name}${item.level ? ` (${item.level})` : ""}`).join(" · ")}</p>
      </Block>
    ) : null;

  return { summary, skills, experience, projectsBlock, education, certsBlock, langsBlock };
}

/** A4 sheet, 794px wide, rendered with inline styles so the printed PDF matches the screen. */
export function CvPreview({ doc, onHeight }: { doc: CvDoc; onHeight?: (height: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !onHeight) return;
    const observer = new ResizeObserver(() => onHeight(node.offsetHeight));
    observer.observe(node);
    onHeight(node.offsetHeight);
    return () => observer.disconnect();
  }, [onHeight]);

  const theme = themeFor(doc);
  const parts = sections(doc, theme);
  const contact = contactItems(doc);
  const compact = doc.template === "compact";

  const header = (
    <header>
      <h1 style={{ margin: 0, ...theme.name }}>{fullName(doc)}</h1>
      <div style={theme.headline}>{doc.headline.trim() || <Placeholder>Votre titre professionnel</Placeholder>}</div>
      {!compact ? (
        <div style={{ marginTop: 8, color: "#4b5563", fontSize: theme.base - 1 }}>
          {contact.length ? contact.join("  ·  ") : <Placeholder>E-mail · téléphone · ville</Placeholder>}
        </div>
      ) : null}
    </header>
  );

  return (
    <div
      ref={ref}
      style={{
        width: A4_WIDTH,
        minHeight: A4_HEIGHT,
        boxSizing: "border-box",
        padding: theme.pad,
        background: "#ffffff",
        color: "#111827",
        fontFamily: theme.font,
        fontSize: theme.base,
        lineHeight: 1.45,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        borderTop: doc.template === "modern" ? `8px solid ${doc.accent}` : undefined,
      }}
    >
      {header}
      {compact ? (
        <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 24, marginTop: 6 }}>
          <aside>
            <section style={{ marginTop: theme.gap }}>
              <h2 style={theme.h2}>Contact</h2>
              <div style={{ display: "grid", gap: 3, color: "#374151", wordBreak: "break-word" }}>
                {contact.length ? contact.map((value) => <span key={value}>{value}</span>) : <Placeholder>E-mail · téléphone</Placeholder>}
              </div>
            </section>
            {parts.skills}
            {parts.langsBlock}
            {parts.certsBlock}
          </aside>
          <div>
            {parts.summary}
            {parts.experience}
            {parts.projectsBlock}
            {parts.education}
          </div>
        </div>
      ) : (
        <>
          {parts.summary}
          {parts.skills}
          {parts.experience}
          {parts.projectsBlock}
          {parts.education}
          {parts.certsBlock}
          {parts.langsBlock}
        </>
      )}
    </div>
  );
}
