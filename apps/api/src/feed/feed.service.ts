import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PostKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const authorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  candidate: { select: { headline: true } },
  recruiter: { select: { title: true, company: { select: { name: true } } } },
} as const;

type Author = {
  id: string;
  firstName: string;
  lastName: string;
  candidate: { headline: string | null } | null;
  recruiter: { title: string | null; company: { name: string } } | null;
};

@Injectable()
export class FeedService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async forUser(userId: string) {
    const [profile, follows] = await Promise.all([
      this.prisma.candidateProfile.findUnique({ where: { userId }, select: { skills: true } }),
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    ]);
    const followingIds = follows.map((row) => row.followingId);
    const include = { author: { select: authorSelect } };

    const [followed, ads, others] = await Promise.all([
      this.prisma.post.findMany({
        where: { kind: PostKind.POST, authorId: { in: [userId, ...followingIds] } },
        include,
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.post.findMany({
        where: { kind: PostKind.AD },
        include,
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      this.prisma.post.findMany({
        where: { kind: PostKind.POST, authorId: { notIn: [userId, ...followingIds] } },
        include,
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const skills = (profile?.skills ?? []).map((skill) => skill.toLowerCase());
    const recommended = [...others].sort((a, b) => skillHits(b.body, skills) - skillHits(a.body, skills) || +b.createdAt - +a.createdAt);
    const items = mix(followed, recommended, ads).map((item) =>
      item.author.id === userId ? { ...item, reason: "vous" as const } : item,
    );
    const [stats, savedCount] = await Promise.all([
      this.stats(userId, items.map((item) => item.id)),
      this.prisma.postSave.count({ where: { userId } }),
    ]);
    return { savedCount, items: items.map((item) => ({ ...item, ...stats.get(item.id) })) };
  }

  async create(userId: string, body: string) {
    const post = await this.prisma.post.create({
      data: { authorId: userId, body: body.trim(), kind: PostKind.POST },
      include: { author: { select: authorSelect } },
    });
    const item = { ...toItem(post, "vous"), ...(await this.stats(userId, [post.id])).get(post.id) };
    return item;
  }

  async saved(userId: string) {
    const rows = await this.prisma.postSave.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { post: { include: { author: { select: authorSelect } } } },
      take: 30,
    });
    const items = rows.map((row) => toItem(row.post, row.post.kind === PostKind.AD ? "pub" : "suivi"));
    const stats = await this.stats(userId, items.map((item) => item.id));
    return { items: items.map((item) => ({ ...item, ...stats.get(item.id) })) };
  }

  async comments(postId: string) {
    await this.ownPost(postId);
    const rows = await this.prisma.postComment.findMany({
      where: { postId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { firstName: true, lastName: true } } },
      take: 30,
    });
    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: `${row.user.firstName} ${row.user.lastName}`,
    }));
  }

  async addComment(userId: string, postId: string, body: string) {
    await this.ownPost(postId);
    const row = await this.prisma.postComment.create({
      data: { postId, userId, body: body.trim() },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    return {
      comment: {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        author: `${row.user.firstName} ${row.user.lastName}`,
      },
      ...(await this.stats(userId, [postId])).get(postId),
    };
  }

  like(userId: string, postId: string) {
    return this.toggle(userId, postId, "postLike");
  }

  save(userId: string, postId: string) {
    return this.toggle(userId, postId, "postSave");
  }

  repost(userId: string, postId: string) {
    return this.toggle(userId, postId, "postRepost");
  }

  private async toggle(userId: string, postId: string, model: "postLike" | "postSave" | "postRepost") {
    await this.ownPost(postId);
    const where = { postId_userId: { postId, userId } };
    // The three tables share the same shape; one explicit type keeps the calls type-safe without a union of delegates.
    const table = this.prisma[model] as unknown as {
      findUnique(args: { where: typeof where }): Promise<unknown>;
      delete(args: { where: typeof where }): Promise<unknown>;
      create(args: { data: { postId: string; userId: string } }): Promise<unknown>;
    };
    const existing = await table.findUnique({ where });
    if (existing) await table.delete({ where });
    else await table.create({ data: { postId, userId } });
    return (await this.stats(userId, [postId])).get(postId);
  }

  private async ownPost(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException("Publication introuvable.");
  }

  private async stats(userId: string, postIds: string[]) {
    const empty = { likes: 0, comments: 0, reposts: 0, liked: false, saved: false, reposted: false };
    const map = new Map(postIds.map((id) => [id, { ...empty }]));
    if (!postIds.length) return map;
    const where = { postId: { in: postIds } };
    const [likes, comments, reposts, mineLikes, mineSaves, mineReposts] = await Promise.all([
      this.prisma.postLike.groupBy({ by: ["postId"], where, _count: { _all: true } }),
      this.prisma.postComment.groupBy({ by: ["postId"], where, _count: { _all: true } }),
      this.prisma.postRepost.groupBy({ by: ["postId"], where, _count: { _all: true } }),
      this.prisma.postLike.findMany({ where: { ...where, userId }, select: { postId: true } }),
      this.prisma.postSave.findMany({ where: { ...where, userId }, select: { postId: true } }),
      this.prisma.postRepost.findMany({ where: { ...where, userId }, select: { postId: true } }),
    ]);
    for (const row of likes) map.get(row.postId)!.likes = row._count._all;
    for (const row of comments) map.get(row.postId)!.comments = row._count._all;
    for (const row of reposts) map.get(row.postId)!.reposts = row._count._all;
    for (const row of mineLikes) map.get(row.postId)!.liked = true;
    for (const row of mineSaves) map.get(row.postId)!.saved = true;
    for (const row of mineReposts) map.get(row.postId)!.reposted = true;
    return map;
  }
}

function mix(
  followed: { id: string; body: string; createdAt: Date; author: Author }[],
  recommended: { id: string; body: string; createdAt: Date; author: Author }[],
  ads: { id: string; body: string; createdAt: Date; author: Author }[],
) {
  const items: FeedItem[] = [];
  let ad = 0;
  const length = Math.max(followed.length, recommended.length);
  for (let index = 0; index < length; index += 1) {
    if (followed[index]) items.push(toItem(followed[index], "suivi"));
    if (recommended[index]) items.push(toItem(recommended[index], "recommande"));
    if (index % 2 === 0 && ads[ad]) items.push(toItem(ads[ad], "pub"));
    if (index % 2 === 0) ad += 1;
  }
  while (ads[ad]) items.push(toItem(ads[ad], "pub")), (ad += 1);
  return items;
}

type FeedItem = {
  id: string;
  reason: "suivi" | "recommande" | "pub" | "vous";
  body: string;
  createdAt: Date;
  author: { id: string; firstName: string; lastName: string; headline: string };
};

function toItem(
  post: { id: string; body: string; createdAt: Date; author: Author },
  reason: FeedItem["reason"],
): FeedItem {
  const headline =
    post.author.candidate?.headline ??
    [post.author.recruiter?.title, post.author.recruiter?.company.name].filter(Boolean).join(" · ");
  return {
    id: post.id,
    reason,
    body: post.body,
    createdAt: post.createdAt,
    author: {
      id: post.author.id,
      firstName: post.author.firstName,
      lastName: post.author.lastName,
      headline,
    },
  };
}

function skillHits(body: string, skills: string[]) {
  const text = body.toLowerCase();
  return skills.reduce((count, skill) => count + (skill && text.includes(skill) ? 1 : 0), 0);
}
