import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { components, operations, paths } from "./generated/schema";

export type DawahApiClient = Client<paths>;
export type DawahApiClientOptions = ClientOptions;
export type { components, operations, paths };

export function createDawahApiClient(
  options: DawahApiClientOptions,
): DawahApiClient {
  return createClient<paths>(options);
}
