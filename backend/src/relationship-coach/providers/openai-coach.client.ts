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
              'You are a supportive dating coach. Given a summary of a user\'s match and messaging engagement, respond with a JSON object containing three string arrays: conversationOpeners, dateIdeas, and profileTips. Keep each suggestion short and actionable. When matchProfilePromptAnswers is non-empty, prioritize conversationOpeners that directly reference one of those specific answers over generic ones.',
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

  async generateSmartReplies(lastMessage: string): Promise<string[]> {
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
              'You are helping someone reply quickly in a dating app chat. Given the other person\'s most recent message, respond with a JSON object containing a single field "replies": an array of 3 short, natural, varied reply options (a few words to one short sentence each) that keep the conversation flowing.',
          },
          {
            role: 'user',
            content: lastMessage,
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to generate smart replies right now.');
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const raw = body.choices[0]?.message?.content ?? '{}';

    let parsed: { replies?: string[] };
    try {
      parsed = JSON.parse(raw) as { replies?: string[] };
    } catch {
      throw new ServiceUnavailableException('Unable to generate smart replies right now.');
    }

    return parsed.replies ?? [];
  }
}
