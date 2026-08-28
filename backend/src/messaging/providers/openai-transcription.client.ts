import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscriptionProvider } from '../interfaces/transcription-provider.interface';

const TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIPTION_MODEL = 'whisper-1';

interface TranscriptionResponse {
  text: string;
}

@Injectable()
export class OpenAiTranscriptionClient implements TranscriptionProvider {
  constructor(private readonly configService: ConfigService) {}

  async transcribe(audioUrl: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new ServiceUnavailableException('Unable to fetch this recording right now.');
    }
    const audioBlob = await audioResponse.blob();

    const form = new FormData();
    form.append('file', audioBlob, 'recording.m4a');
    form.append('model', TRANSCRIPTION_MODEL);

    const response = await fetch(TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to transcribe this recording right now.');
    }

    const body = (await response.json()) as TranscriptionResponse;
    return body.text;
  }
}
