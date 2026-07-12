import type { IntelligenceResult, Review, VoiceProfile } from '../domain/types';
import { intelligenceResponseSchema } from '../domain/schemas';
import { assessDeterministically } from '../domain/policies';
import { AppError } from '../lib/errors';

export interface ReviewIntelligence {
  classifyAndDraft(review: Review, voice: VoiceProfile): Promise<IntelligenceResult>;
}

function dispositionFor(risk: 'green' | 'amber' | 'red' | 'unknown') {
  if (risk === 'red') return 'escalate' as const;
  if (risk === 'amber') return 'reply_and_move_offline' as const;
  return 'reply_publicly' as const;
}

function sentimentFor(rating: number) {
  if (rating >= 4) return 'positive' as const;
  if (rating === 3) return 'mixed' as const;
  return 'negative' as const;
}

export class RuleBasedIntelligence implements ReviewIntelligence {
  async classifyAndDraft(review: Review, voice: VoiceProfile): Promise<IntelligenceResult> {
    const startedAt = Date.now();
    const assessment = assessDeterministically(review.originalText, review.rating);
    const name = review.reviewerDisplayName?.trim();
    const greeting = name ? `Thank you, ${name},` : 'Thank you for sharing this with us.';
    const preferred = voice.preferredPhrases[0];

    let draft: string;
    let strategy: string;
    if (assessment.risk === 'red') {
      strategy = 'Escalate; do not use routine drafting.';
      draft = 'Thank you for bringing this serious concern to our attention. We are treating it carefully and would like to continue through our approved private contact channel so the appropriate person can review the details.';
    } else if (assessment.risk === 'amber') {
      strategy = 'Acknowledge the reported experience, avoid unverified facts, and move the conversation offline.';
      draft = `${greeting} We’re sorry that your experience did not go as expected. ${preferred ? `${preferred} ` : ''}We would like to understand the details and have the appropriate team member review what happened. Please contact us through our approved channel${voice.contactChannel ? ` at ${voice.contactChannel}` : ''}.`;
    } else {
      strategy = 'Thank the reviewer, reference the experience without inventing details, and invite a return visit.';
      draft = `${greeting} We’re glad you enjoyed your experience with us. ${preferred ? `${preferred} ` : ''}We appreciate your support and look forward to welcoming you again.`;
    }

    return {
      classification: {
        primaryCategory: assessment.primaryCategory,
        secondaryCategories: [],
        sentiment: sentimentFor(review.rating),
        risk: assessment.risk,
        confidence: assessment.policyFlags.length > 0 ? 'high' : 'medium',
        urgency: assessment.risk === 'red' ? 'immediate' : assessment.risk === 'amber' ? 'same_business_day' : 'normal',
        language: review.originalLanguage ?? voice.defaultLanguage,
        serviceMode: review.serviceMode,
        safeFacts: [`The reviewer left a ${review.rating}-star review.`, 'The reviewer described their own experience.'],
        unverifiedClaims: review.rating <= 3 ? ['The underlying cause of the reported experience.'] : [],
        contextQuestions: assessment.risk === 'amber' ? ['Can the visit or order be identified before making a factual claim?'] : [],
        recommendedDisposition: dispositionFor(assessment.risk),
        riskReason: assessment.riskReason,
        replyStrategyReason: strategy,
        policyFlags: assessment.policyFlags,
      },
      ...(assessment.risk !== 'green' ? {
        internalAction: {
          actionType: assessment.primaryCategory.toLowerCase(),
          description: `Assign an authorised manager to verify the facts behind this ${assessment.primaryCategory.toLowerCase()} review before making any specific public claim.`,
          suggestedOwnerRole: 'action_owner' as const,
          priority: assessment.risk === 'red' ? 'immediate' as const : 'high' as const,
        },
      } : {}),
      strategy,
      draft,
      provider: 'tablevoice',
      model: 'deterministic-fallback',
      promptVersion: 'phase1-rules-v1',
      rawOutput: { assessment },
      latencyMs: Date.now() - startedAt,
    };
  }
}

