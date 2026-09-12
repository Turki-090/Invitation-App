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
    const replacement = path.resolve(
      storybookDirectory,
      "../../../packages/ui/src/index.ts",
    );
    config.resolve ??= {};
    if (Array.isArray(config.resolve.alias)) {
      config.resolve.alias.unshift({ find: "@dawah/ui", replacement });
    } else {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@dawah/ui": replacement,
      };
    }
    return config;
  },
};

export default config;
