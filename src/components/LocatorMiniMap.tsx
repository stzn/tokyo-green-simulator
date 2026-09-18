// 現在地ミニマップ：東京23区の輪郭の上に、今の地図の表示範囲を矩形で重ねて示すロケーター地図
import { useMemo } from 'react'
import type { WardFeature } from '../data/wards'
import { computeExtent, geometryToPath, makeProjector, projectBoundsToRect, type Extent } from '../lib/projection'

const VIEWBOX_SIZE = 128
const PADDING = 6

type Props = {
  wards: WardFeature[]
  bounds: Extent | null
}

export function LocatorMiniMap({ wards, bounds }: Props) {
  const viewBox = { width: VIEWBOX_SIZE, height: VIEWBOX_SIZE }
  const extent = useMemo(() => (wards.length > 0 ? computeExtent(wards) : null), [wards])

  if (!extent) return null

  const project = makeProjector(extent, viewBox, PADDING)
  const rect = bounds ? projectBoundsToRect(bounds, extent, viewBox, PADDING) : null

  return (
    <div
      data-testid="locator-map"
      role="img"
      aria-label="東京23区の地図上に、現在表示しているエリアを示すロケーターマップ"
      className="w-fit rounded-2xl border border-white/10 bg-slate-950/75 p-2 shadow-2xl shadow-black/40 backdrop-blur-md"
    >
      <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} aria-hidden="true">
        {wards.map((ward) => (
          <path
            key={ward.properties.name}
            d={geometryToPath(ward.geometry, project)}
            fillRule="evenodd"
            fill="rgba(148,163,184,0.18)"
            stroke="rgba(148,163,184,0.5)"
            strokeWidth={0.5}
          />
        ))}
        {rect && (
          <rect
            data-testid="locator-bounds"
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill="rgba(52,211,153,0.25)"
            stroke="rgb(52,211,153)"
            strokeWidth={1.5}
          />
        )}
      </svg>
    </div>
  )
}
