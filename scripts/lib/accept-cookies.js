/**
 * 自动点掉 Cookie / 隐私同意弹窗（Cloudflare Accept All Cookies 等）
 */

const ACCEPT_NAMES = [
  /^accept all cookies$/i,
  /^accept all$/i,
  /^allow all$/i,
  /^agree and continue$/i,
  /^i agree$/i,
  /^got it$/i,
  /^accept$/i,
  /^同意全部$/i,
  /^全部接受$/i,
  /^接受$/i,
];

async function clickByRole(page, role, nameRe) {
  const loc = page.getByRole(role, { name: nameRe }).first();
  if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
    await loc.click({ timeout: 3000 });
    return true;
  }
  return false;
}

async function acceptCookies(page) {
  // 先等弹层出现一下
  await page.waitForTimeout(800).catch(() => {});

  for (const re of ACCEPT_NAMES) {
    try {
      if (await clickByRole(page, "button", re)) {
        console.log(`  → cookie: clicked button ${re}`);
        await page.waitForTimeout(600);
        return true;
      }
      if (await clickByRole(page, "link", re)) {
        console.log(`  → cookie: clicked link ${re}`);
        await page.waitForTimeout(600);
        return true;
      }
    } catch {
      /* next */
    }
  }

  // 兜底：文案匹配点击
  try {
    const clicked = await page.evaluate(() => {
      const texts = [
        "Accept All Cookies",
        "Accept all cookies",
        "Accept All",
        "Allow all",
        "Agree",
        "全部接受",
        "同意全部",
      ];
      const nodes = Array.from(
        document.querySelectorAll("button, a, [role='button']")
      );
      for (const el of nodes) {
        const t = (el.textContent || "").trim();
        if (texts.some((x) => t === x || t.includes(x))) {
          el.click();
          return t;
        }
      }
      return null;
    });
    if (clicked) {
      console.log(`  → cookie: clicked "${clicked}"`);
      await page.waitForTimeout(600);
      return true;
    }
  } catch {
    /* ignore */
  }

  return false;
}

module.exports = { acceptCookies };
