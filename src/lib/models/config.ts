export interface ModelConfig {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai-compatible';
  description: string;
  // Anthropic models use the SDK; OpenAI-compatible models use fetch
  apiUrl?: string;
  apiKeyHeader?: string;
  apiKeyEnv?: string; // environment variable name for the API key
  modelId?: string; // for Anthropic SDK model param
}

export const AI_MODELS: ModelConfig[] = [
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    description: 'Anthropic Claude Sonnet - 높은 정확도',
    modelId: 'claude-sonnet-4-20250514',
  },
  {
    id: 'exaone-35-7-8b',
    name: 'EXAONE 3.5 7.8B',
    provider: 'openai-compatible',
    description: 'LG AI Research EXAONE - 빠른 응답',
    apiKeyHeader: 'x-api-key',
    apiKeyEnv: 'EXAONE_API_KEY',
  },
];

export const DEFAULT_MODEL_ID = 'claude-sonnet';

export function getModelConfig(modelId: string): ModelConfig | undefined {
  return AI_MODELS.find((m) => m.id === modelId);
}

/** Server-side only: resolve runtime values from env */
export function resolveModelConfig(config: ModelConfig): ModelConfig & { apiKey?: string; apiUrl?: string } {
  return {
    ...config,
    apiUrl: config.apiUrl || process.env.EXAONE_API_URL,
    apiKey: config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined,
  };
}
