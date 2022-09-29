import { PublicKey, clusterApiUrl } from '@solana/web3.js';

export const AUCTIONEER = 'auctioneer';
export const AUCTION_HOUSE = 'auction_house';
export const DEFAULT_TIMEOUT = 30000;
export const ESCROW = 'escrow';
export const FEE_PAYER = 'fee_payer';
export const LISTING_CONFIG = 'listing_config';
export const TREASURY = 'treasury';
export const AUCTIONEER_PROGRAM_ID = new PublicKey(
  'neer8g6yJq2mQM6KbnViEDAD4gr3gRZyMMf4F2p3MEh',
);
export const AUCTION_HOUSE_PROGRAM_ID = new PublicKey(
  'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk',
);
export const FAIR_LAUNCH_PROGRAM_ID = new PublicKey(
  'faircnAB9k59Y4TXmLabBULeuTLgV7TkGMGNkjnA15j',
);
export const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);
export const TOKEN_ENTANGLEMENT_PROGRAM_ID = new PublicKey(
  'qntmGodpGkrM42mN68VCZHXnKqDCT8rdY23wFcXCLPd',
);
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);
export const WRAPPED_SOL_MINT = new PublicKey(
  'So11111111111111111111111111111111111111112',
);

type Cluster = {
  name: string;
  url: string;
};
export const CLUSTERS: Cluster[] = [
  {
    name: 'mainnet-beta',
    url: 'https://api.metaplex.solana.com/',
  },
  {
    name: 'testnet',
    url: clusterApiUrl('testnet'),
  },
  {
    name: 'devnet',
    url: clusterApiUrl('devnet'),
  },
];
export const DEFAULT_CLUSTER = CLUSTERS[2];
export const BIG_INT_MAX_U64 = '18446744073709551615';
