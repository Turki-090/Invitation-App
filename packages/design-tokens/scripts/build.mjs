import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(
  await readFile(join(packageRoot, "tokens.json"), "utf8"),
);

const camelToKebab = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])([0-9])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();

const flatten = (node, path = []) =>
  Object.entries(node).flatMap(([key, value]) => {
    const nextPath = [...path, key];
    return value && typeof value === "object" && "value" in value
      ? [{ path: nextPath, value: String(value.value) }]
      : flatten(value, nextPath);
  });

const cssName = (path) => {
  const [group, ...rest] = path;
  const name = rest.map(camelToKebab).join("-");
  if (group === "color")
    return name
      .replace(/^not-sent/, "notsent")
      .replace(/^checked-in/, "checkedin")
      .replace(/^whatsapp-/, "wa-")
      .replace(/^invitation-/, "inv-");
  if (group === "spacing") return `space-${name}`;
  if (group === "layout") {
    const names = {
      sidebarWidth: "sidebar-w",
      sidebarCollapsedWidth: "sidebar-w-collapsed",
      topbarHeight: "topbar-h",
      contentMax: "content-max",
      gutter: "gutter",
      cardPadding: "card-pad",
      drawerWidth: "drawer-w",
      guestWidth: "guest-w",
    };
    return names[rest.join(".")] ?? name;
  }
  if (group === "control") {
    const names = {
      heightSm: "control-h-sm",
      heightMd: "control-h-md",
      heightLg: "control-h-lg",
      heightGuest: "control-h-guest",
      touchMinimum: "touch-min",
    };
    return names[rest.join(".")] ?? `control-${name}`;
  }
  if (group === "radius") return `radius-${name}`;
  if (group === "shadow") return `shadow-${name}`;
  if (group === "typography") {
    const [kind, ...tail] = rest;
    const token = tail.map(camelToKebab).join("-");
    if (kind === "font") return `font-${token}`;
    if (kind === "size") return `text-${token}`;
    if (kind === "lineHeight") return `leading-${token}`;
    if (kind === "weight") return `weight-${token}`;
  }
  if (group === "motion")
    return rest[0] === "duration"
      ? `dur-${camelToKebab(rest[1])}`
      : `ease-${camelToKebab(rest[1])}`;
  return [group, name].map(camelToKebab).join("-");
};

const entries = flatten(tokens);
const declarations = entries
  .map((token) => `  --${cssName(token.path)}: ${token.value};`)
  .join("\n");
const css = `/* Generated from tokens.json. Do not edit by hand. */\n:root {\n${declarations}\n  --bg-app: var(--paper);\n  --surface-card: var(--white);\n  --surface-sunken: var(--sunken);\n  --surface-hover: var(--hover);\n  --surface-pressed: var(--pressed);\n  --text-body: var(--ink);\n  --text-secondary: var(--ink-2);\n  --text-muted: var(--ink-accessible-muted);\n  --text-disabled: var(--ink-4);\n  --text-on-dark: var(--paper);\n  --text-on-accent: var(--white);\n  --accent: var(--bronze);\n  --accent-hover: var(--bronze-dark);\n  --accent-soft: var(--bronze-tint);\n  --accent-soft-2: var(--bronze-tint-2);\n  --border-default: var(--line);\n  --border-strong: var(--line-strong);\n  --focus-ring: 0 0 0 3px rgba(154,118,66,.28);\n  --danger: var(--declined);\n  --danger-bg: var(--declined-bg);\n  --danger-fg: var(--declined-fg);\n  --success: var(--accepted);\n  --success-bg: var(--accepted-bg);\n  --success-fg: var(--accepted-fg);\n  --warning: var(--pending);\n  --warning-bg: var(--pending-bg);\n  --warning-fg: var(--pending-fg);\n  --info: var(--partial);\n  --info-bg: var(--partial-bg);\n  --info-fg: var(--partial-fg);\n  --radius-control: var(--radius-md);\n  --radius-card: var(--radius-lg);\n  --radius-dialog: var(--radius-xl);\n  --radius-pill: var(--radius-full);\n  --transition-control: background-color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; --dur-guest: 0ms; }\n}\n`;

