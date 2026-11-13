/**
 * The AsyncAPI model's types. The code is scripts/asyncapi-core.mjs, plain JS so
 * the build script runs the same rules as the pages.
 */
import type { JSONSchema } from "./openapi";
export { attachChannels, normalizeAsyncApi, readAsyncApiFile, WEBSOCKETS_TAG, type Resource } from "@/scripts/asyncapi-core.mjs";

/** From the client's side: what it sends, what it receives, or (a 3.0 message no operation names) not said. */
export type Direction = "send" | "receive" | "unspecified";

export type AsyncMessage = {
  /** The message's key (component name, or its place in the channel). */
  id: string;
  name: string;
  title?: string;
  summary?: string;
  description?: string;
  contentType?: string;
  payload?: JSONSchema;
  /** Example payloads, as the spec gives them. */
  examples: unknown[];
  direction: Direction;
  deprecated?: boolean;
};

export type AsyncParameter = { name: string; description?: string; schema?: JSONSchema };

export type AsyncChannel = {
  /** Stable key: the 3.0 channel key, or the 2.x address. */
  id: string;
  /** The path a client connects to, with `{parameters}`. */
  address: string;
  title?: string;
  summary?: string;
  description?: string;
  tags: string[];
  /** Full URLs of the servers it's on (`wss://api.example.com`). */
  servers: string[];
  parameters: AsyncParameter[];
  /** `bindings.ws.query`: an object schema of the handshake's query parameters. */
  query?: JSONSchema;
  /** `bindings.ws.headers`: an object schema of the handshake's headers. */
  headers?: JSONSchema;
  messages: AsyncMessage[];
  deprecated?: boolean;
};

export type AsyncDoc = {
  /** The document's `asyncapi` version, or "" when it couldn't be read. */
  version: string;
  info: { title: string; version: string; description?: string };
  channels: AsyncChannel[];
  warnings: string[];
};

/** Which side a 2.x document is written from: the spec's ("server") or the client's. */
export type Perspective = "server" | "client";
