import type { CardDef, EventDef, MaterialDef, MaterialId, ProductDef, Role } from './types';

export const TOTAL_MONTHS = 12;
export const HAND_LIMIT = 5;
export const BASE_AP = 3;
export const MACHINE_COST = 10;
export const MACHINE_BOOK = 6;
export const MACHINE_BASE_CAP = 10;
export const WORKERS_PER_MACHINE = 4;
export const CAP_PER_WORKER = 5;
export const CAP_OVERFLOW = 2;
export const FACTORY_COST = 20;
export const FACTORY_BOOK = 10;
export const SLOTS_PER_FACTORY = 3;
export const FACTORY_UPKEEP = 0.5;
export const LOAN_PER_MACHINE = 8;
export const INTEREST_RATE = 0.05;
export const HIRE_COST = 1;
export const SALARY: Record<Role, number> = {
  production: 0.5,
  management: 1,
  sales: 1,
  rd: 1.5,
};
export const RD_THRESHOLD = 2;

export const MATERIALS: MaterialDef[] = [
  { id: 'a', name: '钢材', short: 'A', basePrice: 0.2 },
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
    basePrice: 2,
    baseDemand: 50,
    blurb: '走量产品。BOM 简单，需求稳定，适合开局回血。',
  },
  {
    id: 'standard',
    name: '标准款',
    tier: '普通',
    bom: { a: 1, b: 2, c: 1 },
    basePrice: 4,
    baseDemand: 25,
    blurb: '利润更厚，但吃芯片。需求随销售扩张。',
  },
  {
    id: 'premium',
    name: '旗舰款',
    tier: '高端',
    bom: { b: 1, c: 2 },
    basePrice: 6,
    baseDemand: 10,
    blurb: '高单价、低需求。芯片行情好时是收割窗口。',
  },
  {
    id: 'economy',
    name: '经济款',
    tier: '研发',
    bom: { a: 1, b: 1 },
    basePrice: 1.5,
    baseDemand: 40,
    blurb: '研发成果：更省料的走量结构，适合产能过剩时。',
  },
  {
    id: 'special',
    name: '特种款',
    tier: '研发',
    bom: { b: 1, d: 1 },
    basePrice: 5,
    baseDemand: 15,
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
    blurb: '本月产能 +10。用库存把行情吃满。',
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
    blurb: '本月售价 +20%。适合旗舰窗口。',
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
    id: 'lockPrice',
    title: '钢厂锁价函',
    monthHint: '原料窗口',
    body: '钢材供应商愿意按现价锁一个月。锁得越深，订金越贵；不锁就得吃现货波动。',
    choices: [
      { label: '长约锁价', cost: '¥5万', hint: '钢材报价下调 20%' },
      { label: '预付锁一个月', cost: '¥2万', hint: '钢材报价下调 10%' },
      { label: '继续观望', cost: '不花钱', hint: '钢材报价立刻上调 20%' },
    ],
  },
  {
    id: 'bigOrder',
    title: '连锁超市询盘',
    monthHint: '需求冲击',
    body: '一家连锁超市要基础款补货。接得越多、需求越大，交不出货的违约金也越重。',
    choices: [
      { label: '接下全量', cost: '违约风险 ¥5万', hint: '本月需求 +20；基础款销量须达 15' },
      { label: '接下半单', cost: '违约风险 ¥2万', hint: '本月需求 +10；基础款销量须达 10' },
      { label: '礼貌拒绝', cost: '不花钱', hint: '需求不变，渠道关系维持原样' },
    ],
  },
  {
    id: 'resign',
    title: '骨干递交辞呈',
    monthHint: '人事',
    body: '一名熟练生产工被对岸工厂挖走。钱可以留人，也可以换来短时产能，放人则立刻掉编制。',
    choices: [
      { label: '加薪并提拔', cost: '¥5万', hint: '生产人员保留，本月产能 +10' },
      { label: '加薪挽留', cost: '¥2万', hint: '生产人员保留，无额外加成' },
      { label: '放人离开', cost: '不花钱', hint: '失去 1 名生产人员，现金 +¥1万' },
    ],
  },
  {
    id: 'banker',
    title: '客户经理上门',
    monthHint: '融资',
    body: '银行愿意突破设备抵押上限做短贷。借得越多手头越松，利息和负债也越沉。',
    choices: [
      { label: '加杠杆短贷', cost: '负债 +¥10万', hint: '现金 +¥10万，本月采购八折' },
      { label: '接受常规短贷', cost: '负债 +¥5万', hint: '现金 +¥5万' },
      { label: '维持稳健', cost: '不花钱', hint: '不新增负债，账目不变' },
    ],
  },
  {
    id: 'quality',
    title: '抽检通知',
    monthHint: '合规',
    body: '市监局要来抽检成品。投入越多越稳，省下来的钱都可能变成罚款。',
    choices: [
      { label: '全检过关', cost: '¥4万', hint: '稳过抽检，本月售价 +10%' },
      { label: '抽样补检', cost: '¥2万', hint: '稳过抽检，没有额外收益' },
      { label: '赌抽不到', cost: '不花钱', hint: '50% 无事；50% 罚款 ¥8万，且本月需求 -10' },
    ],
  },
  {
    id: 'dump',
    title: '竞品低价倾销',
    monthHint: '价格战',
    body: '隔壁厂在清库存。你可以花钱守品牌，也可以降价抢量，或者硬扛丢货架。',
    choices: [
      { label: '品牌对冲', cost: '¥3万', hint: '本月售价 +10%，需求不掉' },
      { label: '跟进降价', cost: '毛利受损', hint: '本月售价 -10%，需求 +10' },
      { label: '守价不跟', cost: '不花钱', hint: '本月需求 -10' },
    ],
  },
  {
    id: 'subsidy',
    title: '园区技改补贴',
    monthHint: '政策',
    body: '经开区有一笔补贴名额。配套出资拿得最多，只领现金券最省事。',
    choices: [
      { label: '配套拿全额', cost: '先付 ¥3万', hint: '到账 ¥10万，本月产能 +10' },
      { label: '标准申报', cost: '不另出资', hint: '到账 ¥5万' },
      { label: '只领现金券', cost: '不花钱', hint: '到账 ¥2万' },
    ],
  },
  {
    id: 'blackout',
    title: '限电通知',
    monthHint: '产能',
    body: '本周工业用电错峰。发电机能保排期，上备用电站还能多赶一批，硬扛就得停半拍。',
    choices: [
      { label: '上备用电站', cost: '¥5万', hint: '产能不受影响，额外 +5' },
      { label: '租发电机', cost: '¥3万', hint: '产能不受影响' },
      { label: '接受限产', cost: '不花钱', hint: '本月产能 -12' },
    ],
  },
  {
    id: 'influencer',
    title: '探厂直播邀约',
    monthHint: '品牌',
    body: '一位产业博主要来拍产线。接待规格越高，短期需求和溢价越明显。',
    choices: [
      { label: '全程接待投放', cost: '¥4万', hint: '本月需求 +20，售价 +10%' },
      { label: '标准接待', cost: '¥2万', hint: '本月需求 +10，售价 +10%' },
      { label: '婉拒拍摄', cost: '不花钱', hint: '行情不受影响' },
    ],
  },
  {
    id: 'tax',
    title: '税务约谈',
    monthHint: '现金流',
    body: '金税系统标红了进项波动。把账做干净最贵，补税次之，拖着就有被追缴的风险。',
    choices: [
      { label: '顾问清账', cost: '¥5万', hint: '平安过关，下一次采购八折' },
      { label: '直接补税', cost: '¥3万', hint: '平安过关，无额外收益' },
      { label: '先拖一拖', cost: '不花钱', hint: '50% 再被追缴 ¥6万；50% 侥幸过关' },
    ],
  },
  {
    id: 'poach',
    title: '研发被挖角',
    monthHint: '研发',
    body: '猎头盯上了实验室。加码能留下人并推进进度，发奖金只换进度，放人则掉编制。',
    choices: [
      { label: '加码留人扩编', cost: '¥5万', hint: '研发人员 +1，研发进度 +1' },
      { label: '发项目奖', cost: '¥2万', hint: '研发进度 +1' },
      { label: '放人离开', cost: '不花钱', hint: '若已有研发人员，失去 1 名' },
    ],
  },
  {
    id: 'yearEnd',
    title: '渠道压货',
    monthHint: '旺季',
    body: '经销商希望提前锁货。让利越多，货铺得越开，单价也压得越低。',
    choices: [
      { label: '让利铺货', cost: '售价 -10%', hint: '本月需求 +20' },
      { label: '部分接单', cost: '售价 -5%', hint: '本月需求 +10' },
      { label: '按单生产', cost: '不花钱', hint: '需求与售价均不变' },
    ],
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
