import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

/**
 * Email delivery.
 *
 * With no SMTP host configured the mailer logs the message instead of sending
 * it, so local development and tests never attempt real delivery.
 */

let transporter: Transporter | null = null;
let initialised = false;

function getTransporter(): Transporter | null {
  if (initialised) return transporter;
  initialised = true;

  if (!env.SMTP_HOST) {
    logger.info('SMTP is not configured — emails will be logged, not sent');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(message: MailMessage): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    logger.info({ to: message.to, subject: message.subject }, 'email (not sent — SMTP disabled)');
    return false;
  }

  try {
    await transport.sendMail({ from: env.MAIL_FROM, ...message });
    return true;
  } catch (err) {
    logger.error({ err, to: message.to }, 'failed to send email');
    return false;
  }
}

/** Wraps body copy in the platform's plain, readable email shell. */
export function renderEmail(title: string, bodyLines: string[], ctaUrl?: string, ctaLabel?: string): { text: string; html: string } {
  const text = [title, '', ...bodyLines, '', ctaUrl ? `${ctaLabel ?? 'Open'}: ${ctaUrl}` : '']
    .filter((l) => l !== undefined)
    .join('\n');

  const escape = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escape(title)}</h1>
    ${bodyLines.map((line) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151">${escape(line)}</p>`).join('')}
    ${
      ctaUrl
        ? `<p style="margin:24px 0 0"><a href="${escape(ctaUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:15px;font-weight:600">${escape(ctaLabel ?? 'Open')}</a></p>`
        : ''
    }
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px" />
    <p style="margin:0;font-size:12px;color:#6b7280">
      You are receiving this because you enabled notifications on Opportunity Discovery.
      Manage your preferences at ${escape(env.PUBLIC_SITE_URL)}/settings/notifications.
    </p>
  </div>
</body></html>`;

  return { text, html };
}
