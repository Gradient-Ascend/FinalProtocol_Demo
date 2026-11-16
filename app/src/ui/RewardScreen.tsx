import { useEffect, useRef, useState } from 'react'
import { campaignStore } from '@/campaign/campaign-store'
import type { CampaignSnapshot } from '@/campaign/campaign-store'
import { weightById } from '@/story/script'

// After a skirmish: three WEIGHTS, one to keep. Choosing is two steps, so
// looking at a card never installs it: inspect, then install.
export function RewardScreen({ campaign }: { campaign: CampaignSnapshot }) {
  const offer = campaign.offer ?? []
  const run = campaign.run
  const [selected, setSelected] = useState<number | null>(null)
  const install = (index: number | null) => {
    if (index !== null && offer[index]) campaignStore.chooseWeight(offer[index])
  }
  // A card is inspected first; choosing the inspected card again installs it.
  const choose = (index: number) => (selected === index ? install(index) : setSelected(index))

  const keys = useRef({ choose, install, selected, count: offer.length })
  keys.current = { choose, install, selected, count: offer.length }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const now = keys.current
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)
      if (digit && Number(digit[1]) <= now.count) now.choose(Number(digit[1]) - 1)
      else if (event.code === 'ArrowRight' || event.code === 'ArrowDown') setSelected(((now.selected ?? -1) + 1) % now.count)
      else if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') setSelected(((now.selected ?? now.count) + now.count - 1) % now.count)
      else if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') now.install(now.selected)
      else if (event.code === 'Escape') setSelected(null)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="scene reward-scene">
      <div className="reward-frame">
        <header className="reward-head">
          <div className="eyebrow">NODE BROKEN / WEIGHTS</div>
          <h2>INSTALL ONE</h2>
          {run && <p>SANITY {run.sanity} / {run.tuning.maxSanity}</p>}
        </header>
        <div className="reward-cards" role="listbox" aria-label="Weights on offer">
          {offer.map((id, index) => {
            const weight = weightById(id)
            if (!weight) return null
            return (
              <button
                type="button" role="option" key={id} data-weight={id}
                className={`reward-card ${selected === index ? 'selected' : ''}`}
                aria-selected={selected === index}
                onClick={() => choose(index)}
              >
                <span className="reward-key">{index + 1}</span>
                <em>{weight.kind}</em>
                <strong>{weight.name}</strong>
                <p>{weight.rule}</p>
                <i>{weight.flavor}</i>
              </button>
            )
          })}
        </div>
        <footer className="reward-foot">
          <span>{selected === null ? '1 – 3 OR CLICK TO INSPECT' : 'ENTER, OR CHOOSE IT AGAIN, TO INSTALL'}</span>
          <button className="primary-action" onClick={() => install(selected)} disabled={selected === null}>INSTALL <span>ENTER</span></button>
        </footer>
      </div>
    </div>
  )
}
