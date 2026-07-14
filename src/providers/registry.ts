export type ProviderOutput = { kind: "image" | "video" | "audio" | "plan" | "text"; uri?: string; metadata: Record<string, unknown> };
export type ProviderResult = { providerRequestId: string; status: "running" | "succeeded"; progress?: number; outputs?: ProviderOutput[] };

export interface ProviderAdapter {
  key: string;
  isConfigured(): boolean;
  submit(input: Record<string, unknown>): Promise<ProviderResult>;
  poll?(providerRequestId: string, input: Record<string, unknown>): Promise<ProviderResult>;
  cancel?(providerRequestId: string, input: Record<string, unknown>): Promise<void>;
}

function text(input: Record<string, unknown>, key: string, fallback = "") {
  return typeof input[key] === "string" ? input[key] : fallback;
}

function object(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof payload.message === "string" ? payload.message : typeof payload.error === "string" ? payload.error : `Provider request failed with status ${response.status}.`;
    throw new Error(detail);
  }
  return payload;
}

function urlOutputs(value: unknown, kind: ProviderOutput["kind"]): ProviderOutput[] {
  const results: ProviderOutput[] = [];
  const visit = (entry: unknown) => {
    if (typeof entry === "string" && /^https?:\/\//.test(entry)) results.push({ kind, uri: entry, metadata: {} });
    else if (Array.isArray(entry)) entry.forEach(visit);
    else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      for (const [key, nested] of Object.entries(record)) if (["url", "uri", "image", "video", "audio", "output", "outputs", "images", "videos", "data"].includes(key)) visit(nested);
    }
  };
  visit(value);
  return [...new Map(results.map((output) => [output.uri, output])).values()];
}

function openAiAdapter(): ProviderAdapter {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    key: "openai", isConfigured: () => Boolean(apiKey),
    async submit(input) {
      const settings = object(input, "settings");
      const payload = await jsonRequest("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: text(input, "modelKey", "gpt-image-1"), prompt: text(input, "prompt"), n: Number(settings.variations ?? 1), size: settings.size ?? "1024x1024" }) });
      const outputs = urlOutputs(payload.data, "image");
      return { providerRequestId: crypto.randomUUID(), status: "succeeded", outputs: outputs.length ? outputs : [{ kind: "image", metadata: { response: payload.data } }] };
    },
  };
}

function falAdapter(): ProviderAdapter {
  const apiKey = process.env.FAL_API_KEY;
  return {
    key: "fal", isConfigured: () => Boolean(apiKey),
    async submit(input) {
      const model = encodeURI(text(input, "modelKey"));
      const payload = await jsonRequest(`https://queue.fal.run/${model}`, { method: "POST", headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text(input, "prompt"), ...object(input, "settings") }) });
      const requestId = String(payload.request_id ?? payload.id ?? "");
      if (!requestId) throw new Error("The provider did not return a request ID.");
      return { providerRequestId: requestId, status: "running", progress: 5 };
    },
    async poll(requestId, input) {
      const model = encodeURI(text(input, "modelKey"));
      const headers = { Authorization: `Key ${apiKey}` };
      const status = await jsonRequest(`https://queue.fal.run/${model}/requests/${requestId}/status`, { headers });
      const state = String(status.status ?? "").toUpperCase();
      if (state !== "COMPLETED") return { providerRequestId: requestId, status: "running", progress: state === "IN_PROGRESS" ? 55 : 20 };
      const result = await jsonRequest(`https://queue.fal.run/${model}/requests/${requestId}`, { headers });
      const kind = text(input, "workflow") === "voiceover" ? "audio" : "image";
      return { providerRequestId: requestId, status: "succeeded", progress: 100, outputs: urlOutputs(result, kind) };
    },
    async cancel(requestId, input) {
      const model = encodeURI(text(input, "modelKey"));
      await jsonRequest(`https://queue.fal.run/${model}/requests/${requestId}/cancel`, { method: "PUT", headers: { Authorization: `Key ${apiKey}` } });
    },
  };
}

