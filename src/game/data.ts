import type { CardDef, EventDef, MaterialDef, MaterialId, ProductDef, Role } from './types';

export const TOTAL_MONTHS = 12;
export const HAND_LIMIT = 5;
export const BASE_AP = 3;
export const MACHINE_COST = 10;
export const MACHINE_BOOK = 6;
export const MACHINE_BASE_CAP = 6;
export const WORKERS_PER_MACHINE = 4;
export const CAP_PER_WORKER = 4;
export const CAP_OVERFLOW = 1;
export const FACTORY_COST = 20;
export const FACTORY_BOOK = 8;
export const SLOTS_PER_FACTORY = 3;
export const FACTORY_UPKEEP = 1;
export const LOAN_PER_MACHINE = 5;
export const INTEREST_RATE = 0.1;
export const HIRE_COST = 2;
export const SALARY: Record<Role, number> = {
  production: 0.5,
  management: 1,
  sales: 1,
  rd: 1.5,
};
export const RD_THRESHOLD = 2;

export const MATERIALS: MaterialDef[] = [
  { id: 'a', name: '钢材', short: 'A', basePrice: 0.4 },
  { id: 'b', name: '塑料', short: 'B', basePrice: 0.4 },
  { id: 'c', name: '芯片', short: 'C', basePrice: 1 },
  { id: 'd', name: '特种合金', short: 'D', basePrice: 2 },
];

export const PRODUCTS: ProductDef[] = [
  {
    id: 'basic',
    name: '基础款',
    tier: '低端',
    bom: { a: 2, b: 1 },
    basePrice: 1.5,
    baseDemand: 20,
    blurb: '走量产品。BOM 简单，需求稳定。',
  },
  {
    id: 'standard',
    name: '标准款',
    tier: '普通',
    bom: { a: 1, b: 2, c: 1 },
    basePrice: 4,
    baseDemand: 10,
    blurb: '利润更厚，但吃芯片。需求随销售扩张。',
  },
  {
    id: 'premium',
    name: '旗舰款',
    tier: '高端',
    bom: { b: 1, c: 2 },
    basePrice: 6,
    baseDemand: 5,
    blurb: '高单价、低需求。芯片行情好时溢价更明显。',
  },
  {
    id: 'economy',
    name: '经济款',
    tier: '研发',
    bom: { a: 1, b: 1 },
    basePrice: 1.5,
    baseDemand: 20,
    blurb: '研发成果：更省料的走量结构。',
  },
  {
    id: 'special',
    name: '特种款',
    tier: '研发',
    bom: { b: 1, d: 1 },
    basePrice: 5,
    baseDemand: 8,
    blurb: '解锁特种合金后的高毛利产品。',
  },
];

export const RD_UNLOCKS: Array<{ product?: 'economy' | 'special'; unlockD?: boolean; note: string }> = [
  { product: 'economy', note: '研发交付：经济款上市，BOM 仅需钢材 + 塑料。' },
  { unlockD: true, product: 'special', note: '研发交付：特种合金开线，特种款可投产。' },
];

export const CARDS: CardDef[] = [
  {
    id: 'overtime',
    name: '加班赶工',
    suit: 'production',
    cost: 1,
    blurb: '本月产能 +10。',
    playText: '产线灯火通明，本月产能 +10。',
  },
  {
    id: 'kaizen',
    name: '现场改善',
    suit: 'production',
    cost: 0.5,
    blurb: '本月产能 +5，下一次采购九折。',
    playText: '产线节拍被拧紧，产能 +5，下次采购九折。',
  },
  {
    id: 'lean',
    name: '精益例会',
    suit: 'management',
    cost: 1,
    blurb: '立刻获得 1 点行动点。',
    playText: '会议很短，决定很快。行动点 +1。',
  },
  {
    id: 'bulk',
    name: '集采谈判',
    suit: 'management',
    cost: 1,
    blurb: '下一次原料采购八折。',
    playText: '供应商松口了。下次采购八折。',
  },
  {
    id: 'client',
    name: '大客户拜访',
    suit: 'sales',
    cost: 1,
    blurb: '本月所有产品需求 +15。',
    playText: '渠道被打开，本月需求 +15。',
  },
  {
    id: 'premiumPush',
    name: '高端发布',
    suit: 'sales',
    cost: 1,
    blurb: '本月售价 +20%。',
    playText: '发布会造成短时溢价，本月售价 +20%。',
  },
  {
    id: 'labRush',
    name: '实验室通宵',
    suit: 'rd',
    cost: 1,
    blurb: '立刻推进 1 点研发进度。',
    playText: '样品在天亮前跑通，研发进度 +1。',
  },
  {
    id: 'bridge',
    name: '过桥资金',
    suit: 'management',
    cost: 0.5,
    blurb: '立刻到账 ¥5万，同时增加等额负债。',
    playText: '现金到账，账上也多了一笔债。',
  },
];

