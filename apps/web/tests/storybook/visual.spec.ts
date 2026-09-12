import { expect, test } from "@playwright/test";

const stories = [
  {
    id: "foundations-component-catalogue--core",
    locale: "en",
    name: "components-core-en.png",
    width: 1200,
    height: 800,
  },
  {
    id: "foundations-component-catalogue--core",
    locale: "ar-SA",
    name: "components-core-ar.png",
    width: 1200,
    height: 800,
  },
  {
    id: "foundations-component-catalogue--forms",
    locale: "en",
    name: "components-forms-en.png",
    width: 1200,
    height: 1000,
  },
  {
    id: "foundations-component-catalogue--forms",
    locale: "ar-SA",
    name: "components-forms-ar.png",
    width: 1200,
    height: 1000,
  },
  {
    id: "foundations-component-catalogue--data-display",
    locale: "en",
    name: "components-data-en.png",
    width: 1200,
    height: 1200,
  },
  {
    id: "foundations-component-catalogue--data-display",
    locale: "ar-SA",
    name: "components-data-ar.png",
    width: 1200,
    height: 1200,
  },
  {
    id: "foundations-component-catalogue--feedback",
    locale: "en",
    name: "components-feedback-en.png",
    width: 1200,
    height: 900,
  },
  {
    id: "foundations-component-catalogue--feedback",
    locale: "ar-SA",
    name: "components-feedback-ar.png",
    width: 1200,
    height: 900,
  },
  {
    id: "foundations-layouts--host-arabic-desktop",
    locale: "ar-SA",
    name: "host-arabic-desktop.png",
    width: 1440,
    height: 900,
  },
  {
    id: "foundations-layouts--host-english-desktop",
    locale: "en",
    name: "host-english-desktop.png",
    width: 1440,
    height: 900,
  },
  {
    id: "foundations-layouts--host-english-collapsed",
    locale: "en",
    name: "host-english-collapsed.png",
    width: 900,
    height: 900,
  },
  {
    id: "foundations-layouts--host-mobile",
    locale: "ar-SA",
    name: "host-arabic-mobile.png",
    width: 390,
    height: 844,
  },
  {
    id: "foundations-layouts--guest-arabic",
    locale: "ar-SA",
    name: "guest-arabic-mobile.png",
    width: 390,
    height: 844,
  },
  {
    id: "foundations-layouts--guest-english",
    locale: "en",
    name: "guest-english-mobile.png",
    width: 390,
    height: 844,
  },
  {
    id: "guest-public-invitation--named-family-arabic",
    locale: "ar-SA",
    name: "public-invitation-family-ar.png",
    width: 390,
    height: 844,
  },
  {
    id: "guest-public-invitation--companions-english",
    locale: "en",
    name: "public-invitation-companions-en.png",
    width: 390,
    height: 844,
  },
  {
    id: "foundations-states--loading-empty-error",
    locale: "en",
    name: "critical-states.png",
    width: 1200,
    height: 800,
  },
  {
    id: "foundations-states--loading-empty-error",
    locale: "ar-SA",
    name: "critical-states-ar.png",
    width: 1200,
    height: 800,
  },
  {
    id: "foundations-states--destructive-dialog",
    locale: "en",
    name: "destructive-dialog.png",
    width: 900,
    height: 700,
  },
  {
    id: "foundations-states--destructive-dialog",
    locale: "ar-SA",
    name: "destructive-dialog-ar.png",
    width: 900,
    height: 700,
  },
  {
    id: "foundations-states--details-drawer",
    locale: "en",
    name: "details-drawer-en.png",
    width: 900,
    height: 800,
  },
  {
    id: "foundations-states--details-drawer",
    locale: "ar-SA",
    name: "details-drawer-ar.png",
    width: 900,
    height: 800,
  },
] as const;

for (const story of stories) {
  test(`${story.id} (${story.locale}) matches its visual baseline`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: story.width, height: story.height });
    await page.goto(
      `/iframe.html?id=${story.id}&viewMode=story&globals=locale:${story.locale}`,
    );
    await page.locator("#storybook-root > *").first().waitFor({
      state: "attached",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(story.name, { fullPage: true });
  });
}
