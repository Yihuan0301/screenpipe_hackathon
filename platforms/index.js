// 平台注册表：新增平台时在这里登记一行（enabled: true 即生效）
import { xiaohongshu } from './xiaohongshu/config.js';

export const PLATFORMS = { xiaohongshu };
export const ACTIVE_PLATFORMS = Object.values(PLATFORMS).filter(p => p.enabled);
