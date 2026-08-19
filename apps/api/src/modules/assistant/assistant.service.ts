import type { AssistantMessageDto, AssistantReplyDto } from '@odp/shared';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { truncate } from '../../lib/text';
import { getSkillGap } from '../dashboard/dashboard.service';
import { getUserAnalytics } from '../applications/application.service';
import { buildContextBlock, retrieve, toCitations } from './assistant.retrieval';
import { generateAnswer } from './assistant.responder';

const MAX_HISTORY = 40;

function toMessageDto(row: {
  id: string;
  role: string;
  content: string;
  citations: unknown;
  createdAt: Date;
}): AssistantMessageDto {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    citations: (row.citations as AssistantMessageDto['citations']) ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listConversations(userId: string) {
  const rows = await prisma.assistantConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: { id: true, title: true, updatedAt: true },
  });
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function getConversation(userId: string, conversationId: string) {
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: MAX_HISTORY } },
  });
  if (!conversation) throw new NotFoundError('Conversation');

  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map(toMessageDto),
  };
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const result = await prisma.assistantConversation.deleteMany({
    where: { id: conversationId, userId },
  });
  if (result.count === 0) throw new NotFoundError('Conversation');
}

/**
 * Answers a question.
 *
 * Flow: classify intent → query the real opportunity database → build a
 * grounded context block → generate prose from *only* that block.
 */
export async function ask(
  userId: string,
  question: string,
  conversationId?: string,
): Promise<AssistantReplyDto> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true },
  });

  const conversation = conversationId
    ? await prisma.assistantConversation.findFirst({ where: { id: conversationId, userId } })
    : null;

  if (conversationId && !conversation) throw new NotFoundError('Conversation');

  const activeConversation =
    conversation ??
    (await prisma.assistantConversation.create({
      data: { userId, title: truncate(question, 60) },
    }));

  await prisma.assistantMessage.create({
    data: { conversationId: activeConversation.id, role: 'user', content: question },
  });

  const retrieval = await retrieve(question, userId, { limit: 6 });
  const citations = toCitations(retrieval.items);
  const contextBlock = buildContextBlock(retrieval.items);

  // Non-search intents get extra grounded facts from the user's own data.
  let supplement: string | undefined;
  let supplementData: Parameters<typeof generateAnswer>[0]['supplementData'];

  if (retrieval.intent === 'SKILL_ADVICE') {
    const gap = await getSkillGap(userId);
    // The gap is computed against the user's whole matched market, which is a
    // larger set than the handful of rows retrieved for citation.
    const sampleSize = gap.haveSkills.length + gap.missingSkills.length > 0 ? 60 : 0;
    supplementData = {
      kind: 'SKILL_GAP',
      coverage: gap.matchPercent,
      sampleSize,
      have: gap.haveSkills,
      missing: gap.missingSkills,
      learning: gap.recommendedLearning,
    };
    supplement = [
      `SKILL GAP (computed from the user's profile against their matched opportunities):`,
      `  Skills the user has that are in demand: ${gap.haveSkills.slice(0, 12).join(', ') || 'none recorded'}`,
      `  Most-requested skills the user is missing: ${gap.missingSkills.slice(0, 10).join(', ') || 'none'}`,
      `  Weighted skill coverage: ${gap.matchPercent}%`,
      ...gap.recommendedLearning.map((r) => `  Priority ${r.priority}: ${r.skill} — ${r.reason}`),
    ].join('\n');
  } else if (retrieval.intent === 'APPLICATION_ADVICE') {
    const analytics = await getUserAnalytics(userId);
    supplementData = {
      kind: 'APPLICATION_STATS',
      applications: analytics.applications,
      interviews: analytics.interviews,
      offers: analytics.offers,
      rejections: analytics.rejections,
      responseRate: analytics.responseRatePercent,
      gaps: analytics.topSkillGaps,
    };
    supplement = [
      "APPLICATION HISTORY (the user's own tracked data):",
      `  Applications submitted: ${analytics.applications}`,
      `  Interviews reached: ${analytics.interviews}`,
      `  Offers: ${analytics.offers}`,
      `  Rejections: ${analytics.rejections}`,
      `  Response rate: ${analytics.responseRatePercent}%`,
      `  Most common missing skills across matches: ${
        analytics.topSkillGaps.map((g) => `${g.skill} (${g.count})`).join(', ') || 'none recorded'
      }`,
    ].join('\n');
  }

  const answer = await generateAnswer({
    question,
    intent: retrieval.intent,
    items: retrieval.items,
    citations,
    contextBlock,
    userName: user.name,
    supplement,
    supplementData,
  });

  const message = await prisma.assistantMessage.create({
    data: {
      conversationId: activeConversation.id,
      role: 'assistant',
      content: answer,
      citations: citations as unknown as object,
      usedFilters: retrieval.filters as unknown as object,
    },
  });

  await prisma.assistantConversation.update({
    where: { id: activeConversation.id },
    data: { updatedAt: new Date() },
  });

  return {
    conversationId: activeConversation.id,
    message: toMessageDto(message),
    usedFilters: retrieval.filters,
  };
}

/** Starter prompts shown in an empty assistant panel. */
export const SUGGESTED_PROMPTS = [
  'Find internships for me',
  'Which jobs am I eligible for?',
  'What companies are hiring freshers?',
  'Find remote data analyst jobs',
  'Which government jobs can I apply for?',
  'What skills should I learn for AI engineering?',
  'Find opportunities closing this week',
  'Show product companies hiring CSE freshers',
  'Why am I not getting shortlisted?',
];
