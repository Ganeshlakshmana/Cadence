import { anthropic, SONNET } from './client';
import { ManagerOnePagerSchema, type ManagerOnePager, type Strategy } from './schemas';
import { MANAGER_ONE_PAGER_SYSTEM } from './prompts';

const MANAGER_ONE_PAGER_TOOL = {
  name: 'generate_manager_one_pager',
  description: 'Return the one-page deal brief for the sales manager.',
  input_schema: {
    type: 'object' as const,
    properties: {
      dealHeader: { type: 'string' },
      myRead: { type: 'string' },
      myPlan: { type: 'string' },
      risksAndMitigations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            risk: { type: 'string' },
            mitigation: { type: 'string' },
          },
          required: ['risk', 'mitigation'],
        },
      },
      whereIneedHelp: { type: 'string' },
      closeTargetDate: { type: 'string' },
      expectedOutcome: { type: 'string' },
    },
    required: ['dealHeader', 'myRead', 'myPlan', 'risksAndMitigations', 'whereIneedHelp', 'closeTargetDate', 'expectedOutcome'],
  },
};

interface ManagerOnePagerInput {
  customerFirstName: string;
  customerLastName: string;
  totalPrice: number;
  currency: string;
  archetypeBlend: { family: number; investor: number; environmentalist: number; skeptic: number };
  strategy: Strategy;
  ghostRiskScore: number;
  closeReadinessScore: number;
  installerName?: string;
}

export async function generateManagerOnePager(input: ManagerOnePagerInput): Promise<ManagerOnePager> {
  const dominant = Object.entries(input.archetypeBlend)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([k, v]) => `${Math.round(v * 100)}% ${k.charAt(0).toUpperCase() + k.slice(1)}`)
    .join(', ');

  const userPrompt = `DEAL:
Customer: ${input.customerFirstName} ${input.customerLastName}
Value: ${input.currency}${input.totalPrice.toLocaleString()}
Archetype: ${dominant}
Ghost risk: ${(input.ghostRiskScore * 100).toFixed(0)}%
Close readiness: ${(input.closeReadinessScore * 100).toFixed(0)}%

STRATEGY SUMMARY:
${input.strategy.rationaleSummary}

TOUCHPOINTS (${input.strategy.touches.length} total over 30 days):
${input.strategy.touches.map(t =>
  `  Day ${t.dayOffset}: [${t.channel}] ${t.objective}`
).join('\n')}

INSTALLER: ${input.installerName ?? 'Solar Sales Rep'}

Generate the manager one-pager. dealHeader should be: "${input.customerFirstName} ${input.customerLastName} — ${input.currency}${input.totalPrice.toLocaleString()} — ${dominant}"`;

  const call = async (strictMode = false): Promise<ManagerOnePager> => {
    const systemPrompt = strictMode
      ? MANAGER_ONE_PAGER_SYSTEM + '\n\nCRITICAL: Previous attempt failed validation. Use the tool exactly.'
      : MANAGER_ONE_PAGER_SYSTEM;

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 2048,
      system: systemPrompt,
      tools: [MANAGER_ONE_PAGER_TOOL],
      tool_choice: { type: 'tool', name: 'generate_manager_one_pager' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      throw new Error('Manager one-pager: no tool_use block in response');
    }

    return ManagerOnePagerSchema.parse(block.input);
  };

  try {
    return await call(false);
  } catch (err) {
    console.warn('Manager one-pager failed validation, retrying:', err);
    return await call(true);
  }
}
