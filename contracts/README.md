# データ契約（地図アプリ ↔ シミュレーター）

[tokyo-green-simulator](https://github.com/stzn/tokyo-green-simulator)（地図アプリ: 都市緑化デジタルツイン）と、本リポジトリ（シミュレーター: 仮想移動緑化シミュレータ）の間で受け渡す JSON の形式です。全体の計画は [docs/integration-plan.md](../docs/integration-plan.md) にあります。

| ファイル | 向き | 中身 |
| --- | --- | --- |
| `stage.schema.json` | 地図アプリ → シミュレーター | 候補地点ごとの、時間別の日射遮蔽率、天空率、緑の文脈、需要（集計値） |
| `dispatch.schema.json` | シミュレーター → 地図アプリ | ポッドの時刻別の地点・行動・植物の健康度と、地点ごとの PET |
| `jitai-summary.schema.json` | シミュレーター → 地図アプリ | JITAI の判定・介入・段階別の見送りを、徒歩圏の区画（400 m）× 時刻で数えた集計値（3 人未満の区画・時刻は入れない） |
| `fixtures/*.sample.json` | — | 契約確認用に手で作ったサンプル（実測・実計算ではない） |

## 正本と更新の手順
- 正本は `src/vmgs/contracts.py`（Pydantic）です。スキーマを手で編集せず、モデルを直してから次を実行します。
  ```bash
  uv run python -m vmgs.contracts
  ```
- `contracts/` 一式（スキーマとサンプル）を、tokyo-green-simulator の `contracts/` へそのまま写します。両リポジトリのテストが、同じサンプルを同じスキーマで検証します。
- 互換性のない変更は `schema_version` を上げます（読む側は、知らない版を拒否します）。

## 版
| 版 | 対象 | 違い |
| --- | --- | --- |
| 1 | 地点データ・配車・JITAI の集計 | 最初の版 |
| 2 | 地点データだけ | 地点に `shelter`（`open` / `covered`）と `shelter_network`（屋根付きの通路の網の番号）を足した。のちに任意の `shelter_access`（屋根なしの地点から近くの出入口で入れる網の番号）を足した（省けば今までと同じ）。サンプルは `fixtures/stage.v2.sample.json` |

- シミュレーターは版 1 と版 2 の地点データを両方読みます。版 1 の地点はすべて屋根なし（`open`）とみなします。
- 版 1 の地点データは屋根付きの地点も `shelter_access` も持てません。版 2 では、屋根付きの地点だけが `shelter_network` を持ちます。
- `covered` は地下通路・屋内の通路・アーケードの上の地点です。同じ `shelter_network` の地点どうしは、濡れずに行き来できるとみなします。
- `shelter_access` は、屋根なしの地点から 50 m 以内に、屋根付きの網の通路に接する出入口（地下鉄の出入口・建物の出入口）があるときの、その網の番号です。屋根付きの地点は持てません。
- JITAI と配車は、ポッドが屋根付きの地点にあり、その網が勤務地の網（屋根付きの勤務地）か勤務地の `shelter_access`（屋根なしの勤務地）と同じなら、雨で見送りません。屋根なしの地点のポッドへは外を歩くので、今までどおり雨で見送ります。

## 決めごと
- 時刻は `Asia/Tokyo` の 0〜23 時。`hourly` の時刻と地点 ID は重複させない。
- `shade_fraction` は建物と街路樹の樹冠による遮蔽を合わせた値。夜間（日射なし）は 1.0 とする。
- 知らないキーは拒否する（綴りの誤りを黙って読み飛ばさない）。
- 重複の禁止と、配車が地点データの地点・容量に合うことは、JSON Schema では表せない。シミュレーター側は `vmgs.contracts`（`dispatch_errors_against_stage`）で、地図アプリ側は読み込み時に別に確かめる。
- 需要（`demand`）と JITAI の集計には、集計値だけを入れる。個人の HRV などの計測値・個人の ID は入れない。
- JITAI の集計の区画は、区域の南西の角（`bbox` の西・南）を原点に切る。地点データは読み込み時に原点・区域・日付が合うことを確かめる（`jitai_summary_errors_against_stage`）。
