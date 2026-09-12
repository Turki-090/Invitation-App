export const trustedProxyRanges = [
  "loopback",
  "linklocal",
  "uniquelocal",
] as const;

interface ProxyConfigurableApplication {
  set(setting: string, value: readonly string[]): unknown;
}

/** Trust forwarding headers only when the immediate ingress is local/private. */
export function configureTrustedProxy(app: ProxyConfigurableApplication): void {
  app.set("trust proxy", trustedProxyRanges);
}
