import { ACHIEVEMENTS } from './achievements';
import { netAssetsOf } from './engine';
import type { GameState } from './types';

function staffCount(state: GameState): number {
  return state.staff.production + state.staff.management + state.staff.sales + state.staff.rd;
}

export interface ScoreLine {
  label: string;
  detail: string;
  points: number;
}

export interface MilestoneDef {
  id: string;
  name: string;
  desc: string;
  points: number;
  reached: (state: GameState) => boolean;
}

export interface AwardDef {
  id: string;
  name: string;
  gold: string;
  silver: string;
  goldOf: (state: GameState) => boolean;
  silverOf: (state: GameState) => boolean;
}

export const MILESTONES: MilestoneDef[] = [
  { id: 'crew8', name: '班子齐整', desc: '编制达到 8 人', points: 5, reached: (state) => staffCount(state) >= 8 },
  { id: 'line3', name: '三条产线', desc: '设备达到 3 台', points: 5, reached: (state) => state.machines >= 3 },
  { id: 'lab', name: '实验室交货', desc: '研发解锁新产品', points: 5, reached: (state) => state.unlockedProducts.length > 3 },
  { id: 'cash40', name: '现金垫厚', desc: '现金达到 ¥40万', points: 5, reached: (state) => state.cash >= 40 },
  { id: 'clear', name: '还清短贷', desc: '借过债并全部还清', points: 5, reached: (state) => state.everDebt && state.debt <= 0 },
];

export const AWARDS: AwardDef[] = [
  {
    id: 'capex',
    name: '产线奖',
    gold: '设备 ≥ 3 台',
    silver: '设备 ≥ 2 台',
    goldOf: (state) => state.machines >= 3,
    silverOf: (state) => state.machines >= 2,
  },
  {
    id: 'rd',
    name: '研发奖',
    gold: '特种线已开',
    silver: '至少一档研发交付',
    goldOf: (state) => state.rdUnlockIndex >= 2,
    silverOf: (state) => state.rdUnlockIndex >= 1,
  },
  {
    id: 'channel',
    name: '渠道奖',
    gold: '销售 ≥ 3 人',
    silver: '销售 ≥ 2 人',
    goldOf: (state) => state.staff.sales >= 3,
    silverOf: (state) => state.staff.sales >= 2,
  },
  {
    id: 'steady',
    name: '稳健奖',
    gold: '无债且净资产 ≥ ¥80万',
    silver: '年末无短期借款',
    goldOf: (state) => state.debt <= 0 && netAssetsOf(state) >= 80,
    silverOf: (state) => state.debt <= 0,
  },
];

export function monthsSurvived(state: GameState): number {
  if (state.endKind === 'finished') return 12;
  if (state.endKind === 'bankrupt') return Math.max(0, state.month - 1);
  return state.month;
}

export function scoreTitleOf(total: number, kind: 'bankrupt' | 'finished' | null): string {
  if (kind === 'bankrupt') return '破产清算';
  if (total >= 50) return '商业帝国';
  if (total >= 36) return '行业新星';
  if (total >= 22) return '稳健经营';
  return '艰难度日';
}

export function scoreOf(state: GameState): { total: number; title: string; lines: ScoreLine[] } {
  const survive = monthsSurvived(state);
  const net = Math.max(0, netAssetsOf(state));
  const netPoints = state.endKind === 'bankrupt' ? 0 : Math.floor(net / 20);
  const miles = MILESTONES.filter((item) => state.milestones.includes(item.id));
  const awards = AWARDS.map((item) => {
    if (state.endKind !== 'finished') return { ...item, points: 0, tier: 'none' as const };
    if (item.goldOf(state)) return { ...item, points: 5, tier: 'gold' as const };
    if (item.silverOf(state)) return { ...item, points: 2, tier: 'silver' as const };
    return { ...item, points: 0, tier: 'none' as const };
  }).filter((item) => item.points > 0);
  const achieve = state.achievements.filter((id) => ACHIEVEMENTS.some((item) => item.id === id)).length;

  const lines: ScoreLine[] = [
    { label: '生存', detail: `活过 ${survive} 个月，每月 1 分`, points: survive },
    { label: '净资产', detail: state.endKind === 'bankrupt' ? '破产不计' : `每 20万计 1 分，现 ${net}万`, points: netPoints },
    ...miles.map((item) => ({ label: `里程碑 · ${item.name}`, detail: item.desc, points: item.points })),
    ...awards.map((item) => ({
      label: `奖项 · ${item.name}`,
      detail: item.tier === 'gold' ? item.gold : item.silver,
      points: item.points,
    })),
    { label: '成就', detail: `已达成 ${achieve} 项，每项 1 分`, points: achieve },
  ];

  const total = lines.reduce((sum, line) => sum + line.points, 0);
  return { total, title: scoreTitleOf(total, state.endKind), lines };
}
