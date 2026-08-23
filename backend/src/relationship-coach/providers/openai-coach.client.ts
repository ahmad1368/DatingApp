import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiCoachProvider,
  CoachEngagementContext,
  CoachSuggestions,
} from '../interfaces/ai-coach-provider.interface';

const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatCompletionResponse {
  choices: Array<{ message?: { content?: string } }>;
}

@Injectable()
export class OpenAiCoachClient implements AiCoachProvider {
  constructor(private readonly configService: ConfigService) {}

  async generateSuggestions(context: CoachEngagementContext): Promise<CoachSuggestions> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';

    const response = await fetch(CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a supportive dating coach. Given a summary of a user\'s match and messaging engagement, respond with a JSON object containing three string arrays: conversationOpeners, dateIdeas, and profileTips. Keep each suggestion short and actionable.',
          },
          {
            role: 'user',
            content: JSON.stringify(context),
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to generate coaching tips right now.');
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const raw = body.choices[0]?.message?.content ?? '{}';

    let parsed: Partial<CoachSuggestions>;
    try {
      parsed = JSON.parse(raw) as Partial<CoachSuggestions>;
    } catch {
      throw new ServiceUnavailableException('Unable to generate coaching tips right now.');
    }

    return {
      conversationOpeners: parsed.conversationOpeners ?? [],
      dateIdeas: parsed.dateIdeas ?? [],
      profileTips: parsed.profileTips ?? [],
    };
  }
}