interface AnthropicTextBlock { type: string; text?: string }
interface AnthropicResponse { content?: AnthropicTextBlock[] }

export class AnthropicIntelligence implements ReviewIntelligence {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fallback: ReviewIntelligence = new RuleBasedIntelligence(),
  ) {}

  async classifyAndDraft(review: Review, voice: VoiceProfile): Promise<IntelligenceResult> {
    const deterministic = assessDeterministically(review.originalText, review.rating);
    if (deterministic.risk === 'red') return this.fallback.classifyAndDraft(review, voice);

    const startedAt = Date.now();
    const prompt = this.prompt(review, voice, deterministic);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1800,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new AppError(`Model request failed with ${response.status}.`, 502, 'model_error');
    }
    const body = await response.json() as AnthropicResponse;
    const text = body.content?.find((block) => block.type === 'text')?.text;
    if (!text) throw new AppError('Model returned no text content.', 502, 'model_error');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      throw new AppError('Model output was not valid JSON.', 502, 'model_schema_error');
    }
    const validated = intelligenceResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new AppError('Model output failed the intelligence schema.', 502, 'model_schema_error', validated.error.flatten());
    }
    if (deterministic.risk === 'amber' && validated.data.classification.risk === 'green') {
      validated.data.classification.risk = 'amber';
      validated.data.classification.policyFlags.push('deterministic_risk_floor');
    }

    return {
      ...validated.data,
      provider: 'anthropic',
      model: this.model,
      promptVersion: 'phase1-claude-v1',
      rawOutput: parsed,
      latencyMs: Date.now() - startedAt,
    };
  }

  private prompt(review: Review, voice: VoiceProfile, deterministic: ReturnType<typeof assessDeterministically>): string {
    return `You are Tablevoice, a safety-first restaurant review operations copilot.
Return only one JSON object matching the specified shape. Do not include markdown or hidden reasoning.

Rules:
- Never invent an investigation, contact, refund, replacement, discount, staff action, order detail, or cause.
- Red-risk cases must recommend escalation and must not receive a routine confident reply.
- Separate public response from internal operational action.
- Use concise reasons and uncertainty markers, not chain-of-thought.
- The deterministic risk is a floor: ${deterministic.risk} (${deterministic.riskReason}).

Restaurant voice:
${JSON.stringify(voice)}

Review:
${JSON.stringify({ rating: review.rating, text: review.originalText, language: review.originalLanguage, serviceMode: review.serviceMode })}

JSON shape:
{
  "classification": {
    "primaryCategory": "PRAISE|FOOD_TASTE|PORTION|PRICE|SPEED|STAFF|HYGIENE|DELIVERY_DELAY|MISSING_ITEM|WRONG_ORDER|PACKAGING|AMBIENCE|PARKING|BILLING|RESERVATION|LISTING_INFO|SAFETY|HARASSMENT|FRAUD|FAKE_SUSPECTED|OTHER",
    "secondaryCategories": [],
    "sentiment": "positive|mixed|negative|neutral|unclear",
    "risk": "green|amber|red|unknown",
    "confidence": "high|medium|low",
    "urgency": "immediate|same_business_day|normal",
    "language": "string",
    "serviceMode": "dine_in|delivery|takeaway|unknown",
    "safeFacts": ["string"],
    "unverifiedClaims": ["string"],
    "contextQuestions": ["string"],
    "recommendedDisposition": "reply_publicly|reply_and_move_offline|request_context|report_and_consider_no_reply|do_not_reply|escalate",
    "riskReason": "short string",
    "replyStrategyReason": "short string",
    "policyFlags": ["string"]
  },
  "internalAction": {
    "actionType": "string",
    "description": "specific assignable action",
    "suggestedOwnerRole": "buyer|approver|operator|action_owner|viewer",
    "priority": "low|medium|high|immediate"
  },
  "strategy": "short public response strategy",
  "draft": "public reply only"
}`;
  }
}

export function intelligenceForEnv(env: CloudflareBindings): ReviewIntelligence {
  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL) {
    return new AnthropicIntelligence(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
  }
  return new RuleBasedIntelligence();
}
