import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "./installer";
import { safeWriteFile } from "./utils";
import DEFAULT_MODELS, { type DefaultModel } from "./default-models";
import { yamlToJson, jsonToYaml } from "./rust-bridge";

export interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  aliases?: string[];
  apiMode?: string;
}

function configFile(): string {
  return join(HERMES_HOME, "config.yaml");
}

function readYaml(): Record<string, any> {
  const path = configFile();
  if (!existsSync(path)) return {};
  try {
    return yamlToJson(readFileSync(path, "utf-8")) || {};
  } catch {
    return {};
  }
}

function writeYaml(root: Record<string, any>): void {
  const path = configFile();
  const content = jsonToYaml(root);
  if (content) safeWriteFile(path, content);
}

function buildAliasMap(root: Record<string, any>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const aliases = root.model_aliases || {};
  for (const [aliasName, aliasVal] of Object.entries(aliases)) {
    const a = aliasVal as Record<string, any>;
    const modelId = a.model || "";
    const baseUrl = a.base_url || "";
    if (!modelId) continue;
    const key = `${baseUrl}::${modelId}`;
    const list = map.get(key) || [];
    list.push(aliasName);
    map.set(key, list);
  }
  return map;
}

function findAliasesForModel(aliasMap: Map<string, string[]>, modelId: string, baseUrl: string): string[] {
  const key = `${baseUrl}::${modelId}`;
  return aliasMap.get(key) || [];
}

export function listModels(): SavedModel[] {
  const root = readYaml();
  const models: SavedModel[] = [];
  const aliasMap = buildAliasMap(root);

  // 1. Default model from model.default / model.provider
  const modelSec = root.model || {};
  const defaultModel = modelSec.default || "";
  const defaultProvider = modelSec.provider || "";
  const defaultBaseUrl = modelSec.base_url || "";
  if (defaultModel) {
    models.push({
      id: `default:${defaultModel}`,
      name: defaultModel,
      provider: defaultProvider,
      model: defaultModel,
      baseUrl: defaultBaseUrl,
      aliases: findAliasesForModel(aliasMap, defaultModel, defaultBaseUrl),
    });
  }

  // 2. All providers and their models
  const providers = root.providers || {};
  for (const [provName, provVal] of Object.entries(providers)) {
    const prov = provVal as Record<string, any>;
    const baseUrl = prov.base_url || "";
    const provModels = prov.models || {};
    for (const modelId of Object.keys(provModels)) {
      models.push({
        id: `${provName}:${modelId}`,
        name: modelId,
        provider: `custom:${provName}`,
        model: modelId,
        baseUrl,
        aliases: findAliasesForModel(aliasMap, modelId, baseUrl),
      });
    }
  }

  return models;
}

export function listTemplates(): DefaultModel[] {
  return DEFAULT_MODELS;
}

export function addModel(
  name: string,
  provider: string,
  model: string,
  baseUrl: string,
  alias?: string,
): SavedModel {
  const root = readYaml();

  const provName = provider.startsWith("custom:")
    ? provider.slice(7)
    : provider;
  const modelId = model || name;

  if (!root.providers) root.providers = {};
  if (!root.providers[provName]) {
    root.providers[provName] = { base_url: baseUrl, models: {} };
  }
  const prov = root.providers[provName];
  if (baseUrl) prov.base_url = baseUrl;
  if (!prov.models) prov.models = {};

  if (!prov.models[modelId]) {
    prov.models[modelId] = {};
  }

  // Add alias if provided
  if (alias && alias.trim()) {
    if (!root.model_aliases) root.model_aliases = {};
    root.model_aliases[alias.trim()] = {
      model: modelId,
      base_url: baseUrl || prov.base_url || "",
      context_length: 200000,
    };
  }

  writeYaml(root);

  return {
    id: `${provName}:${modelId}`,
    name,
    provider: `custom:${provName}`,
    model: modelId,
    baseUrl,
    aliases: alias ? [alias.trim()] : [],
  };
}

export function removeModel(id: string): boolean {
  const root = readYaml();

  if (id.startsWith("default:")) {
    const modelId = id.slice(8);
    if (root.model?.default === modelId) {
      delete root.model.default;
      writeYaml(root);
      return true;
    }
    return false;
  }

  const [provName, modelId] = id.split(":", 2);
  if (!provName || !modelId) return false;

  if (root.providers?.[provName]?.models?.[modelId] !== undefined) {
    delete root.providers[provName].models[modelId];
    writeYaml(root);
    return true;
  }
  return false;
}

export function updateModel(
  id: string,
  fields: Partial<Pick<SavedModel, "name" | "provider" | "model" | "baseUrl">>,
): boolean {
  const root = readYaml();

  if (id.startsWith("default:")) {
    if (!root.model) root.model = {};
    if (fields.model) root.model.default = fields.model;
    if (fields.baseUrl) root.model.base_url = fields.baseUrl;
    writeYaml(root);
    return true;
  }

  const [provName, oldModelId] = id.split(":", 2);
  if (!provName || !oldModelId) return false;
  if (!root.providers?.[provName]) return false;

  const prov = root.providers[provName];
  if (fields.baseUrl) prov.base_url = fields.baseUrl;

  if (fields.model && fields.model !== oldModelId && prov.models) {
    const conf = prov.models[oldModelId];
    delete prov.models[oldModelId];
    prov.models[fields.model] = conf || {};
  }

  writeYaml(root);
  return true;
}