const pascal = (path) =>
  path.map((part) => part.replace(/^./, (char) => char.toUpperCase())).join("");
const hexColors = entries.filter(
  (token) => token.path[0] === "color" && /^#[0-9A-F]{6}$/i.test(token.value),
);
const dimensions = entries.filter(
  (token) =>
    ["spacing", "layout", "control", "radius"].includes(token.path[0]) &&
    /^\d+(\.\d+)?px$/.test(token.value),
);
const typeSizes = entries.filter(
  (token) => token.path[0] === "typography" && token.path[1] === "size",
);

const swiftColor = (hex) => {
  const [r, g, b] = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  return `Color(red: ${r.toFixed(4)}, green: ${g.toFixed(4)}, blue: ${b.toFixed(4)})`;
};
const kotlinColor = (hex) => `Color(0xFF${hex.slice(1).toUpperCase()})`;
const pxNumber = (value) => value.replace("px", "");

const swiftColors = `// Generated from tokens.json.\nimport SwiftUI\n\npublic enum WeddingColors {\n${hexColors.map((token) => `  public static let ${pascal(token.path.slice(1)).replace(/^./, (char) => char.toLowerCase())} = ${swiftColor(token.value)}`).join("\n")}\n}\n`;
const swiftSpacing = `// Generated from tokens.json.\nimport CoreGraphics\n\npublic enum WeddingSpacing {\n${dimensions.map((token) => `  public static let ${pascal(token.path).replace(/^./, (char) => char.toLowerCase())}: CGFloat = ${pxNumber(token.value)}`).join("\n")}\n}\n`;
const swiftType = `// Generated from tokens.json.\nimport CoreGraphics\n\npublic enum WeddingTypography {\n${typeSizes.map((token) => `  public static let ${pascal(token.path.slice(2)).replace(/^./, (char) => char.toLowerCase())}: CGFloat = ${pxNumber(token.value)}`).join("\n")}\n}\n`;
const kotlinColors = `// Generated from tokens.json.\npackage com.dawah.designsystem\n\nimport androidx.compose.ui.graphics.Color\n\nobject WeddingColors {\n${hexColors.map((token) => `  val ${pascal(token.path.slice(1))} = ${kotlinColor(token.value)}`).join("\n")}\n}\n`;
const kotlinDimensions = `// Generated from tokens.json.\npackage com.dawah.designsystem\n\nimport androidx.compose.ui.unit.dp\n\nobject WeddingDimensions {\n${dimensions.map((token) => `  val ${pascal(token.path)} = ${pxNumber(token.value)}.dp`).join("\n")}\n}\n`;
const kotlinType = `// Generated from tokens.json.\npackage com.dawah.designsystem\n\nimport androidx.compose.ui.unit.sp\n\nobject WeddingTypography {\n${typeSizes.map((token) => `  val ${pascal(token.path.slice(2))} = ${pxNumber(token.value)}.sp`).join("\n")}\n}\n`;

const outputDirectory = join(packageRoot, "generated");
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(join(outputDirectory, "tokens.css"), css),
  writeFile(join(outputDirectory, "WeddingColors.swift"), swiftColors),
  writeFile(join(outputDirectory, "WeddingSpacing.swift"), swiftSpacing),
  writeFile(join(outputDirectory, "WeddingTypography.swift"), swiftType),
  writeFile(join(outputDirectory, "WeddingColors.kt"), kotlinColors),
  writeFile(join(outputDirectory, "WeddingDimensions.kt"), kotlinDimensions),
  writeFile(join(outputDirectory, "WeddingTypography.kt"), kotlinType),
]);
