export const CHAINS = ['sol', 'eth', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc', 'sui', 'unknown'] as const;
export type Chain = (typeof CHAINS)[number];

export const CHAIN_LABELS: Record<Chain, string> = {
  sol: 'Solana',
  eth: 'Ethereum',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum',
  base: 'Base',
  optimism: 'Optimism',
  bsc: 'BSC',
  sui: 'Sui',
  unknown: 'Unknown',
};
