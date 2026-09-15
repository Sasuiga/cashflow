import type { Bom, MaterialId, ProductId, Role } from './types';

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
};

export const ROLE_HINT: Record<Role, string> = {
  production: '设备位内每人产能 +4，超出 +1',
  management: '每 2 人提升 1 点行动点上限',
  sales: '到岗立刻多一张本月订单，单量随人手变大',
  rd: '结算时每人推进 1 点，满 2 点解锁',
};

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

export function materialName(id: MaterialId): string {
  const map: Record<MaterialId, string> = {
    a: '钢材',
    b: '塑料',
    c: '芯片',
    d: '特种合金',
  };
  return map[id];
}

export function productName(id: ProductId): string {
  const map: Record<ProductId, string> = {
    basic: '基础款',
    standard: '标准款',
    premium: '旗舰款',
    economy: '经济款',
    special: '特种款',
  };
  return map[id];
}

export function priceDelta(current: number, previous: number): { text: string; tone: 'up' | 'down' | 'flat' } {
  const diff = roundMoney(current - previous);
  if (Math.abs(diff) < 0.05) return { text: '持平', tone: 'flat' };
  const pct = previous > 0 ? diff / previous : 0;
  const pctText = `${pct > 0 ? '+' : ''}${Math.round(pct * 100)}%`;
  return { text: `${signedAmount(diff)}（${pctText}）`, tone: diff > 0 ? 'up' : 'down' };
}

export function scoreTitle(netAssets: number, kind: 'bankrupt' | 'finished'): string {
  if (kind === 'bankrupt') return '破产清算';
  if (netAssets >= 180) return '商业帝国';
  if (netAssets >= 120) return '行业新星';
  if (netAssets >= 70) return '稳健经营';
  return '艰难度日';
}