export const EVENTS: EventDef[] = [
  {
    id: 'steelSpike',
    title: '钢厂临时限售',
    monthHint: '原料',
    body: '北方钢厂联合限售。现货被抬上去，你们名下的到货配额也被砍了一刀。补库存会更贵。',
    impact: '钢材报价上调 50%，库存钢材被划走 6 件。',
    tone: 'bad',
    weight: 3,
  },
  {
    id: 'bigOrder',
    title: '连锁超市加单',
    monthHint: '订单',
    body: '合同已经盖章，不是询盘。基础款必须在本月交齐，交不出就按合同扣违约金。',
    impact: '基础款需求 +8；本月须售出基础款 12 件，否则违约金 6 万。',
    tone: 'mixed',
    weight: 2,
  },
  {
    id: 'resign',
    title: '骨干被挖走',
    monthHint: '人事',
    body: '对岸开出了你们跟不上的价。人今早没来打卡，产线立刻缺一档。',
    impact: '失去 1 名生产人员；若编制已空，本月产能再削 4。',
    tone: 'bad',
    weight: 3,
  },
  {
    id: 'quality',
    title: '抽检不合格',
    monthHint: '合规',
    body: '市监局抽中了库存成品。罚款当场划走，渠道也把订单砍了一截。',
    impact: '罚款 4 万，成品库存清零，本月需求 -8。',
    tone: 'bad',
    weight: 3,
  },
  {
    id: 'dump',
    title: '竞品清仓库',
    monthHint: '价格战',
    body: '隔壁厂按成本价甩货。货架还在，但标价和订单量都被压下去了。',
    impact: '本月售价 -15%，需求 -8。',
    tone: 'bad',
    weight: 3,
  },
  {
    id: 'blackout',
    title: '工业错峰限电',
    monthHint: '产能',
    body: '供电所通知本周错峰。产线必须停半班，没有备用电可买。本月能出的货比计划少一截。',
    impact: '本月产能 -8。',
    tone: 'bad',
    weight: 3,
  },
  {
    id: 'tax',
    title: '进项转出补税',
    monthHint: '税务',
    body: '金税标红的进项被要求转出。税局直接从基本户扣款，没有申诉窗口。手头立刻紧一档。',
    impact: '补税 5 万，现金当场划走。',
    tone: 'bad',
    weight: 3,
  },
  {
    id: 'chipSqueeze',
    title: '芯片交期拉长',
    monthHint: '原料',
    body: '分销商把现货和配额一起收紧。标准款、旗舰款的料更贵，库里那点芯片也少了一片。',
    impact: '芯片报价上调 50%，库存芯片 -1。',
    tone: 'bad',
    weight: 3,
  },
  {
    id: 'machineDown',
    title: '关键设备停机',
    monthHint: '基建',
    body: '主轴过热，一条线本月修不好。抢修预付已经划走，产能按少一台设备算。',
    impact: '预付抢修 2 万，本月产能按少一台设备计算。',
    tone: 'bad',
    weight: 3,
  },
  {
    id: 'channelHold',
    title: '渠道压款退货',
    monthHint: '回款',
    body: '两家经销商同步压款，并退回一部分意向单。账上先被划走一笔准备金，本月能卖掉的件数也少了。',
    impact: '划走准备金 3 万，本月需求 -6。',
    tone: 'bad',
    weight: 3,
  },
  {
    id: 'bankCall',
    title: '银行抽贷审查',
    monthHint: '融资',
    body: '客户经理带着审查名单上门。有负债就先扣回一截；没负债也要交评估费。',
    impact: '有负债则强制收回 4 万；无负债则评估费 3 万。',
    tone: 'bad',
    weight: 2,
  },
  {
    id: 'rushOrder',
    title: '经销商压货',
    monthHint: '旺季',
    body: '渠道把锁货函直接传真过来。量是给了，单价被砍了一刀。交不齐同样按违约处理。',
    impact: '需求 +14，售价 -10%；本月须售出基础款 12 件，否则违约金 5 万。',
    tone: 'mixed',
    weight: 2,
  },
  {
    id: 'poach',
    title: '实验室被挖空',
    monthHint: '研发',
    body: '猎头把实验室的人挖走了。有研发编制就立刻缺人；没人值守的话，工艺也跟着松一档。',
    impact: '失去 1 名研发；若无人在岗，研发进度回退，本月产能 -3。',
    tone: 'bad',
    weight: 2,
  },
  {
    id: 'rebate',
    title: '出口退税到账',
    monthHint: '政策',
    body: '一笔小额退税进了基本户。能缓一口气，但撑不起整月的产销。',
    impact: '现金 +3 万。',
    tone: 'good',
    weight: 1,
  },
];

export const MATERIAL_IDS: MaterialId[] = ['a', 'b', 'c', 'd'];

export function productById(id: string): ProductDef {
  const found = PRODUCTS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown product ${id}`);
  return found;
}

export function cardById(id: string): CardDef {
  const found = CARDS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown card ${id}`);
  return found;
}

export function eventById(id: string): EventDef {
  const found = EVENTS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown event ${id}`);
  return found;
}

export function materialById(id: MaterialId): MaterialDef {
  return MATERIALS.find((item) => item.id === id)!;
}
