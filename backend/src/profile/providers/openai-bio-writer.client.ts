import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BioGenerationContext,
  BioSuggestions,
  BioWriterProvider,
} from '../interfaces/bio-writer-provider.interface';

const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatCompletionResponse {
  choices: Array<{ message?: { content?: string } }>;
}

@Injectable()
export class OpenAiBioWriterClient implements BioWriterProvider {
  constructor(private readonly configService: ConfigService) {}

  async generateBio(context: BioGenerationContext): Promise<BioSuggestions> {
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
              'You are a witty, warm dating-profile bio writer. Given a JSON object describing a user\'s personalityTraits, hobbies, humorStyle, and optionally an existingBio, respond with a JSON object containing one string array: bios, with 3 distinct short bio options (each under 300 characters). When existingBio is non-null, treat this as a rewrite/polish task - keep its core facts and voice, just sharpen it - rather than writing generic bios from scratch.',
          },
          {
            role: 'user',
            content: JSON.stringify(context),
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to generate bio suggestions right now.');
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const raw = body.choices[0]?.message?.content ?? '{}';

    let parsed: Partial<BioSuggestions>;
    try {
      parsed = JSON.parse(raw) as Partial<BioSuggestions>;
    } catch {
      throw new ServiceUnavailableException('Unable to generate bio suggestions right now.');
    }

    return { bios: parsed.bios ?? [] };
  }
}
