import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendPasswordReset(to: string, resetUrl: string) {
    await this.send({
      to,
      subject: "Réinitialisation de votre mot de passe HumanIQ",
      text: [
        "Bonjour,",
        "",
        "Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 30 minutes) :",
        resetUrl,
        "",
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
      ].join("\n"),
      html: layout(
        "Choisissez un nouveau mot de passe. Le lien est valable 30 minutes.",
        "Choisir un nouveau mot de passe",
        resetUrl,
      ),
    });
  }

  async sendEmailVerification(to: string, firstName: string, verifyUrl: string) {
    await this.send({
      to,
      subject: "Confirmez votre adresse HumanIQ",
      text: [
        `Bonjour ${firstName},`,
        "",
        "Confirmez votre adresse pour activer la connexion :",
        verifyUrl,
        "",
        "Le lien est valable 24 heures.",
      ].join("\n"),
      html: layout(
        `Bonjour ${escapeHtml(firstName)}, confirmez votre adresse pour activer la connexion. Le lien est valable 24 heures.`,
        "Confirmer mon adresse",
        verifyUrl,
      ),
    });
  }

  async sendTeamInvite(to: string, firstName: string, companyName: string, inviterName: string, url: string) {
    await this.send({
      to,
      subject: `${inviterName} vous invite à rejoindre ${companyName} sur HumanIQ`,
      text: [
        `Bonjour ${firstName},`,
        "",
        `${inviterName} vous invite à rejoindre l'équipe de recrutement de ${companyName} sur HumanIQ.`,
        "Choisissez votre mot de passe pour activer votre accès (lien valable 7 jours) :",
        url,
      ].join("\n"),
      html: layout(
        `Bonjour ${escapeHtml(firstName)}, ${escapeHtml(inviterName)} vous invite à rejoindre l'équipe de recrutement de ${escapeHtml(companyName)}. Choisissez votre mot de passe pour activer votre accès (lien valable 7 jours).`,
        "Rejoindre l'équipe",
        url,
      ),
    });
  }

  /** To the owner(s) of a company: someone with the company's e-mail domain asks to join it. */
  async sendJoinRequest(to: string, firstName: string, applicantName: string, applicantEmail: string, companyName: string, url: string) {
    await this.send({
      to,
      subject: `${applicantName} demande à rejoindre ${companyName} sur HumanIQ`,
      text: [
        `Bonjour ${firstName},`,
        "",
        `${applicantName} (${applicantEmail}) s'est inscrit avec l'adresse e-mail de votre entreprise et demande l'accès à l'espace de recrutement de ${companyName}.`,
        "Acceptez la demande seulement si cette personne doit recruter pour vous. Sinon, refusez-la.",
        "",
        url,
      ].join("\n"),
      html: layout(
        `Bonjour ${escapeHtml(firstName)}, <strong>${escapeHtml(applicantName)}</strong> (${escapeHtml(applicantEmail)}) s'est inscrit avec l'adresse e-mail de votre entreprise et demande l'accès à l'espace de recrutement de ${escapeHtml(companyName)}. Acceptez la demande seulement si cette personne doit recruter pour vous.`,
        "Voir la demande",
        url,
      ),
    });
  }

  /** To the owner: the DNS proof was found, the company is validated. */
  async sendDomainVerified(to: string, firstName: string, companyName: string, domain: string, url: string) {
    await this.send({
      to,
      subject: `${companyName} est vérifiée sur HumanIQ`,
      text: [
        `Bonjour ${firstName},`,
        "",
        `Le domaine ${domain} est vérifié : ${companyName} est validée.`,
        "Votre équipe peut maintenant consulter la CVthèque, le vivier et écrire aux candidats.",
        "",
        url,
      ].join("\n"),
      html: layout(
        `Bonjour ${escapeHtml(firstName)}, le domaine <strong>${escapeHtml(domain)}</strong> est vérifié : ${escapeHtml(companyName)} est validée. Votre équipe peut maintenant consulter la CVthèque, le vivier et écrire aux candidats.`,
        "Ouvrir HumanIQ",
        url,
      ),
    });
  }

  /** To a recruiter whose request to join a company has been accepted. */
  async sendJoinAccepted(to: string, firstName: string, companyName: string, url: string) {
    await this.send({
      to,
      subject: `Votre accès à ${companyName} est ouvert`,
      text: [
        `Bonjour ${firstName},`,
        "",
        `Le responsable de ${companyName} a accepté votre demande : vous pouvez utiliser l'espace de recrutement.`,
        "",
        url,
      ].join("\n"),
      html: layout(
        `Bonjour ${escapeHtml(firstName)}, le responsable de ${escapeHtml(companyName)} a accepté votre demande : vous pouvez maintenant utiliser l'espace de recrutement.`,
        "Ouvrir HumanIQ",
        url,
      ),
    });
  }

  async sendMessageNotification(
    to: string,
    input: { firstName: string; fromName: string; context?: string; preview: string; url: string },
  ) {
    await this.send({ to, ...messageNotificationEmail(input) });
  }

  private async send(message: { to: string; subject: string; text: string; html: string }) {
    if (smtpReady()) {
      await this.sendSmtp(message);
      return;
    }
    await this.sendResend(message);
  }

  private async sendSmtp(message: { to: string; subject: string; text: string; html: string }) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transport.sendMail({
      from: fromAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.log(`Mail sent via SMTP to ${message.to}`);
  }

  private async sendResend(message: { to: string; subject: string; text: string; html: string }) {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) {
      throw new Error("Renseignez le SMTP de la boîte professionnelle, ou RESEND_API_KEY.");
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Resend ${response.status}: ${detail}`);
      throw new Error(resendMessage(detail));
    }
    this.logger.log(`Mail accepted by Resend for ${message.to}`);
  }
}

function smtpReady() {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function fromAddress() {
  return process.env.MAIL_FROM?.trim() || "HumanIQ <onboarding@resend.dev>";
}

function layout(paragraph: string, action: string, href: string) {
  const url = escapeHtml(href);
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#0b1f4b;background:#f4f7fb;padding:32px">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #d5deea;border-radius:16px;padding:28px">
        <p style="margin:0;font-size:20px;font-weight:600;color:#0b1f4b">HumanIQ</p>
        <p style="margin:16px 0 20px;line-height:1.5;color:#0b1f4b">${paragraph}</p>
        <table role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td bgcolor="#0b1f4b" style="border-radius:999px">
              <a href="${url}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(action)}</a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#0b1f4b">Si le bouton ne s'affiche pas, copiez ce lien :</p>
        <p style="margin:8px 0 0;font-size:13px;line-height:1.5;word-break:break-all"><a href="${url}" style="color:#0b1f4b">${url}</a></p>
        <p style="margin:20px 0 0;font-size:12px;color:#5c6d8a">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
      </div>
    </div>`;
}

/** Subject, text and HTML for a "you have a new message" email. Exported so it can be previewed in tests. */
export function messageNotificationEmail(input: {
  firstName: string;
  fromName: string;
  context?: string;
  preview: string;
  url: string;
}) {
  const preview = input.preview.length > 160 ? `${input.preview.slice(0, 157).trimEnd()}…` : input.preview;
  const about = input.context ? ` à propos de « ${input.context} »` : "";
  const url = escapeHtml(input.url);
  return {
    subject: `${input.fromName} vous a écrit sur HumanIQ`,
    text: [
      `Bonjour ${input.firstName},`,
      "",
      `${input.fromName} vous a envoyé un message${about} :`,
      `« ${preview} »`,
      "",
      "Lire et répondre :",
      input.url,
      "",
      "Vous recevez cet e-mail parce qu'un message vous attend sur HumanIQ. Vous pouvez désactiver ces e-mails depuis la page Messages.",
    ].join("\n"),
    html: `
    <div style="font-family:Inter,Arial,sans-serif;color:#0b1f4b;background:#f4f7fb;padding:32px">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #d5deea;border-radius:16px;padding:28px">
        <p style="margin:0;font-size:20px;font-weight:600;color:#1a3585">HumanIQ</p>
        <p style="margin:16px 0 4px;line-height:1.5">Bonjour ${escapeHtml(input.firstName)},</p>
        <p style="margin:0 0 16px;line-height:1.5"><strong>${escapeHtml(input.fromName)}</strong> vous a envoyé un message${escapeHtml(about)} :</p>
        <p style="margin:0 0 20px;padding:12px 14px;background:#f4f7fb;border-left:3px solid #1a3585;border-radius:8px;line-height:1.5;color:#0b1f4b;word-break:break-word;overflow-wrap:anywhere">${escapeHtml(preview)}</p>
        <table role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <td bgcolor="#1a3585" style="border-radius:999px">
              <a href="${url}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-weight:600">Lire et répondre</a>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#5c6d8a">Vous recevez cet e-mail parce qu'un message vous attend sur HumanIQ. Vous pouvez désactiver ces e-mails depuis la page Messages.</p>
      </div>
    </div>`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function resendMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed.message) return parsed.message;
  } catch {
    // Resend sometimes returns plain text.
  }
  return "Le service d'e-mail a refusé l'envoi.";
}
