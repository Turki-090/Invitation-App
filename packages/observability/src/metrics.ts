/**
 * Minimal Prometheus-compatible metrics registry.
 *
 * The exposition format is stable and small, so the platform emits it directly
 * rather than taking a client library into the runtime dependency surface of
 * both deployed services. The registry is deliberately bounded: a metric that
 * exceeds its series ceiling folds further label combinations into a single
 * `overflow` series instead of growing without limit, because an unbounded
 * label such as a raw URL path is the usual way a metrics endpoint takes down
 * the process it was added to observe.
 */

const metricNamePattern = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const labelNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Series ceiling per metric before label combinations collapse. */
export const defaultMaximumSeries = 512;

export const overflowLabelValue = "overflow";

export type MetricLabels = Readonly<Record<string, string | number>>;

/** Seconds. Chosen for HTTP handlers, queue jobs, and provider calls alike. */
export const defaultDurationBuckets = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
] as const;

interface MetricDefinition {
  readonly name: string;
  readonly help: string;
  readonly labelNames: readonly string[];
}

export interface Counter {
  increment(labels?: MetricLabels, value?: number): void;
}

export interface Gauge {
  set(labels: MetricLabels | undefined, value: number): void;
  increment(labels?: MetricLabels, value?: number): void;
}

export interface Histogram {
  observe(labels: MetricLabels | undefined, value: number): void;
  /** Times `operation`, recording its duration whether it resolves or throws. */
  time<T>(
    labels: MetricLabels | undefined,
    operation: () => Promise<T>,
  ): Promise<T>;
}

type SeriesMap = Map<string, { labels: Record<string, string>; value: number }>;

interface HistogramSeries {
  readonly labels: Record<string, string>;
  readonly counts: number[];
  sum: number;
  count: number;
}

export class MetricsRegistry {
  private readonly counters = new Map<
    string,
    { definition: MetricDefinition; series: SeriesMap }
  >();
  private readonly gauges = new Map<
    string,
    { definition: MetricDefinition; series: SeriesMap }
  >();
  private readonly histograms = new Map<
    string,
    {
      definition: MetricDefinition;
      buckets: readonly number[];
      series: Map<string, HistogramSeries>;
    }
  >();
  private readonly collectors: (() => void)[] = [];

  public constructor(
    private readonly maximumSeries: number = defaultMaximumSeries,
  ) {}

  public counter(
    name: string,
    help: string,
    labelNames: readonly string[] = [],
  ): Counter {
    const definition = defineMetric(name, help, labelNames);
    const existing = this.counters.get(name);
    const entry = existing ?? { definition, series: new Map() as SeriesMap };
    this.counters.set(name, entry);
    return {
      increment: (labels, value = 1) => {
        if (!Number.isFinite(value) || value < 0) return;
        const series = this.resolveSeries(entry.series, definition, labels);
        series.value += value;
      },
    };
  }

  public gauge(
    name: string,
    help: string,
    labelNames: readonly string[] = [],
  ): Gauge {
    const definition = defineMetric(name, help, labelNames);
    const existing = this.gauges.get(name);
    const entry = existing ?? { definition, series: new Map() as SeriesMap };
    this.gauges.set(name, entry);
    return {
      set: (labels, value) => {
        if (!Number.isFinite(value)) return;
        this.resolveSeries(entry.series, definition, labels).value = value;
      },
      increment: (labels, value = 1) => {
        if (!Number.isFinite(value)) return;
        this.resolveSeries(entry.series, definition, labels).value += value;
      },
    };
  }

  public histogram(
    name: string,
    help: string,
    labelNames: readonly string[] = [],
    buckets: readonly number[] = defaultDurationBuckets,
  ): Histogram {
    const definition = defineMetric(name, help, labelNames);
    const sorted = [...buckets].sort((left, right) => left - right);
    const existing = this.histograms.get(name);
    const entry = existing ?? {
      definition,
      buckets: sorted,
      series: new Map<string, HistogramSeries>(),
    };
    this.histograms.set(name, entry);

    const observe = (labels: MetricLabels | undefined, value: number): void => {
      if (!Number.isFinite(value) || value < 0) return;
      const key = this.seriesKey(entry.series, definition, labels);
      let series = entry.series.get(key.identity);
      if (!series) {
        series = {
          labels: key.labels,
          counts: Array.from<number>({ length: entry.buckets.length }).fill(0),
          sum: 0,
          count: 0,
        };
        entry.series.set(key.identity, series);
      }
      series.count += 1;
      series.sum += value;
      for (let index = 0; index < entry.buckets.length; index += 1) {
        const bucket = entry.buckets[index];
        if (bucket !== undefined && value <= bucket) {
          series.counts[index] = (series.counts[index] ?? 0) + 1;
        }
      }
    };

    return {
      observe,
      time: async (labels, operation) => {
        const startedAt = process.hrtime.bigint();
        try {
          return await operation();
        } finally {
          const elapsedNanoseconds = Number(
            process.hrtime.bigint() - startedAt,
          );
          observe(labels, elapsedNanoseconds / 1e9);
        }
      },
    };
  }

