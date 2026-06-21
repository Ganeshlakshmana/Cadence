import { db, auditLog } from '@/db/schema';

const now = () => Math.floor(Date.now() / 1000);

export interface AuditEntry {
  actor: string;       // e.g. 'system', 'installer_user', customer id
  action: string;
  entityType?: string; // e.g. 'customer', 'sequence', 'touchpoint'
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actor:      entry.actor,
    action:     entry.action,
    entityType: entry.entityType ?? null,
    entityId:   entry.entityId ?? null,
    metadata:   entry.metadata ? JSON.stringify(entry.metadata) : null,
    createdAt:  now(),
  });
}

export const audit = {
  sequenceGenerated: (customerId: string, sequenceId: string, model: string) =>
    writeAuditLog({
      actor:      'system',
      action:     'sequence.generated',
      entityType: 'sequence',
      entityId:   sequenceId,
      metadata:   { customerId, model },
    }),

  sequenceRegenerated: (customerId: string, sequenceId: string, instruction: string) =>
    writeAuditLog({
      actor:      'installer_user',
      action:     'sequence.regenerated',
      entityType: 'sequence',
      entityId:   sequenceId,
      metadata:   { customerId, instruction: instruction.slice(0, 200) },
    }),

  replaySimulated: (customerId: string, sequenceId: string) =>
    writeAuditLog({
      actor:      'system',
      action:     'replay.simulated',
      entityType: 'sequence',
      entityId:   sequenceId,
      metadata:   { customerId },
    }),

  voiceGenerated: (customerId: string, touchId: string, audioUrl: string) =>
    writeAuditLog({
      actor:      'system',
      action:     'voice.generated',
      entityType: 'touchpoint',
      entityId:   touchId,
      metadata:   { customerId, audioUrl },
    }),

  managerPdfExported: (customerId: string, sequenceId: string) =>
    writeAuditLog({
      actor:      'installer_user',
      action:     'export.manager_pdf',
      entityType: 'sequence',
      entityId:   sequenceId,
      metadata:   { customerId },
    }),
};
