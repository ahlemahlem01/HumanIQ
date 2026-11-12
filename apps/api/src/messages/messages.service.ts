import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { MailService } from "../auth/mail.service";
import { PrismaService } from "../prisma/prisma.service";

/** Who is calling, as resolved by the JWT strategy. */
export type Viewer = {
  id: string;
  role: string;
  candidate?: { id: string } | null;
  recruiter?: { id: string; companyId: string } | null;
};

type Side = "RECRUITER" | "CANDIDATE";

const MAX_BODY = 4000;
/** If nobody opened the thread after an email, remind at most once per hour. */
const RENOTIFY_AFTER_MS = 60 * 60 * 1000;

function cleanBody(body: unknown) {
  if (typeof body !== "string") throw new BadRequestException("Message invalide.");
  const text = body.trim();
  if (!text) throw new BadRequestException("Le message est vide.");
  if (text.length > MAX_BODY) throw new BadRequestException(`Message trop long (${MAX_BODY} caractères maximum).`);
  return text;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(MailService) private mail: MailService,
  ) {}

  async preferences(viewer: Viewer) {
    const user = await this.prisma.user.findUnique({ where: { id: viewer.id }, select: { messageEmails: true } });
    return { emailNotifications: user?.messageEmails ?? true };
  }

  async setPreferences(viewer: Viewer, input: { emailNotifications?: unknown }) {
    if (typeof input.emailNotifications !== "boolean") throw new BadRequestException("Préférence invalide.");
    await this.prisma.user.update({ where: { id: viewer.id }, data: { messageEmails: input.emailNotifications }, select: { id: true } });
    return { emailNotifications: input.emailNotifications };
  }

  /**
   * Emails the other side about a new message. Throttled so a burst of messages sends one email,
   * and never throws: a mail problem must not stop the message itself.
   */
  private async notify(conversationId: string, viewer: Viewer, from: Side, body: string) {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          company: { select: { name: true } },
          job: { select: { title: true } },
          candidate: {
            select: {
              id: true,
              anonymousVisible: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true, messageEmails: true, anonymizedAt: true } },
            },
          },
        },
      });
      if (!conversation) return;

      const to: Side = from === "RECRUITER" ? "CANDIDATE" : "RECRUITER";
      const readAt = to === "CANDIDATE" ? conversation.candidateReadAt : conversation.recruiterReadAt;
      const notifiedAt = to === "CANDIDATE" ? conversation.candidateNotifiedAt : conversation.recruiterNotifiedAt;
      const alreadyTold = notifiedAt !== null;
      const seenSince = alreadyTold && readAt !== null && readAt > notifiedAt;
      const stale = alreadyTold && Date.now() - notifiedAt.getTime() > RENOTIFY_AFTER_MS;
      if (alreadyTold && !seenSince && !stale) return;

      const sender = await this.prisma.user.findUnique({ where: { id: viewer.id }, select: { firstName: true, lastName: true } });
      const senderName = sender ? `${sender.firstName} ${sender.lastName}` : "Un contact";
      const frontend = process.env.FRONTEND_URL ?? "http://localhost:3100";

      let recipients: { email: string; firstName: string }[];
      let fromName: string;
      let url: string;
      if (to === "CANDIDATE") {
        const user = conversation.candidate.user;
        recipients = user.messageEmails && !user.anonymizedAt ? [user] : [];
        fromName = `${senderName} (${conversation.company.name})`;
        url = `${frontend}/candidat/messages`;
      } else {
        const writers = await this.prisma.message.findMany({
          where: { conversationId, sender: { role: "RECRUITER" }, senderId: { not: viewer.id } },
          distinct: ["senderId"],
          select: { sender: { select: { firstName: true, email: true, messageEmails: true, anonymizedAt: true } } },
        });
        recipients = writers.map((row) => row.sender).filter((user) => user.messageEmails && !user.anonymizedAt);
        const applied =
          (await this.prisma.application.count({ where: { candidateId: conversation.candidateId, job: { companyId: conversation.companyId } } })) > 0;
        fromName = this.candidateLabel(conversation.candidate, applied);
        url = `${frontend}/recruteur/messages?candidate=${conversation.candidateId}`;
      }
      if (!recipients.length) return;

      // Mark first: a second message arriving while we send must not trigger a second email.
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: to === "CANDIDATE" ? { candidateNotifiedAt: new Date() } : { recruiterNotifiedAt: new Date() },
        select: { id: true },
      });
      await Promise.all(
        recipients.map((recipient) =>
          this.mail
            .sendMessageNotification(recipient.email, {
              firstName: recipient.firstName,
              fromName,
              context: conversation.job?.title,
              preview: body,
              url,
            })
            .catch((error) => this.logger.warn(`Notification email failed: ${error instanceof Error ? error.message : error}`)),
        ),
      );
    } catch (error) {
      this.logger.warn(`Notification skipped: ${error instanceof Error ? error.message : error}`);
    }
  }

  private side(viewer: Viewer): { side: Side; companyId?: string; candidateId?: string } {
    if (viewer.role === "RECRUITER" && viewer.recruiter) {
      return { side: "RECRUITER", companyId: viewer.recruiter.companyId };
    }
    if (viewer.role === "CANDIDATE" && viewer.candidate) {
      return { side: "CANDIDATE", candidateId: viewer.candidate.id };
    }
    throw new ForbiddenException("Messagerie réservée aux recruteurs et aux candidats.");
  }

  /** A recruiter can write to a candidate who applied to the company, or who opened their profile. */
  private async canContact(companyId: string, candidateId: string) {
    const [applied, open] = await Promise.all([
      this.prisma.application.count({ where: { candidateId, job: { companyId } } }),
      this.prisma.candidateProfile.count({ where: { id: candidateId, reverseRecruiting: true } }),
    ]);
    return { applied: applied > 0, canContact: applied > 0 || open > 0 };
  }

  private candidateLabel(
    row: { anonymousVisible: boolean; user: { firstName: string; lastName: string } },
    applied: boolean,
  ) {
    // An anonymous profile stays anonymous until the person applies to the company.
    if (row.anonymousVisible && !applied) return `${row.user.firstName[0]}. ${row.user.lastName[0]}.`;
    return `${row.user.firstName} ${row.user.lastName}`;
  }

  async prospect(viewer: Viewer, candidateId: string) {
    const { side, companyId } = this.side(viewer);
    if (side !== "RECRUITER" || !companyId) throw new ForbiddenException("Réservé aux recruteurs.");
    const candidate = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        headline: true,
        location: true,
        anonymousVisible: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!candidate) throw new NotFoundException("Candidat introuvable.");
    const { applied, canContact } = await this.canContact(companyId, candidateId);
    const existing = await this.prisma.conversation.findUnique({
      where: { companyId_candidateId: { companyId, candidateId } },
      select: { id: true },
    });
    return {
      id: candidate.id,
      name: this.candidateLabel(candidate, applied),
      headline: candidate.headline,
      location: candidate.location,
      canContact,
      conversationId: existing?.id ?? null,
    };
  }

  async start(viewer: Viewer, input: { candidateId?: string; jobId?: string; body?: string }) {
    const { side, companyId } = this.side(viewer);
    if (side !== "RECRUITER" || !companyId) throw new ForbiddenException("Réservé aux recruteurs.");
    const body = cleanBody(input.body);
    const candidateId = String(input.candidateId ?? "");
    if (!candidateId) throw new BadRequestException("Candidat manquant.");

    const { canContact } = await this.canContact(companyId, candidateId);
    if (!canContact) throw new ForbiddenException("Ce candidat n'est pas joignable.");

    let jobId: string | undefined;
    if (input.jobId) {
      const job = await this.prisma.job.findFirst({ where: { id: String(input.jobId), companyId }, select: { id: true } });
      if (!job) throw new ForbiddenException("Offre inaccessible.");
      jobId = job.id;
    }

    const now = new Date();
    const conversation = await this.prisma.conversation.upsert({
      where: { companyId_candidateId: { companyId, candidateId } },
      create: { companyId, candidateId, jobId, recruiterReadAt: now },
      update: { ...(jobId ? { jobId } : {}), recruiterReadAt: now },
      select: { id: true },
    });
    await this.prisma.message.create({ data: { conversationId: conversation.id, senderId: viewer.id, body } });
    await this.prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    void this.notify(conversation.id, viewer, "RECRUITER", body);
    return this.thread(viewer, conversation.id);
  }

  async list(viewer: Viewer) {
    const { side, companyId, candidateId } = this.side(viewer);
    const rows = await this.prisma.conversation.findMany({
      where: side === "RECRUITER" ? { companyId } : { candidateId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        company: { select: { name: true } },
        job: { select: { id: true, title: true } },
        candidate: {
          select: {
            id: true,
            headline: true,
            anonymousVisible: true,
            avatarImage: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, senderId: true },
        },
      },
    });

    const appliedIds =
      side === "RECRUITER"
        ? new Set(
            (
              await this.prisma.application.findMany({
                where: { job: { companyId }, candidateId: { in: rows.map((row) => row.candidateId) } },
                select: { candidateId: true },
                distinct: ["candidateId"],
              })
            ).map((row) => row.candidateId),
          )
        : new Set<string>();

    return Promise.all(
      rows.map(async (row) => {
        const unread = await this.unreadIn(row, side);
        const last = row.messages[0];
        return {
          id: row.id,
          counterpart:
            side === "RECRUITER"
              ? {
                  name: this.candidateLabel(row.candidate, appliedIds.has(row.candidateId)),
                  subtitle: row.candidate.headline ?? "Candidat",
                  candidateId: row.candidateId,
                  avatarImage: row.candidate.anonymousVisible && !appliedIds.has(row.candidateId) ? null : row.candidate.avatarImage,
                }
              : { name: row.company.name, subtitle: "Équipe de recrutement", candidateId: null, avatarImage: null },
          job: row.job,
          unread,
          updatedAt: row.updatedAt,
          lastMessage: last ? { body: last.body, createdAt: last.createdAt, mine: last.senderId === viewer.id } : null,
        };
      }),
    );
  }

  private unreadIn(row: { id: string; recruiterReadAt: Date | null; candidateReadAt: Date | null }, side: Side) {
    const readAt = side === "RECRUITER" ? row.recruiterReadAt : row.candidateReadAt;
    return this.prisma.message.count({
      where: {
        conversationId: row.id,
        sender: { role: side === "RECRUITER" ? "CANDIDATE" : "RECRUITER" },
        ...(readAt ? { createdAt: { gt: readAt } } : {}),
      },
    });
  }

  async unread(viewer: Viewer) {
    const { side, companyId, candidateId } = this.side(viewer);
    const rows = await this.prisma.conversation.findMany({
      where: side === "RECRUITER" ? { companyId } : { candidateId },
      select: { id: true, recruiterReadAt: true, candidateReadAt: true },
    });
    const counts = await Promise.all(rows.map((row) => this.unreadIn(row, side)));
    return { count: counts.reduce((total, value) => total + value, 0) };
  }

  private async ownConversation(viewer: Viewer, id: string) {
    const { side, companyId, candidateId } = this.side(viewer);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { id: true, companyId: true, candidateId: true },
    });
    if (!conversation) throw new NotFoundException("Conversation introuvable.");
    const allowed = side === "RECRUITER" ? conversation.companyId === companyId : conversation.candidateId === candidateId;
    if (!allowed) throw new ForbiddenException("Conversation inaccessible.");
    return { side, conversation };
  }

  async thread(viewer: Viewer, id: string) {
    const { side } = await this.ownConversation(viewer, id);
    const row = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
      include: {
        company: { select: { name: true } },
        job: { select: { id: true, title: true } },
        candidate: {
          select: {
            id: true,
            headline: true,
            location: true,
            anonymousVisible: true,
            avatarImage: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 500,
          include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
      },
    });

    // Opening the thread marks everything up to now as read for the caller's side.
    await this.prisma.conversation.update({
      where: { id },
      data: side === "RECRUITER" ? { recruiterReadAt: new Date() } : { candidateReadAt: new Date() },
      select: { id: true },
    });

    let applied = false;
    if (side === "RECRUITER") {
      applied = (await this.prisma.application.count({ where: { candidateId: row.candidateId, job: { companyId: row.companyId } } })) > 0;
    }

    return {
      id: row.id,
      counterpart:
        side === "RECRUITER"
          ? {
              name: this.candidateLabel(row.candidate, applied),
              subtitle: row.candidate.headline ?? "Candidat",
              candidateId: row.candidateId,
              location: row.candidate.location,
            }
          : { name: row.company.name, subtitle: "Équipe de recrutement", candidateId: null, location: null },
      job: row.job,
      messages: row.messages.map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        mine: message.senderId === viewer.id,
        sender: {
          name:
            message.sender.role === "CANDIDATE" && side === "RECRUITER"
              ? this.candidateLabel(row.candidate, applied)
              : `${message.sender.firstName} ${message.sender.lastName}`,
          role: message.sender.role,
        },
      })),
    };
  }

  async send(viewer: Viewer, id: string, input: { body?: string }) {
    const body = cleanBody(input.body);
    const { side } = await this.ownConversation(viewer, id);
    const message = await this.prisma.message.create({
      data: { conversationId: id, senderId: viewer.id, body },
    });
    await this.prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date(), ...(side === "RECRUITER" ? { recruiterReadAt: new Date() } : { candidateReadAt: new Date() }) },
      select: { id: true },
    });
    void this.notify(id, viewer, side, body);
    return { id: message.id, body: message.body, createdAt: message.createdAt, mine: true };
  }
}
