import { searchOcr, checkScreenpipeHealth } from "@/lib/screenpipe";
import {
  extractRevenue,
  extractCosts,
  extractStatus,
  extractComments,
  type ModuleSnapshot,
} from "@/lib/extract";
import { readPatrolCache, cacheToItems } from "@/lib/patrol-cache";
import { isInfraMonitorItem } from "@/lib/status-platforms";

type FlatItem = { text?: string; app?: string; ts?: string; url?: string };

const NOISE =
  /FounderHUD|IndieDeck|LaunchShadow|Spatial Cockpit|SCREEN IS THE UNIVERSAL|waiting巡逻|Cockpit\.tsx/i;

function flatten(
  data: Awaited<ReturnType<typeof searchOcr>>["data"]
): FlatItem[] {
  return (data || [])
    .map((row) => ({
      text: row.content?.text,
      app: `${row.content?.app_name || ""} ${row.content?.window_name || ""}`,
      ts: row.content?.timestamp,
    }))
    .filter((item) => {
      const blob = `${item.app || ""} ${item.text || ""}`;
      if (NOISE.test(blob)) return false;
      if (/Cursor/i.test(item.app || "") && !/Chrome|Safari|Firefox/i.test(item.app || "")) {
        return false;
      }
      return Boolean(item.text && item.text.length > 20);
    });
}

async function safeSearch(q: string, limit = 8): Promise<FlatItem[]> {
  try {
    const start = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const res = await searchOcr({ q, limit, start_time: start });
    return flatten(res.data);
  } catch {
    return [];
  }
}

function prefer(
  primary: FlatItem[],
  fallback: FlatItem[]
): FlatItem[] {
  return primary.length ? primary : fallback;
}

export type CockpitPayload = {
  ok: boolean;
  screenpipeHealthy: boolean;
  fetchedAt: string;
  patrolCacheAt: string | null;
  modules: Record<
    "revenue" | "costs" | "status" | "comments",
    ModuleSnapshot
  >;
  error?: string;
};

export async function buildCockpitPayload(): Promise<CockpitPayload> {
  const fetchedAt = new Date().toISOString();

  try {
    const [healthy, cache] = await Promise.all([
      checkScreenpipeHealth(),
      readPatrolCache(),
    ]);

    // 优先用巡逻时抓到的页面正文（准），OCR 只做补充
    // Netlify / Fly 曾挂在 costs；合并进监控，成本侧只留邮件账单
    const cachedRevenue = cacheToItems(cache?.modules?.revenue);
    const costsRaw = cacheToItems(cache?.modules?.costs);
    const statusRaw = cacheToItems(cache?.modules?.status);
    const infraFromCosts = costsRaw.filter(isInfraMonitorItem);
    const cachedCosts = costsRaw.filter((i) => !isInfraMonitorItem(i));
    const cachedStatus = [...statusRaw, ...infraFromCosts];
    const cachedComments = cacheToItems(cache?.modules?.comments);

    const hasTencentCache = cachedStatus.some((i) =>
      /cloud\.tencent|qcloud|腾讯云/i.test(`${i.url || ""} ${i.text || ""}`)
    );

    const [ocrRevenue, ocrCosts, ocrStatus, ocrTencent, ocrComments] =
      await Promise.all([
        cachedRevenue.length
          ? Promise.resolve([])
          : safeSearch("App Store OR Proceeds OR Trends OR Units", 8),
        cachedCosts.length
          ? Promise.resolve([])
          : safeSearch(
              "Gmail OR invoice OR receipt OR billing OR Cloudflare OR Netlify OR Fly OR 账单",
              8
            ),
        cachedStatus.length
          ? Promise.resolve([])
          : safeSearch(
              "Netlify OR Fly OR Cloudflare OR Supabase OR DeepSeek OR Deployed OR Usage",
              8
            ),
        hasTencentCache
          ? Promise.resolve([])
          : safeSearch("腾讯云 OR Tencent Cloud OR console.cloud.tencent", 6),
        cachedComments.length
          ? Promise.resolve([])
          : safeSearch(
              "Ratings OR Reviews OR 评价 OR 小红书 OR xiaohongshu OR Customer Review",
              10
            ),
      ]);

    const statusItems = [
      ...prefer(cachedStatus, ocrStatus),
      ...ocrTencent,
    ];

    return {
      ok: true,
      screenpipeHealthy: healthy,
      fetchedAt,
      patrolCacheAt: cache?.updatedAt ?? null,
      modules: {
        revenue: extractRevenue(prefer(cachedRevenue, ocrRevenue)),
        costs: extractCosts(prefer(cachedCosts, ocrCosts)),
        status: extractStatus(statusItems),
        comments: extractComments(prefer(cachedComments, ocrComments)),
      },
    };
  } catch (err) {
    return {
      ok: false,
      screenpipeHealthy: false,
      fetchedAt,
      patrolCacheAt: null,
      modules: {
        revenue: extractRevenue([]),
        costs: extractCosts([]),
        status: extractStatus([]),
        comments: extractComments([]),
      },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
