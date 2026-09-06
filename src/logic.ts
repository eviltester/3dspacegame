export type Faction = 'player' | 'pirate' | 'trader' | 'police' | 'neutral';

export type EntityKind =
  | 'player'
  | 'pirate'
  | 'trader'
  | 'police'
  | 'gate'
  | 'base'
  | 'planet'
  | 'blackMarket'
  | 'cargo'
  | 'beacon';

export type CargoType =
  | 'credits'
  | 'legalCargo'
  | 'rareMineral'
  | 'contraband'
  | 'weaponCore'
  | 'shieldCell'
  | 'rescuePod';

export type MissionType = 'bounty' | 'rescue' | 'courier' | 'smuggling' | 'ambush';

export type Reputation = 'clean' | 'pirate';

export interface CargoDrop {
  type: CargoType;
  amount: number;
}

export interface Inventory {
  legalCargo: number;
  rareMineral: number;
  contraband: number;
  rescuePods: number;
}

export interface WantedState {
  active: boolean;
  heat: number;
  sectorId: string | null;
  policeTimer: number;
  policeArrived: boolean;
  reason: string | null;
}

export interface PlayerProgress {
  credits: number;
  score: number;
  hull: number;
  shield: number;
  maxShield: number;
  weaponLevel: number;
  inventory: Inventory;
  wanted: WantedState;
  sectorReputation: Record<string, Reputation>;
  discoveredSectors: string[];
}

export interface PlayerSave {
  credits: number;
  bestScore: number;
  discoveredSectors: string[];
  sectorReputation: Record<string, Reputation>;
  wantedBySector: Record<string, number>;
  unlockedWeaponLevel: number;
}

export interface Sector {
  id: string;
  name: string;
  lawLevel: number;
  ambient: number;
  gateTarget: string;
  mineralName: string;
}

export interface Mission {
  id: string;
  type: MissionType;
  title: string;
  reward: number;
  targetId: string | null;
  status: 'active' | 'complete' | 'failed';
  progress: number;
  goal: number;
}

export type TradeZone = 'lawful' | 'blackMarket';

export interface TradeResult {
  progress: PlayerProgress;
  creditsEarned: number;
  sold: Partial<Record<Exclude<CargoType, 'credits' | 'weaponCore' | 'shieldCell'>, number>>;
}

export interface ContrabandScanResult {
  progress: PlayerProgress;
  outcome: 'clear' | 'fine-paid' | 'confiscated' | 'hostile-response';
  fine: number;
  message: string;
}

export const SAVE_KEY = 'vector-shooter-save-v1';
export const MAX_WEAPON_LEVEL = 5;
export const POLICE_DISPATCH_DELAY = 8;
export const CONTRABAND_FINE = 140;

export const CARGO_VALUES: Record<CargoType, number> = {
  credits: 35,
  legalCargo: 80,
  rareMineral: 160,
  contraband: 260,
  weaponCore: 0,
  shieldCell: 0,
  rescuePod: 320
};

export const SECTORS: Sector[] = [
  {
    id: 'lyra-drift',
    name: 'Lyra Drift',
    lawLevel: 2,
    ambient: 0x19ffba,
    gateTarget: 'corundum-veil',
    mineralName: 'corundum'
  },
  {
    id: 'corundum-veil',
    name: 'Corundum Veil',
    lawLevel: 1,
    ambient: 0xffcc4a,
    gateTarget: 'eos-rake',
    mineralName: 'lattice gold'
  },
  {
    id: 'eos-rake',
    name: 'Eos Rake',
    lawLevel: 3,
    ambient: 0x75a7ff,
    gateTarget: 'lyra-drift',
    mineralName: 'eosite'
  }
];

export function createInitialSave(): PlayerSave {
  return {
    credits: 0,
    bestScore: 0,
    discoveredSectors: ['lyra-drift'],
    sectorReputation: {},
    wantedBySector: {},
    unlockedWeaponLevel: 1
  };
}

export function createInitialProgress(save: PlayerSave = createInitialSave()): PlayerProgress {
  const strongestHeat = Math.max(0, ...Object.values(save.wantedBySector));
  const wantedSector =
    Object.entries(save.wantedBySector).find(([, heat]) => heat === strongestHeat && heat > 0)?.[0] ?? null;

  return {
    credits: save.credits,
    score: 0,
    hull: 100,
    shield: 100,
    maxShield: 100,
    weaponLevel: Math.min(MAX_WEAPON_LEVEL, Math.max(1, save.unlockedWeaponLevel)),
    inventory: {
      legalCargo: 0,
      rareMineral: 0,
      contraband: 0,
      rescuePods: 0
    },
    wanted: {
      active: wantedSector !== null,
      heat: strongestHeat,
      sectorId: wantedSector,
      policeTimer: 0,
      policeArrived: false,
      reason: wantedSector ? 'Sector warrant' : null
    },
    sectorReputation: { ...save.sectorReputation },
    discoveredSectors: [...new Set(save.discoveredSectors)]
  };
}

