/// <reference types="vite/client" />
// 配信の基準パス（Vite の BASE_URL）。Node（tsx）で動かす書き出しスクリプトから
// src/data/ のモジュールを読むときは import.meta.env が無いので '/' にする
export const BASE_URL: string = import.meta.env?.BASE_URL ?? '/'
