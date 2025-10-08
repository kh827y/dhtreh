import Ajv, { JSONSchemaType } from 'ajv';

export type Provider = 'EVOTOR' | 'MODULKASSA' | 'POSTER' | 'ATOL';

export interface EvotorConfig {
  stores?: any[];
  devices?: any[];
  webhookUrl?: string;
}

export interface ModulKassaConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface PosterConfig {
  appId: string;
  appSecret: string;
}

export type IntegrationConfig =
  | EvotorConfig
  | ModulKassaConfig
  | PosterConfig
  | Record<string, unknown>;

const ajv = new Ajv({ allErrors: true, removeAdditional: true });

const evotorSchema: JSONSchemaType<EvotorConfig> = {
  type: 'object',
  additionalProperties: true,
  properties: {
    stores: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
      nullable: true,
    },
    devices: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
      nullable: true,
    },
    webhookUrl: { type: 'string', nullable: true },
  },
  required: [],
};

const modulKassaSchema: JSONSchemaType<ModulKassaConfig> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    apiKey: { type: 'string' },
    baseUrl: { type: 'string', nullable: true },
  },
  required: ['apiKey'],
};

const posterSchema: JSONSchemaType<PosterConfig> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    appId: { type: 'string' },
    appSecret: { type: 'string' },
  },
  required: ['appId', 'appSecret'],
};

const validators = {
  EVOTOR: ajv.compile(evotorSchema),
  MODULKASSA: ajv.compile(modulKassaSchema),
  POSTER: ajv.compile(posterSchema),
  ATOL: ajv.compile({ type: 'object', additionalProperties: true }),
} as const;

export function validateIntegrationConfig(
  provider: Provider,
  config: unknown,
): { ok: true } | { ok: false; errors: string[] } {
  const v = (validators as any)[provider];
  if (!v) return { ok: false, errors: ['Unknown provider'] };
  const ok = v(config);
  if (ok) return { ok: true };
  const errors = (v.errors || []).map(
    (e: any) => `${e.instancePath || e.schemaPath} ${e.message}`,
  );
  return { ok: false, errors };
}
