import { addCollection, Icon } from '@iconify/react/offline';
import { icons as lucide } from '@iconify-json/lucide';

// Registered once at module load so rendering never reaches the Iconify API.
addCollection(lucide);

export const DEFAULT_CATEGORY_ICON = 'lucide:folder';
const PREFIX = 'lucide:';

export type CategoryIconOption = { name: string; label: string };

const presets: CategoryIconOption[] = [
  { name: 'folder', label: '分类' },
  { name: 'briefcase', label: '工作' },
  { name: 'user', label: '个人' },
  { name: 'users', label: '团队' },
  { name: 'home', label: '家庭' },
  { name: 'building-2', label: '公司' },
  { name: 'landmark', label: '银行' },
  { name: 'credit-card', label: '银行卡' },
  { name: 'wallet', label: '钱包' },
  { name: 'mail', label: '邮箱' },
  { name: 'message-circle', label: '社交' },
  { name: 'globe', label: '网站' },
  { name: 'server', label: '服务器' },
  { name: 'database', label: '数据库' },
  { name: 'code', label: '开发' },
  { name: 'terminal', label: '终端' },
  { name: 'git-branch', label: '代码仓库' },
  { name: 'cloud', label: '云服务' },
  { name: 'wifi', label: '网络' },
  { name: 'smartphone', label: '手机' },
  { name: 'monitor', label: '电脑' },
  { name: 'gamepad-2', label: '游戏' },
  { name: 'shopping-bag', label: '购物' },
  { name: 'shopping-cart', label: '网购' },
  { name: 'store', label: '商店' },
  { name: 'plane', label: '出行' },
  { name: 'car', label: '汽车' },
  { name: 'train-front', label: '交通' },
  { name: 'map-pin', label: '地点' },
  { name: 'graduation-cap', label: '学习' },
  { name: 'book-open', label: '阅读' },
  { name: 'library', label: '资料' },
  { name: 'music', label: '音乐' },
  { name: 'film', label: '影视' },
  { name: 'camera', label: '摄影' },
  { name: 'image', label: '图片' },
  { name: 'heart', label: '生活' },
  { name: 'star', label: '收藏' },
  { name: 'bookmark', label: '书签' },
  { name: 'gift', label: '礼物' },
  { name: 'party-popper', label: '节日' },
  { name: 'utensils', label: '餐饮' },
  { name: 'coffee', label: '咖啡' },
  { name: 'dumbbell', label: '健身' },
  { name: 'bike', label: '骑行' },
  { name: 'leaf', label: '自然' },
  { name: 'paw-print', label: '宠物' },
  { name: 'baby', label: '育儿' },
  { name: 'stethoscope', label: '医疗' },
  { name: 'pill', label: '健康' },
  { name: 'shield-check', label: '安全' },
  { name: 'lock', label: '加密' },
  { name: 'key-round', label: '密钥' },
  { name: 'fingerprint', label: '身份' },
  { name: 'settings', label: '设置' },
  { name: 'wrench', label: '工具' },
  { name: 'hammer', label: '工程' },
  { name: 'palette', label: '设计' },
  { name: 'pen-tool', label: '创作' },
  { name: 'calculator', label: '计算' },
  { name: 'receipt', label: '账单' },
  { name: 'piggy-bank', label: '储蓄' },
  { name: 'trending-up', label: '投资' },
  { name: 'bitcoin', label: '加密资产' },
  { name: 'scale', label: '法律' },
  { name: 'package', label: '物流' },
  { name: 'truck', label: '配送' },
  { name: 'headphones', label: '音频' },
  { name: 'tv', label: '电视' },
  { name: 'printer', label: '打印' },
  { name: 'rss', label: '订阅' },
  { name: 'newspaper', label: '资讯' },
  { name: 'mountain', label: '旅行' },
  { name: 'tent', label: '露营' },
  { name: 'sun', label: '日常' },
  { name: 'moon', label: '夜间' },
  { name: 'zap', label: '能源' },
  { name: 'flame', label: '热门' },
  { name: 'droplet', label: '水电' },
  { name: 'rocket', label: '项目' },
];

// Only bundled Lucide names are rendered; anything else falls back instead of hitting the network.
export function categoryIconName(icon?: string | null): string | null {
  if (!icon || !icon.startsWith(PREFIX)) return null;
  const name = icon.slice(PREFIX.length);
  return lucide.icons[name] || lucide.aliases?.[name] ? icon : null;
}

export function CategoryIcon({ icon, size = 16, className }: { icon?: string; size?: number; className?: string }) {
  const name = categoryIconName(icon) ?? DEFAULT_CATEGORY_ICON;
  return <Icon icon={name} width={size} height={size} className={className} data-icon={name} aria-hidden="true" focusable="false"/>;
}

export function searchCategoryIcons(query: string, limit = 96): CategoryIconOption[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return presets;
  const result: CategoryIconOption[] = [];
  const seen = new Set<string>();
  for (const option of presets) {
    if (option.label.toLocaleLowerCase().includes(q) || option.name.includes(q)) { result.push(option); seen.add(option.name); }
  }
  for (const name of Object.keys(lucide.icons)) {
    if (result.length >= limit) break;
    if (seen.has(name) || !name.includes(q)) continue;
    result.push({ name, label: name });
  }
  return result.slice(0, limit);
}

export function randomCategoryIcon(current?: string): string {
  const choices = presets.filter(option => PREFIX + option.name !== current);
  return PREFIX + choices[Math.floor(Math.random() * choices.length)].name;
}
