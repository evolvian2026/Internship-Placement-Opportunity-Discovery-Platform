import { NOT_SPECIFIED, type AssistantCitation, type OpportunitySummaryDto } from '@odp/shared';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { formatLongDate } from '../../lib/dates';
import type { Intent } from './assistant.retrieval';

/**
 * Answer generation.
 *
 * Two paths, and the deterministic one is not a degraded fallback: it answers
 * every supported question from real database rows. When an API key is present
 * the LLM only *rewrites* that same grounded context into prose — it is given
 * no ability to introduce an opportunity, deadline or link of its own.
 */

const SYSTEM_PROMPT = `You are the career assistant for an off-campus opportunity discovery platform used by Indian students and fresh graduates.

Absolute rules:
- Use ONLY the opportunities in the CONTEXT block. Never invent a company, role, salary, deadline, eligibility criterion, vacancy count or application link.
- If the CONTEXT is "NO_MATCHING_OPPORTUNITIES", say plainly that nothing in the database matches and suggest how to widen the search. Do not offer examples from memory.
- When you mention an opportunity, cite it by its bracketed number, e.g. [1].
- Never state that a user is eligible when the context says the eligibility is NEEDS_REVIEW; say what still needs checking.
- Never tell a user to pay a fee to apply, except where the context explicitly lists an official government application fee.
- Direct users to apply through the official application link shown in the context.
- Be concise and practical. Prefer short paragraphs and tight bullet lists.
- Write for an Indian audience: ₹, LPA, CGPA, batch year are all normal vocabulary.`;

export interface ResponderInput {
  question: string;
  intent: Intent;
  items: OpportunitySummaryDto[];
  citations: AssistantCitation[];
  contextBlock: string;
  userName?: string;
  /** Extra grounded facts for non-search intents, formatted for the LLM. */
  supplement?: string;
  /** The same facts as structured data, so the deterministic path can write
   *  prose instead of echoing the machine-readable block. */
  supplementData?:
    | { kind: 'SKILL_GAP'; coverage: number; sampleSize: number; have: string[]; missing: string[]; learning: { skill: string; reason: string; priority: number }[] }
    | { kind: 'APPLICATION_STATS'; applications: number; interviews: number; offers: number; rejections: number; responseRate: number; gaps: { skill: string; count: number }[] };
}

/* ------------------------------------------------------------------ *
 * Deterministic responder
 * ------------------------------------------------------------------ */

function describeOpportunity(item: OpportunitySummaryDto, index: number): string {
  const compensation = item.stipendLabel ?? item.salaryLabel;
  const deadline = item.applicationDeadline
    ? (formatLongDate(new Date(item.applicationDeadline)) ?? NOT_SPECIFIED)
    : NOT_SPECIFIED;

  const bits = [
    `**[${index + 1}] ${item.title}** — ${item.organizationName}`,
    `• Location: ${item.locationLabel} · ${item.workMode.toLowerCase()}`,
    `• Eligibility: ${item.educationLabel} · ${item.experienceLabel}`,
    `• ${compensation === NOT_SPECIFIED ? 'Compensation: Not Specified' : `Compensation: ${compensation}`}`,
    `• Deadline: ${deadline}`,
    `• Source: ${item.sourceName}`,
  ];

  if (item.match) bits.splice(1, 0, `• Match: ${item.match.overall}%`);
  if (item.eligibility?.verdict === 'NEEDS_REVIEW') {
    bits.push(
      `• ⚠ Eligibility needs review: ${item.eligibility.unknown.map((u) => u.label).join(', ')}`,
    );
  }
  if (item.eligibility?.verdict === 'NOT_ELIGIBLE') {
    bits.push(`• ✗ You do not meet: ${item.eligibility.failed.map((f) => f.message).join('; ')}`);
  }
  bits.push(`• Apply: ${item.applicationUrl}`);

  return bits.join('\n');
}

/** Prose for the two intents that answer from the user's own data. */
function respondFromSupplement(input: ResponderInput): string | null {
  const data = input.supplementData;
  if (!data) return null;

  if (data.kind === 'SKILL_GAP') {
    const lines: string[] = [];
    lines.push(
      `Across the ${data.sampleSize} opportunities that best match your profile, your skills cover **${data.coverage}%** of what employers are asking for.`,
    );

    if (data.have.length) {
      lines.push('', '**Skills you already have that are in demand**', data.have.slice(0, 10).map((s) => `• ${s}`).join('\n'));
    }

    if (data.learning.length) {
      lines.push(
        '',
        '**What to learn next**',
        data.learning.map((l) => `${l.priority}. **${l.skill}** — ${l.reason}`).join('\n'),
      );
    } else if (data.missing.length === 0) {
      lines.push('', 'You already cover every skill these opportunities list. Focus on depth and projects rather than new tools.');
    }

    lines.push(
      '',
      'This is computed from the skills listed on real postings in the database — not from a generic curriculum.',
    );
    return lines.join('\n');
  }

  const lines: string[] = [];
  lines.push(
    data.applications === 0
      ? 'You have not tracked any submitted applications yet, so there is nothing to diagnose from your history.'
      : `You have tracked **${data.applications}** application${data.applications === 1 ? '' : 's'}: ${data.interviews} reached an interview stage, ${data.offers} resulted in an offer and ${data.rejections} were rejected. That is a **${data.responseRate}%** response rate.`,
  );

  if (data.applications > 0) {
    if (data.responseRate < 20) {
      lines.push(
        '',
        '**Most likely causes of a low response rate**',
        '• Applying to roles where your eligibility is only partly met — filter by "Eligible only" before applying',
        '• A skills gap against what the postings actually list (see below)',
        '• Applying close to the deadline, when shortlisting has often already begun',
      );
    } else if (data.interviews === 0) {
      lines.push('', 'Your applications are landing, but none has converted to an interview yet. Widening to more roles where your match score is above 80% usually helps.');
    }
  }

  if (data.gaps.length) {
    lines.push(
      '',
      '**Skills most often missing from your matched opportunities**',
      data.gaps.slice(0, 5).map((g) => `• ${g.skill} — appears in ${g.count} of them`).join('\n'),
    );
  }

  lines.push('', 'Everything above comes from your own tracked applications and match scores.');
  return lines.join('\n');
}

