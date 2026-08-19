import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Object storage for uploaded resumes.
 *
 * Two drivers:
 *  - `local` (default in development): writes under STORAGE_LOCAL_DIR
 *  - `s3`   : any S3-compatible endpoint, using SigV4 via fetch
 *
 * Files are never served from a public URL. The API streams them back only to
 * their owner, so a resume can never be enumerated or indexed.
 */

export interface StoredObject {
  key: string;
  size: number;
}

function safeKey(userId: string, fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().slice(0, 10).replace(/[^a-z.]/g, '');
  const random = crypto.randomBytes(16).toString('hex');
  // The key never contains user-controlled path segments.
  return `resumes/${userId}/${random}${ext}`;
}

async function localPath(key: string): Promise<string> {
  const root = path.resolve(env.STORAGE_LOCAL_DIR);
  const target = path.resolve(root, key);
  // Defence in depth against traversal even though keys are generated.
  if (!target.startsWith(root + path.sep)) {
    throw new Error('Refusing to access a path outside the storage root');
  }
  return target;
}

/** Minimal SigV4 signer, so S3 needs no extra dependency. */
async function signedS3Request(
  method: 'PUT' | 'GET' | 'DELETE',
  key: string,
  body?: Buffer,
  contentType?: string,
): Promise<Response> {
  const host = new URL(env.S3_ENDPOINT).host;
  const url = `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}/${key}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(body ?? '').digest('hex');

  const canonicalHeaders =
    `host:${host}\n` +
    (contentType ? `content-type:${contentType}\n` : '') +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = `host;${contentType ? 'content-type;' : ''}x-amz-content-sha256;x-amz-date`;

  const canonicalRequest = [
    method,
    `/${env.S3_BUCKET}/${key}`,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${env.S3_REGION}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const hmac = (key: Buffer | string, data: string): Buffer =>
    crypto.createHmac('sha256', key).update(data).digest();

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${env.S3_SECRET_ACCESS_KEY}`, dateStamp), env.S3_REGION), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return fetch(url, {
    method,
    body,
    headers: {
      host,
      ...(contentType ? { 'content-type': contentType } : {}),
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${env.S3_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
}

export async function putObject(
  userId: string,
  fileName: string,
  buffer: Buffer,
  contentType: string,
): Promise<StoredObject> {
  const key = safeKey(userId, fileName);

  if (env.STORAGE_DRIVER === 's3') {
    const res = await signedS3Request('PUT', key, buffer, contentType);
    if (!res.ok) throw new Error(`S3 upload failed with ${res.status}`);
    return { key, size: buffer.length };
  }

  const target = await localPath(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  // 0600: readable only by the service account.
  await fs.writeFile(target, buffer, { mode: 0o600 });
  return { key, size: buffer.length };
}

export async function getObject(key: string): Promise<Buffer> {
  if (env.STORAGE_DRIVER === 's3') {
    const res = await signedS3Request('GET', key);
    if (!res.ok) throw new Error(`S3 download failed with ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFile(await localPath(key));
}

export async function deleteObject(key: string): Promise<void> {
  try {
    if (env.STORAGE_DRIVER === 's3') {
      await signedS3Request('DELETE', key);
      return;
    }
    await fs.unlink(await localPath(key));
  } catch (err) {
    // A missing object is already in the desired state.
    logger.warn({ err, key }, 'failed to delete stored object');
  }
}
