import type { MaterialId, ProductId, Role } from './types';

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
  production: '提高产能，并与设备配合',
  management: '提升行动点，并提高管理牌权重',
  sales: '拉动需求，并提高销售牌权重',
  rd: '推进研发，每累计 2 点解锁新产品',
};

export function money(value: number): string {
  const wan = value / 10;
  const abs = Math.abs(wan);
  const sign = wan < 0 ? '-' : '';
  if (abs >= 100) return `${sign}¥${abs.toFixed(0)}万`;
  return `${sign}¥${abs.toFixed(1)}万`;
}

export function signedMoney(value: number): string {
  if (value > 0) return `+${money(value)}`;
  if (value < 0) return money(value);
  return money(0);
}

export function qty(n: number): string {
  return `${n} 件`;
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

export function scoreTitle(netAssets: number, kind: 'bankrupt' | 'finished'): string {
  if (kind === 'bankrupt') return '破产清算';
  if (netAssets >= 1800) return '商业帝国';
  if (netAssets >= 1200) return '行业新星';
  if (netAssets >= 700) return '稳健经营';
  return '艰难度日';
}
