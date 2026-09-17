import type { StorybookConfig } from "@storybook/nextjs-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const storybookDirectory = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  docs: { autodocs: "tag" },
  async viteFinal(config) {
    const sourceAliases = {
      "@dawah/ui": "../../../packages/ui/src/index.ts",
    } as const;
    config.resolve ??= {};
    for (const [find, target] of Object.entries(sourceAliases)) {
      const replacement = path.resolve(storybookDirectory, target);
      if (Array.isArray(config.resolve.alias)) {
        config.resolve.alias.unshift({ find, replacement });
      } else {
        config.resolve.alias = { ...config.resolve.alias, [find]: replacement };
      }
    }
    // Workspace packages ship CommonJS for Nest and the worker, and pnpm links
    // them from `packages/*/dist` rather than `node_modules`. Rollup's CommonJS
    // conversion only covers `node_modules` by default, so without this any
    // story reaching the API client fails on an unresolvable named export.
    config.build ??= {};
    config.build.commonjsOptions = {
      ...config.build.commonjsOptions,
      include: [/node_modules/, /packages[/\\][^/\\]+[/\\]dist/],
    };
    return config;
  },
};

export default config;
