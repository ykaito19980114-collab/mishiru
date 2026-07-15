# architecture

既存の単一ExpressサーバーとReact SPAを維持する。新データは `server/store.ts` がAdapterとして読み込み、既存APIを壊さず追加APIで提供する。将来的には `server/routes`, `server/services`, `server/repositories` へ分割可能。
