import { OVERLOAD_THRESHOLD, PLAYER_FUNCTIONS, PLAYER_SANITY } from './battle-config'

// The player's numbers for one battle. A run changes them with WEIGHTS; the
// rules, the store and the forecast all read them from `state.tuning`.
export type Tuning = {
  maxSanity: number
  privilegePerFlag: number
  repairHeal: number
  repairThreshold: number
  focusThreshold: number
  // Where the FOCUS counter stands when a battle begins.
  focusStart: number
  firewallThreshold: number
  firewallPrivilege: number
  overloadThreshold: number
}

// Today's numbers: the Warden battle with no run behind it.
export const DEFAULT_TUNING: Tuning = {
  maxSanity: PLAYER_SANITY,
  privilegePerFlag: PLAYER_FUNCTIONS.privilegePerFlag,
  repairHeal: PLAYER_FUNCTIONS.repairHeal,
  repairThreshold: 3,
  focusThreshold: 2,
  focusStart: 0,
  firewallThreshold: 4,
  firewallPrivilege: PLAYER_FUNCTIONS.firewallPrivilege,
  overloadThreshold: OVERLOAD_THRESHOLD,
}

// What a run brings into a battle.
export type Carry = { sanity: number; tuning: Tuning }

// Ids are those of script.json "weights". Each sets its number rather than
// stepping it, so a weight applied twice is the same weight; only Sanity adds.
// PATCH and unknown ids change nothing here.
export function applyWeight(tuning: Tuning, weightId: string): Tuning {
  switch (weightId) {
    case 'repair_threshold': return { ...tuning, repairThreshold: 2 }
    case 'repair_heal': return { ...tuning, repairHeal: 4 }
    case 'firewall_threshold': return { ...tuning, firewallThreshold: 3 }
    case 'firewall_privilege': return { ...tuning, firewallPrivilege: 5 }
    case 'focus_start': return { ...tuning, focusStart: 1 }
    case 'shell_privilege': return { ...tuning, privilegePerFlag: 3 }
    case 'overload_threshold': return { ...tuning, overloadThreshold: 4 }
    case 'max_sanity': return { ...tuning, maxSanity: tuning.maxSanity + 4 }
    default: return { ...tuning }
  }
}

// Sanity a weight restores the moment it is taken.
export function weightSanity(weightId: string): number {
  if (weightId === 'max_sanity') return 4
  if (weightId === 'patch') return 8
  return 0
}

// The tuning a list of weights adds up to. A stored run is rebuilt this way,
// so nothing read from storage can carry a number no weight gives.
export function tuningFor(weights: readonly string[]): Tuning {
  return weights.reduce(applyWeight, { ...DEFAULT_TUNING })
}