export function respondDeterministically(input: ResponderInput): string {
  const { items, intent, supplement } = input;

  if (intent === 'SKILL_ADVICE' || intent === 'APPLICATION_ADVICE') {
    const prose = respondFromSupplement(input);
    if (prose) {
      // Attach any retrieved opportunities as supporting evidence.
      return items.length
        ? `${prose}\n\n**Opportunities these numbers came from**\n\n${items.slice(0, 3).map(describeOpportunity).join('\n\n')}`
        : prose;
    }
  }

  if (items.length === 0 && intent !== 'SKILL_ADVICE' && intent !== 'APPLICATION_ADVICE') {
    return [
      'I could not find anything in the opportunity database matching that.',
      '',
      'Things that usually help:',
      '• Widen the location, or include remote roles',
      '• Remove the graduation-year or degree filter',
      '• Try a broader role title (for example "analyst" instead of "senior data analyst")',
      '',
      'I only answer from opportunities currently in the database, so I will not guess at listings that are not here.',
    ].join('\n');
  }

  const header = (() => {
    switch (intent) {
      case 'CHECK_ELIGIBILITY':
        return `Here ${items.length === 1 ? 'is' : 'are'} ${items.length} opportunit${items.length === 1 ? 'y' : 'ies'} you are eligible for, based on your profile:`;
      case 'DEADLINES':
        return `${items.length} opportunit${items.length === 1 ? 'y is' : 'ies are'} closing soon:`;
      case 'COMPANIES_HIRING': {
        const orgs = [...new Set(items.map((i) => i.organizationName))];
        return `${orgs.length} organisation${orgs.length === 1 ? '' : 's'} in the database ${orgs.length === 1 ? 'has' : 'have'} matching openings — ${orgs.join(', ')}:`;
      }
      case 'SKILL_ADVICE':
        return supplement ? '' : 'Based on the opportunities matching your profile:';
      case 'APPLICATION_ADVICE':
        return supplement ? '' : 'Here is what your tracked applications show:';
      default:
        return `Found ${items.length} matching opportunit${items.length === 1 ? 'y' : 'ies'}:`;
    }
  })();

  const body = items.map(describeOpportunity).join('\n\n');

  const footer = (() => {
    if (intent === 'CHECK_ELIGIBILITY') {
      return '\n\nEligibility is computed from the criteria each posting publishes. Where a criterion is marked "needs review", confirm it on the official notification before applying.';
    }
    if (items.some((i) => i.fraudFlags.length > 0)) {
      return '\n\n⚠ One or more of these carries a caution flag. Verify the posting on its official source before sharing personal details.';
    }
    return '\n\nApply through the official link on each opportunity — applications are never submitted from this platform.';
  })();

  return [supplement, header, body].filter(Boolean).join('\n\n') + footer;
}

/* ------------------------------------------------------------------ *
 * LLM responder
 * ------------------------------------------------------------------ */

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
}

async function callAnthropic(input: ResponderInput): Promise<string | null> {
  const userMessage = [
    input.userName ? `The user's name is ${input.userName}.` : '',
    input.supplement ? `ADDITIONAL GROUNDED FACTS:\n${input.supplement}` : '',
    `CONTEXT (the only opportunities you may reference):\n${input.contextBlock}`,
    '',
    `USER QUESTION: ${input.question}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.ASSISTANT_MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'assistant LLM call failed');
      return null;
    }

    const payload = (await res.json()) as AnthropicResponse;
    const text = payload.content
      ?.filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();

    return text || null;
  } catch (err) {
    logger.warn({ err }, 'assistant LLM call errored');
    return null;
  }
}

export async function generateAnswer(input: ResponderInput): Promise<string> {
  if (env.ANTHROPIC_API_KEY && env.ASSISTANT_ENABLED) {
    const llm = await callAnthropic(input);
    // A failed LLM call must never lose the user's answer.
    if (llm) return llm;
  }
  return respondDeterministically(input);
}

export { SYSTEM_PROMPT };