function lumaAdapter(): ProviderAdapter {
  const apiKey = process.env.LUMA_API_KEY;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  return {
    key: "luma", isConfigured: () => Boolean(apiKey),
    async submit(input) {
      const payload = await jsonRequest("https://api.lumalabs.ai/dream-machine/v1/generations", { method: "POST", headers, body: JSON.stringify({ prompt: text(input, "prompt"), model: text(input, "modelKey"), ...object(input, "settings") }) });
      return { providerRequestId: String(payload.id), status: "running", progress: 5 };
    },
    async poll(requestId) {
      const payload = await jsonRequest(`https://api.lumalabs.ai/dream-machine/v1/generations/${requestId}`, { headers });
      const state = String(payload.state ?? "");
      if (state === "failed") throw new Error(String(payload.failure_reason ?? "Video generation failed."));
      if (state !== "completed") return { providerRequestId: requestId, status: "running", progress: 50 };
      return { providerRequestId: requestId, status: "succeeded", progress: 100, outputs: urlOutputs(payload.assets, "video") };
    },
  };
}

function synchronousImageAdapter(key: string, apiKey: string | undefined, endpoint: string, authorization: (token: string) => Record<string, string>): ProviderAdapter {
  return {
    key, isConfigured: () => Boolean(apiKey),
    async submit(input) {
      const payload = await jsonRequest(endpoint, { method: "POST", headers: { ...authorization(apiKey ?? ""), "Content-Type": "application/json" }, body: JSON.stringify({ model: text(input, "modelKey"), prompt: text(input, "prompt"), ...object(input, "settings") }) });
      return { providerRequestId: String(payload.id ?? crypto.randomUUID()), status: "succeeded", progress: 100, outputs: urlOutputs(payload, "image") };
    },
  };
}

function configurableAdapter(key: string, credential: string | undefined): ProviderAdapter {
  const endpoint = process.env[`ORIGIN_${key.toUpperCase()}_ENDPOINT`];
  return {
    key, isConfigured: () => Boolean(credential && endpoint),
    async submit(input) {
      const payload = await jsonRequest(endpoint!, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json", "Idempotency-Key": text(input, "idempotencyKey", crypto.randomUUID()) }, body: JSON.stringify(input) });
      const requestId = String(payload.requestId ?? payload.request_id ?? payload.id ?? crypto.randomUUID());
      const outputs = urlOutputs(payload, key === "elevenlabs" ? "audio" : key === "sync" ? "video" : "image");
      return { providerRequestId: requestId, status: outputs.length ? "succeeded" : "running", outputs };
    },
    async poll(requestId) {
      const payload = await jsonRequest(`${endpoint}/${encodeURIComponent(requestId)}`, { headers: { Authorization: `Bearer ${credential}` } });
      const state = String(payload.status ?? payload.state ?? "").toLowerCase();
      if (["failed", "error"].includes(state)) throw new Error(String(payload.error ?? "Provider job failed."));
      const outputs = urlOutputs(payload, key === "elevenlabs" ? "audio" : key === "sync" ? "video" : "image");
      return { providerRequestId: requestId, status: outputs.length || ["complete", "completed", "succeeded"].includes(state) ? "succeeded" : "running", progress: outputs.length ? 100 : 50, outputs };
    },
  };
}

const adapters = new Map<string, ProviderAdapter>([
  ["openai", openAiAdapter()],
  ["fal", falAdapter()],
  ["luma", lumaAdapter()],
  ["ark", synchronousImageAdapter("ark", process.env.ARK_API_KEY, process.env.ARK_API_ENDPOINT ?? "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations", (token) => ({ Authorization: `Bearer ${token}` }))],
  ["vertex", configurableAdapter("vertex", process.env.GOOGLE_VERTEX_ACCESS_TOKEN)],
  ["elevenlabs", configurableAdapter("elevenlabs", process.env.ELEVENLABS_API_KEY)],
  ["sync", configurableAdapter("sync", process.env.SYNC_API_KEY)],
  ["pexels", configurableAdapter("pexels", process.env.PEXELS_API_KEY)],
]);

export function getProvider(key: string) { return adapters.get(key); }
export function providerHealth() { return [...adapters.values()].map((adapter) => ({ key: adapter.key, configured: adapter.isConfigured() })); }
