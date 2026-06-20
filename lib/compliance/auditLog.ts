import { db } from '@/db/client';
import { auditLog } from '@/db/schema';

export type ActorType = 'installer_user' | 'system' | 'customer';

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string;
  action: string;
  targetCustomerId?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetCustomerId: entry.targetCustomerId ?? null,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    occurredAt: new Date(),
  });
}

// Convenience wrappers for common audit events
export const audit = {
  strategyGenerated: (customerId: string, strategyId: string, model: string) =>
    writeAuditLog({
      actorType: 'system',
      action: 'strategy.generated',
      targetCustomerId: customerId,
      metadata: { strategyId, model },
    }),

  strategyRegenerated: (customerId: string, strategyId: string, instruction: string) =>
    writeAuditLog({
      actorType: 'installer_user',
      action: 'strategy.regenerated',
      targetCustomerId: customerId,
      metadata: { strategyId, instruction: instruction.slice(0, 200) },
    }),

  replaySimulated: (customerId: string, strategyId: string) =>
    writeAuditLog({
      actorType: 'system',
      action: 'replay.simulated',
      targetCustomerId: customerId,
      metadata: { strategyId },
    }),

  voiceGenerated: (customerId: string, touchId: string, audioUrl: string) =>
    writeAuditLog({
      actorType: 'system',
      action: 'voice.generated',
      targetCustomerId: customerId,
      metadata: { touchId, audioUrl },
    }),

  personaInferred: (customerId: string, confidence: number) =>
    writeAuditLog({
      actorType: 'system',
      action: 'persona.inferred',
      targetCustomerId: customerId,
      metadata: { confidence },
    }),

  managerPdfExported: (customerId: string, strategyId: string) =>
    writeAuditLog({
      actorType: 'installer_user',
      action: 'export.manager_pdf',
      targetCustomerId: customerId,
      metadata: { strategyId },
    }),
};
