import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentModerator, ModerationResult } from '../interfaces/content-moderator.interface';

const MODERATION_URL = 'https://api.openai.com/v1/moderations';

interface ModerationResponse {
  results: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
  }>;
}

@Injectable()
export class OpenAiContentModerator implements ContentModerator {
  constructor(private readonly configService: ConfigService) {}

  async moderate(text: string): Promise<ModerationResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';

    const response = await fetch(MODERATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: text }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to check this message right now.');
    }
    const body = (await response.json()) as ModerationResponse;
    const result = body.results[0];

    return {
      flagged: result?.flagged ?? false,
      categories: Object.entries(result?.categories ?? {})
        .filter(([, isFlagged]) => isFlagged)
        .map(([category]) => category),
    };
  }
}
