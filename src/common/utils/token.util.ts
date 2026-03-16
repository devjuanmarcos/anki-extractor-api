import { createHash, randomUUID } from 'crypto';

export function generateTokenId(): string {
  return randomUUID();
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
