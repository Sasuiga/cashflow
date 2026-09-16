import type { Bom, EventTone, MaterialId, ProductId, RdProductArchetype, RdTrack, Role } from './types';

export const MONTH_NAMES = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
];

export const ROLE_LABEL: Record<Role, string> = {
  production: '生产',
  management: '管理',
  sales: '销售',
  rd: '研发',
  procurement: '采购',
};

export const EVENT_TONE_LABEL: Record<EventTone, string> = {
  good: '利好',
  bad: '利空',
  mixed: '参半',
};

export const ROLE_HINT: Record<Role, string> = {
  production: '设备位内每人产能 +4，超出 +1。满第一台有弹性产能；6 人且两台设备可连班；两台满编有现场出成。',
  management: '每人 +1 行动点。2 人起提案更多、手牌更宽；5 人每月可立项两份。',
  sales: '入职当月加一张市场单；每 2 人使月初订单 +1。人越多，原料涨价越能跟进售价，赊销比例越低。',
  rd: '入职时选择产品实验室，或点选一项工艺再编入工艺实验室。产品开题时自选简化、替代芯片或冲毛利；每组最多 3 人。产品组满编课题改为 2 个月；工艺同时只生效 2 项。',
  procurement: '入职当月放宽现货。4 人起厂供九折、签协议不耗 AP；5 人可同时两份协议，加价盘更便宜。',
};

export const RD_TRACK_LABEL: Record<RdTrack, string> = {
  product: '产品实验室',
  tech: '工艺实验室',
};

export const RD_ARCHETYPE_LABEL: Record<RdProductArchetype, string> = {
  simplify: '简化结构',
  substitute: '替代芯片',
  margin: '冲毛利',
};

export const RD_ARCHETYPE_BLURB: Record<RdProductArchetype, string> = {
  simplify: '同毛利、更省料。无芯片的改型按走量单出。',
  substitute: '用钢材/塑料换掉芯片，毛利与亲本持平。',
  margin: '随机 BOM，可能更复杂，毛利高于现有最低档。',
};

export function pctLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 10) / 10;
}

export function amount(value: number): string {
  const n = roundMoney(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (Math.abs(abs * 10 - Math.round(abs) * 10) < 1e-6) return `${sign}${Math.round(abs)}万`;
  return `${sign}${abs.toFixed(1)}万`;
}

export function money(value: number): string {
  const n = roundMoney(value);
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${amount(Math.abs(n))}`;
}

export function signedMoney(value: number): string {
  if (value > 0) return `+${money(value)}`;
  if (value < 0) return money(value);
  return money(0);
}

export function signedAmount(value: number): string {
  if (value > 0) return `+${amount(value)}`;
  if (value < 0) return amount(value);
  return amount(0);
}

export function qty(n: number): string {
  return `${n} 件`;
}

export function bomLabel(bom: Bom): string {
  const parts: string[] = [];
  if (bom.a) parts.push(`${bom.a}钢材`);
  if (bom.b) parts.push(`${bom.b}塑料`);
  if (bom.c) parts.push(`${bom.c}芯片`);
  if (bom.d) parts.push(`${bom.d}特种合金`);
  return parts.join(' + ') || '—';
}

const FACTORY_ORDINALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function factoryName(index: number): string {
  const n = index + 1;
  const label = n >= 1 && n <= FACTORY_ORDINALS.length ? FACTORY_ORDINALS[n - 1] : String(n);
  return `${label}号厂区`;
}

export function materialName(id: MaterialId): string {
  const map: Record<MaterialId, string> = {
    a: '钢材',
    b: '塑料',
    c: '芯片',
    d: '特种合金',
  };
  return map[id];
}

export function productName(id: ProductId, catalog?: Array<{ id: string; name: string }>): string {
  const named = catalog?.find((item) => item.id === id)?.name;
  if (named) return named;
  const map: Record<string, string> = {
    basic: '基础款',
    standard: '标准款',
    premium: '旗舰款',
    economy: '经济款',
    special: '特种款',
    rd1: '自研一款',
    rd2: '自研二款',
  };
  return map[id] ?? id;
}

export function priceDelta(current: number, previous: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  const diff = roundMoney(current - previous);
  if (Math.abs(diff) < 0.05) return { text: '持平', tone: 'flat' };
  const pct = previous > 0 ? diff / previous : 0;
  const pctText = `${pct > 0 ? '+' : ''}${Math.round(pct * 100)}%`;
  return { text: `${signedAmount(diff)}（${pctText}）`, tone: diff > 0 ? 'up' : 'down' };
}

export function scoreTitle(total: number, kind: 'bankrupt' | 'finished'): string {
  if (kind === 'bankrupt') return '破产清算';
  if (total >= 140) return '商业帝国';
  if (total >= 90) return '行业新星';
  if (total >= 50) return '稳健经营';
  return '艰难度日';
}