export function progressToSave(progress: PlayerProgress, previous: PlayerSave): PlayerSave {
  const wantedBySector = { ...previous.wantedBySector };
  if (!progress.wanted.active || progress.wanted.heat <= 0) {
    for (const sectorId of Object.keys(wantedBySector)) {
      delete wantedBySector[sectorId];
    }
  } else if (progress.wanted.sectorId) {
    if (progress.wanted.heat > 0) {
      wantedBySector[progress.wanted.sectorId] = progress.wanted.heat;
    } else {
      delete wantedBySector[progress.wanted.sectorId];
    }
  }

  return {
    credits: progress.credits,
    bestScore: Math.max(previous.bestScore, progress.score),
    discoveredSectors: [...new Set(progress.discoveredSectors)],
    sectorReputation: { ...progress.sectorReputation },
    wantedBySector,
    unlockedWeaponLevel: Math.max(previous.unlockedWeaponLevel, progress.weaponLevel)
  };
}

export function getSector(id: string): Sector {
  return SECTORS.find((sector) => sector.id === id) ?? SECTORS[0];
}

export function nextSectorId(currentSectorId: string): string {
  return getSector(currentSectorId).gateTarget;
}

export function discoverSector(progress: PlayerProgress, sectorId: string): PlayerProgress {
  if (progress.discoveredSectors.includes(sectorId)) {
    return progress;
  }
  return {
    ...progress,
    discoveredSectors: [...progress.discoveredSectors, sectorId]
  };
}

export function applyCargoPickup(progress: PlayerProgress, drop: CargoDrop): PlayerProgress {
  const amount = Math.max(1, Math.floor(drop.amount));
  const inventory = { ...progress.inventory };
  let credits = progress.credits;
  let shield = progress.shield;
  let weaponLevel = progress.weaponLevel;
  let score = progress.score;

  switch (drop.type) {
    case 'credits':
      credits += CARGO_VALUES.credits * amount;
      score += 10 * amount;
      break;
    case 'legalCargo':
      inventory.legalCargo += amount;
      score += 12 * amount;
      break;
    case 'rareMineral':
      inventory.rareMineral += amount;
      score += 20 * amount;
      break;
    case 'contraband':
      inventory.contraband += amount;
      score += 18 * amount;
      break;
    case 'weaponCore':
      weaponLevel = Math.min(MAX_WEAPON_LEVEL, weaponLevel + amount);
      score += 40 * amount;
      break;
    case 'shieldCell':
      shield = Math.min(progress.maxShield, shield + 30 * amount);
      score += 15 * amount;
      break;
    case 'rescuePod':
      inventory.rescuePods += amount;
      score += 35 * amount;
      break;
  }

  return {
    ...progress,
    credits,
    score,
    shield,
    weaponLevel,
    inventory
  };
}

export function instantTrade(progress: PlayerProgress, zone: TradeZone): TradeResult {
  const inventory = { ...progress.inventory };
  const sold: TradeResult['sold'] = {};
  let creditsEarned = 0;

  if (zone === 'lawful') {
    if (inventory.legalCargo > 0) {
      sold.legalCargo = inventory.legalCargo;
      creditsEarned += inventory.legalCargo * CARGO_VALUES.legalCargo;
      inventory.legalCargo = 0;
    }
    if (inventory.rareMineral > 0) {
      sold.rareMineral = inventory.rareMineral;
      creditsEarned += inventory.rareMineral * CARGO_VALUES.rareMineral;
      inventory.rareMineral = 0;
    }
    if (inventory.rescuePods > 0) {
      sold.rescuePod = inventory.rescuePods;
      creditsEarned += inventory.rescuePods * CARGO_VALUES.rescuePod;
      inventory.rescuePods = 0;
    }
  }

  if (zone === 'blackMarket' && inventory.contraband > 0) {
    sold.contraband = inventory.contraband;
    creditsEarned += inventory.contraband * CARGO_VALUES.contraband;
    inventory.contraband = 0;
  }

  return {
    progress: {
      ...progress,
      credits: progress.credits + creditsEarned,
      score: progress.score + Math.floor(creditsEarned / 8),
      inventory
    },
    creditsEarned,
    sold
  };
}

export function attackFaction(
  progress: PlayerProgress,
  sectorId: string,
  targetFaction: Faction,
  wasProvoked: boolean
): PlayerProgress {
  if (targetFaction !== 'trader' || wasProvoked) {
    return progress;
  }

  const nextHeat = Math.max(2, progress.wanted.heat + 1);
  return {
    ...progress,
    wanted: {
      active: true,
      heat: nextHeat,
      sectorId,
      policeTimer: 0,
      policeArrived: false,
      reason: 'Unprovoked trader attack'
    },
    sectorReputation: {
      ...progress.sectorReputation,
      [sectorId]: 'pirate'
    }
  };
}

