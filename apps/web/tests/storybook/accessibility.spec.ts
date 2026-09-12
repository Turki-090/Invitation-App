import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const stories = [
  {
    id: "foundations-component-catalogue--core",
    locale: "en",
    width: 1200,
    height: 800,
  },
  {
    id: "foundations-component-catalogue--forms",
    locale: "en",
    width: 1200,
    height: 900,
  },
  {
    id: "foundations-component-catalogue--core",
    locale: "ar-SA",
    width: 1200,
    height: 800,
  },
  {
    id: "foundations-component-catalogue--forms",
    locale: "ar-SA",
    width: 1200,
    height: 900,
  },
  {
    id: "foundations-component-catalogue--data-display",
    locale: "en",
    width: 1200,
    height: 1000,
  },
  {
    id: "foundations-component-catalogue--feedback",
    locale: "en",
    width: 1200,
    height: 900,
  },
  {
    id: "foundations-component-catalogue--data-display",
    locale: "ar-SA",
    width: 1200,
    height: 1000,
  },
  {
    id: "foundations-component-catalogue--feedback",
    locale: "ar-SA",
    width: 1200,
    height: 900,
  },
  {
    id: "foundations-layouts--host-arabic-desktop",
    locale: "ar-SA",
    width: 1440,
    height: 900,
  },
  {
    id: "foundations-layouts--host-english-desktop",
    locale: "en",
    width: 1440,
    height: 900,
  },
  {
    id: "foundations-layouts--host-english-collapsed",
    locale: "en",
    width: 900,
    height: 900,
  },
  {
    id: "foundations-layouts--host-mobile",
    locale: "ar-SA",
    width: 390,
    height: 844,
  },
  {
    id: "foundations-layouts--guest-arabic",
    locale: "ar-SA",
    width: 390,
    height: 844,
  },
  {
    id: "foundations-layouts--guest-english",
    locale: "en",
    width: 390,
    height: 844,
  },
  {
    id: "guest-public-invitation--named-family-arabic",
    locale: "ar-SA",
    width: 390,
    height: 844,
  },
  {
    id: "guest-public-invitation--companions-english",
    locale: "en",
    width: 390,
    height: 844,
  },
  {
    id: "foundations-states--loading-empty-error",
    locale: "en",
    width: 1200,
    height: 800,
  },
  {
    id: "foundations-states--loading-empty-error",
    locale: "ar-SA",
    width: 1200,
    height: 800,
  },
  {
    id: "foundations-states--disabled",
    locale: "en",
    width: 1200,
    height: 800,
  },
  { id: "foundations-states--focus", locale: "en", width: 1200, height: 800 },
  {
    id: "foundations-states--destructive-dialog",
    locale: "en",
    width: 900,
    height: 700,
  },
  {
    id: "foundations-states--destructive-dialog",
    locale: "ar-SA",
    width: 900,
    height: 700,
  },
  {
    id: "foundations-states--details-drawer",
    locale: "en",
    width: 900,
    height: 800,
  },
  {
    id: "foundations-states--details-drawer",
    locale: "ar-SA",
    width: 900,
    height: 800,
  },
] as const;

async function analyze(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await new AxeBuilder({ page })
        .include("#storybook-root")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
    } catch (error) {
      if (
        attempt === 19 ||
        !(error instanceof Error) ||
        !error.message.includes("Axe is already running")
      ) {
        throw error;
      }
      await page.waitForTimeout(100);
    }
  }
  throw new Error("Accessibility scan did not complete.");
}

for (const story of stories) {
  test(`${story.id} (${story.locale}) has no axe accessibility violations`, async ({
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
    if (
      story.id === "foundations-layouts--host-mobile" ||
      story.id === "foundations-layouts--host-english-collapsed"
    ) {
      await expect(
        page.locator(".dawah-host-shell__compact-utility"),
      ).toBeVisible();
    }
    if (story.id === "foundations-layouts--host-mobile") {
      await expect(page.locator(".dawah-host-shell__sidebar")).toBeHidden();
      await expect(page.locator(".dawah-bottom-nav")).toBeVisible();
    }
    const results = await analyze(page);
    expect(results.violations).toEqual([]);
  });
}