  /**
   * Registers a callback invoked immediately before rendering. Queue depth and
   * similar external state is sampled at scrape time rather than polled on a
   * timer, so an unscraped process does no work.
   */
  public registerCollector(collect: () => void): void {
    this.collectors.push(collect);
  }

  public render(): string {
    for (const collect of this.collectors) {
      try {
        collect();
      } catch {
        // A failing collector must never make the endpoint unavailable; the
        // remaining metrics are still worth serving during an incident.
      }
    }

    const lines: string[] = [];
    for (const { definition, series } of this.counters.values()) {
      appendHeader(lines, definition, "counter");
      for (const entry of series.values()) {
        lines.push(
          `${definition.name}${formatLabels(entry.labels)} ${entry.value}`,
        );
      }
    }
    for (const { definition, series } of this.gauges.values()) {
      appendHeader(lines, definition, "gauge");
      for (const entry of series.values()) {
        lines.push(
          `${definition.name}${formatLabels(entry.labels)} ${entry.value}`,
        );
      }
    }
    for (const { definition, buckets, series } of this.histograms.values()) {
      appendHeader(lines, definition, "histogram");
      for (const entry of series.values()) {
        for (let index = 0; index < buckets.length; index += 1) {
          const bucket = buckets[index];
          if (bucket === undefined) continue;
          lines.push(
            `${definition.name}_bucket${formatLabels({
              ...entry.labels,
              le: formatNumber(bucket),
            })} ${entry.counts[index] ?? 0}`,
          );
        }
        lines.push(
          `${definition.name}_bucket${formatLabels({
            ...entry.labels,
            le: "+Inf",
          })} ${entry.count}`,
        );
        lines.push(
          `${definition.name}_sum${formatLabels(entry.labels)} ${entry.sum}`,
        );
        lines.push(
          `${definition.name}_count${formatLabels(entry.labels)} ${entry.count}`,
        );
      }
    }
    return `${lines.join("\n")}\n`;
  }

  public reset(): void {
    for (const entry of this.counters.values()) entry.series.clear();
    for (const entry of this.gauges.values()) entry.series.clear();
    for (const entry of this.histograms.values()) entry.series.clear();
  }

  private resolveSeries(
    series: SeriesMap,
    definition: MetricDefinition,
    labels: MetricLabels | undefined,
  ): { labels: Record<string, string>; value: number } {
    const key = this.seriesKey(series, definition, labels);
    let entry = series.get(key.identity);
    if (!entry) {
      entry = { labels: key.labels, value: 0 };
      series.set(key.identity, entry);
    }
    return entry;
  }

  private seriesKey(
    series: ReadonlyMap<string, unknown>,
    definition: MetricDefinition,
    labels: MetricLabels | undefined,
  ): { identity: string; labels: Record<string, string> } {
    const normalized = normalizeLabels(definition, labels);
    const identity = identityOf(normalized);
    if (series.has(identity) || series.size < this.maximumSeries) {
      return { identity, labels: normalized };
    }
    const overflow = Object.fromEntries(
      definition.labelNames.map((name) => [name, overflowLabelValue]),
    );
    return { identity: identityOf(overflow), labels: overflow };
  }
}

function defineMetric(
  name: string,
  help: string,
  labelNames: readonly string[],
): MetricDefinition {
  if (!metricNamePattern.test(name)) {
    throw new Error(`Invalid metric name: ${name}`);
  }
  for (const labelName of labelNames) {
    if (!labelNamePattern.test(labelName)) {
      throw new Error(`Invalid metric label name: ${labelName}`);
    }
  }
  return { name, help, labelNames };
}

function normalizeLabels(
  definition: MetricDefinition,
  labels: MetricLabels | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const labelName of definition.labelNames) {
    const value = labels?.[labelName];
    normalized[labelName] =
      value === undefined ? "" : sanitizeLabel(String(value));
  }
  return normalized;
}

/**
 * Keeps a label value printable, single-line, and bounded. Label values reach
 * the registry from provider responses and route templates, so they are
 * treated as untrusted text.
 */
function sanitizeLabel(value: string): string {
  const collapsed = value.replace(/[\r\n]+/g, " ").trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 120)}…` : collapsed;
}

function identityOf(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([name, value]) => `${name} ${value}`)
    .join("");
}

function appendHeader(
  lines: string[],
  definition: MetricDefinition,
  type: "counter" | "gauge" | "histogram",
): void {
  lines.push(
    `# HELP ${definition.name} ${definition.help.replace(/\n/g, " ")}`,
  );
  lines.push(`# TYPE ${definition.name} ${type}`);
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const rendered = entries
    .map(([name, value]) => `${name}="${escapeLabelValue(value)}"`)
    .join(",");
  return `{${rendered}}`;
}

function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}