export function policeDispatchDue(wanted: WantedState, elapsedSeconds: number): boolean {
  return wanted.active && !wanted.policeArrived && elapsedSeconds >= POLICE_DISPATCH_DELAY;
}

export function wantedAppliesInSector(wanted: WantedState, sectorId: string): boolean {
  return wanted.active && wanted.sectorId === sectorId;
}

export function tickWanted(progress: PlayerProgress, deltaSeconds: number): PlayerProgress {
  if (!progress.wanted.active || progress.wanted.policeArrived) {
    return progress;
  }
  return {
    ...progress,
    wanted: {
      ...progress.wanted,
      policeTimer: progress.wanted.policeTimer + Math.max(0, deltaSeconds)
    }
  };
}

export function markPoliceArrived(progress: PlayerProgress): PlayerProgress {
  return {
    ...progress,
    wanted: {
      ...progress.wanted,
      policeArrived: true
    }
  };
}

export function resolveContrabandScan(progress: PlayerProgress, sectorId: string): ContrabandScanResult {
  if (progress.inventory.contraband <= 0) {
    return {
      progress,
      outcome: 'clear',
      fine: 0,
      message: 'Scan clear'
    };
  }

  if (progress.credits >= CONTRABAND_FINE) {
    return {
      progress: {
        ...progress,
        credits: progress.credits - CONTRABAND_FINE,
        inventory: {
          ...progress.inventory,
          contraband: 0
        }
      },
      outcome: 'fine-paid',
      fine: CONTRABAND_FINE,
      message: 'Contraband seized and fine paid'
    };
  }

  return {
    progress: {
      ...progress,
      wanted: {
        active: true,
        heat: Math.max(2, progress.wanted.heat + 1),
        sectorId,
        policeTimer: 0,
        policeArrived: false,
        reason: 'Contraband evasion'
      },
      sectorReputation: {
        ...progress.sectorReputation,
        [sectorId]: 'pirate'
      }
    },
    outcome: 'hostile-response',
    fine: CONTRABAND_FINE,
    message: 'Contraband detected; hostile response authorized'
  };
}

export function coolWantedAfterWarp(progress: PlayerProgress, sectorId: string): PlayerProgress {
  if (!progress.wanted.active || progress.wanted.sectorId !== sectorId) {
    return progress;
  }

  const heat = Math.max(0, progress.wanted.heat - 1);
  return {
    ...progress,
    wanted: {
      active: heat > 0,
      heat,
      sectorId: heat > 0 ? sectorId : null,
      policeTimer: 0,
      policeArrived: false,
      reason: heat > 0 ? progress.wanted.reason : null
    }
  };
}

export function completeMission(progress: PlayerProgress, mission: Mission): { progress: PlayerProgress; mission: Mission } {
  if (mission.status !== 'active') {
    return { progress, mission };
  }
  return {
    progress: {
      ...progress,
      credits: progress.credits + mission.reward,
      score: progress.score + Math.floor(mission.reward / 2)
    },
    mission: {
      ...mission,
      progress: mission.goal,
      status: 'complete'
    }
  };
}

export function createMission(sector: Sector, seed: number): Mission {
  const type = (['bounty', 'rescue', 'courier', 'smuggling', 'ambush'] as MissionType[])[seed % 5];
  const rewardBase = 180 + sector.lawLevel * 60;

  switch (type) {
    case 'bounty':
      return {
        id: `${sector.id}-bounty`,
        type,
        title: `Bounty: red raider ace`,
        reward: rewardBase + 160,
        targetId: null,
        status: 'active',
        progress: 0,
        goal: 1
      };
    case 'rescue':
      return {
        id: `${sector.id}-rescue`,
        type,
        title: 'Rescue: drifting pod',
        reward: rewardBase + 120,
        targetId: null,
        status: 'active',
        progress: 0,
        goal: 1
      };
    case 'courier':
      return {
        id: `${sector.id}-courier`,
        type,
        title: 'Courier: sealed cargo',
        reward: rewardBase + 80,
        targetId: null,
        status: 'active',
        progress: 0,
        goal: 1
      };
    case 'smuggling':
      return {
        id: `${sector.id}-smuggle`,
        type,
        title: 'Black run: quiet crate',
        reward: rewardBase + 220,
        targetId: null,
        status: 'active',
        progress: 0,
        goal: 1
      };
    case 'ambush':
      return {
        id: `${sector.id}-ambush`,
        type,
        title: 'Signal: suspicious distress ping',
        reward: rewardBase + 180,
        targetId: null,
        status: 'active',
        progress: 0,
        goal: 3
      };
  }
}
