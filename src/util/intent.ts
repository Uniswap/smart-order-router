// NOTE: intent is a routing-api concept,
// but we have to introduce this strongly-typed enum in SOR to ensure some codepath only gets executed during async path
export enum INTENT {
  CACHING = 'caching',
  QUOTE = 'quote',
  SWAP = 'swap',
  PRICING = 'pricing',
}
