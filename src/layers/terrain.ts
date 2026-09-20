// 地形（地理院DEM）のメッシュ。建物・街路樹・公園・緑化演出はこの面に乗る（TerrainExtension）
import { TerrainLayer } from '@deck.gl/geo-layers'
import { DEM_MAX_ZOOM, DEM_MIN_ZOOM, DEM_TILES } from '../config/sources'
import { DEM_BBOX, ELEVATION_DECODER } from '../lib/dem'

// メッシュの簡略化の許容誤差（m）。小さいほど細かいが、生成が重く初期表示が遅くなる。
// 元データが約19m/pxなので、これくらい粗くしても23区の起伏は再現できる
const MESH_MAX_ERROR = 8
// タイルの継ぎ目に隙間が見えないよう、メッシュの縁を下へ伸ばす
const SKIRT_HEIGHT = 20

export function createTerrainLayer() {
  return new TerrainLayer({
    id: 'terrain',
    elevationData: DEM_TILES,
    elevationDecoder: ELEVATION_DECODER,
    // 用意したタイルはz=10〜13。ズームインではz=13を使い回す
    minZoom: DEM_MIN_ZOOM,
    maxZoom: DEM_MAX_ZOOM,
    // 他のレイヤーを乗せるための地形として扱う
    operation: 'terrain',
    // 地面としてうっすら重ねる。完全に不透明にするとベースマップの道路・地名が読めなくなるため半透明にし、
    // 陰影（material）で斜面と台地の縁が分かるようにする
    color: [56, 72, 96, 140],
    material: { ambient: 0.45, diffuse: 0.8, shininess: 8, specularColor: [40, 46, 54] },
    meshMaxError: MESH_MAX_ERROR,
    loadOptions: { terrain: { skirtHeight: SKIRT_HEIGHT } },
    // 23区の外にはタイルが無いので読みに行かない
    extent: [DEM_BBOX.west, DEM_BBOX.south, DEM_BBOX.east, DEM_BBOX.north],
    // それでも欠けたタイルがあれば、地形なしとして黙って進む
    onTileError: () => {},
  })
}
