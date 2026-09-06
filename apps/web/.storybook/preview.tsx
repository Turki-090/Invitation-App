import "../../../packages/ui/src/styles.css";
import "../app/globals.css";
import type { Preview } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";

const preview: Preview = {
  initialGlobals: { locale: "en" },
  globalTypes: {
    locale: {
      description: "Story locale and reading direction",
      toolbar: {
        icon: "globe",
        items: [
          { value: "ar-SA", title: "العربية" },
          { value: "en", title: "English" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const locale = context.globals.locale === "en" ? "en" : "ar-SA";
      return (
        <div
          dir={locale === "ar-SA" ? "rtl" : "ltr"}
          lang={locale}
          style={{ minHeight: "100%" }}
        >
          <Story />
        </div>
      ) as ReactNode;
    },
  ],
  parameters: {
    a11y: { test: "error" },
    controls: { expanded: true },
    viewport: {
      options: {
        desktop: {
          name: "Desktop",
          styles: { width: "1440px", height: "900px" },
        },
        tablet: { name: "Tablet", styles: { width: "900px", height: "900px" } },
        mobile: { name: "Mobile", styles: { width: "390px", height: "844px" } },
      },
    },
  },
};

export default preview;
