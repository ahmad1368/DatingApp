import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranslationProvider } from '../interfaces/translation-provider.interface';

const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatCompletionResponse {
  choices: Array<{ message?: { content?: string } }>;
}

@Injectable()
export class OpenAiTranslationClient implements TranslationProvider {
  constructor(private readonly configService: ConfigService) {}

  async translate(text: string, targetLanguage: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';

    const response = await fetch(CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              `Translate the user's message into ${targetLanguage}. Reply with only the ` +
              'translated text and nothing else. If the message is already in ' +
              `${targetLanguage}, reply with it unchanged.`,
          },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to translate this message right now.');
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const translated = body.choices[0]?.message?.content?.trim();
    if (!translated) {
      throw new ServiceUnavailableException('Unable to translate this message right now.');
    }

    return translated;
  }
}
