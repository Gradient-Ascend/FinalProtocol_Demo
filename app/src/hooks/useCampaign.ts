import { useSyncExternalStore } from 'react'
import { campaignStore } from '@/campaign/campaign-store'
import type { CampaignSnapshot } from '@/campaign/campaign-store'

// The campaign store as React state: the scene, the run and the log.
export function useCampaign(): CampaignSnapshot {
  return useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot)
}
