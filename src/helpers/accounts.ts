import { Keypair, PublicKey, AccountInfo } from '@solana/web3.js';
import {
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  AUCTION_HOUSE_PROGRAM_ID,
  AUCTION_HOUSE,
  FEE_PAYER,
  TREASURY,
  WRAPPED_SOL_MINT,
  AUCTIONEER_PROGRAM_ID,
  AUCTIONEER,
  LISTING_CONFIG,
} from './constants';
import * as anchor from '@project-serum/anchor';
import fs from 'fs';
import log from 'loglevel';
import { AccountLayout, u64 } from '@solana/spl-token';
import { getCluster } from './various';
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes';
export type AccountAndPubkey = {
  pubkey: string;
  account: AccountInfo<Buffer>;
};

// TODO: expose in spl package
export const deserializeAccount = (data: Buffer) => {
  const accountInfo = AccountLayout.decode(data);
  accountInfo.mint = new PublicKey(accountInfo.mint);
  accountInfo.owner = new PublicKey(accountInfo.owner);
  accountInfo.amount = u64.fromBuffer(accountInfo.amount);

  if (accountInfo.delegateOption === 0) {
    accountInfo.delegate = null;
    // @ts-ignore
    accountInfo.delegatedAmount = new u64(0);
  } else {
    accountInfo.delegate = new PublicKey(accountInfo.delegate);
    accountInfo.delegatedAmount = u64.fromBuffer(accountInfo.delegatedAmount);
  }

  accountInfo.isInitialized = accountInfo.state !== 0;
  accountInfo.isFrozen = accountInfo.state === 2;

  if (accountInfo.isNativeOption === 1) {
    accountInfo.rentExemptReserve = u64.fromBuffer(accountInfo.isNative);
    accountInfo.isNative = true;
  } else {
    accountInfo.rentExemptReserve = null;
    accountInfo.isNative = false;
  }

  if (accountInfo.closeAuthorityOption === 0) {
    accountInfo.closeAuthority = null;
  } else {
    accountInfo.closeAuthority = new PublicKey(accountInfo.closeAuthority);
  }

  return accountInfo;
};

export function uuidFromConfigPubkey(configAccount: PublicKey) {
  return configAccount.toBase58().slice(0, 6);
}

export const getTokenWallet = async function (
  wallet: PublicKey,
  mint: PublicKey,
) {
  return (
    await PublicKey.findProgramAddress(
      [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
    )
  )[0];
};

export const getAtaForMint = async (
  mint: anchor.web3.PublicKey,
  buyer: anchor.web3.PublicKey,
): Promise<[anchor.web3.PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [buyer.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  );
};

export const getMetadata = async (
  mint: anchor.web3.PublicKey,
): Promise<anchor.web3.PublicKey> => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )
  )[0];
};

export const getCollectionAuthorityRecordPDA = async (
  mint: anchor.web3.PublicKey,
  newAuthority: anchor.web3.PublicKey,
): Promise<[anchor.web3.PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('collection_authority'),
      newAuthority.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );
};

export const getMasterEdition = async (
  mint: anchor.web3.PublicKey,
): Promise<anchor.web3.PublicKey> => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )
  )[0];
};

export const getEditionMarkPda = async (
  mint: anchor.web3.PublicKey,
  edition: number,
): Promise<anchor.web3.PublicKey> => {
  const editionNumber = Math.floor(edition / 248);
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from('edition'),
        Buffer.from(editionNumber.toString()),
      ],
      TOKEN_METADATA_PROGRAM_ID,
    )
  )[0];
};

export const getAuctioneerAuthority = async (
  auctionHouseKey: PublicKey,
): Promise<[PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(AUCTIONEER), auctionHouseKey.toBuffer()],
    AUCTIONEER_PROGRAM_ID,
  );
};

export const getAHAuctioneerPDA = async (
  auctionHouseKey: PublicKey,
  auctioneerAuthorityKey: PublicKey,
): Promise<[PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from(AUCTIONEER),
      auctionHouseKey.toBuffer(),
      auctioneerAuthorityKey.toBuffer(),
    ],
    AUCTION_HOUSE_PROGRAM_ID,
  );
};

export const getAuctionHouse = async (
  creator: anchor.web3.PublicKey,
  treasuryMint: anchor.web3.PublicKey,
): Promise<[PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(AUCTION_HOUSE), creator.toBuffer(), treasuryMint.toBuffer()],
    AUCTION_HOUSE_PROGRAM_ID,
  );
};

export const getAuctionHouseProgramAsSigner = async (): Promise<
  [PublicKey, number]
> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(AUCTION_HOUSE), Buffer.from('signer')],
    AUCTION_HOUSE_PROGRAM_ID,
  );
};

export const getAuctionHouseFeeAcct = async (
  auctionHouseKey: anchor.web3.PublicKey,
): Promise<[PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from(AUCTION_HOUSE),
      auctionHouseKey.toBuffer(),
      Buffer.from(FEE_PAYER),
    ],
    AUCTION_HOUSE_PROGRAM_ID,
  );
};

export const getAuctionHouseTreasuryAcct = async (
  auctionHouse: anchor.web3.PublicKey,
): Promise<[PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from(AUCTION_HOUSE),
      auctionHouse.toBuffer(),
      Buffer.from(TREASURY),
    ],
    AUCTION_HOUSE_PROGRAM_ID,
  );
};

export const getAuctioneerListingConfig = async (
  walletKey: anchor.web3.PublicKey,
  auctionHouseKey: anchor.web3.PublicKey,
  tokenAccountKey: anchor.web3.PublicKey,
  ahTreasuryMintKey: anchor.web3.PublicKey,
  tokenMintKey: anchor.web3.PublicKey,
  tokenSize: anchor.BN = new anchor.BN(1),
): Promise<[PublicKey, number]> => {
  return await PublicKey.findProgramAddress(
    [
      Buffer.from(LISTING_CONFIG),
      walletKey.toBuffer(),
      auctionHouseKey.toBuffer(),
      tokenAccountKey.toBuffer(),
      ahTreasuryMintKey.toBuffer(),
      tokenMintKey.toBuffer(),
      tokenSize.toBuffer('le', 8),
    ],
    AUCTIONEER_PROGRAM_ID,
  );
};

export const getAuctionHouseTradeState = async (
  walletKey: anchor.web3.PublicKey,
  auctionHouseKey: anchor.web3.PublicKey,
  tokenAccountKey: anchor.web3.PublicKey,
  ahTreasuryMintKey: anchor.web3.PublicKey,
  tokenMint: anchor.web3.PublicKey,
  buyPrice: anchor.BN,
  tokenSize: anchor.BN,
): Promise<[PublicKey, number]> => {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from(AUCTION_HOUSE),
      walletKey.toBuffer(),
      auctionHouseKey.toBuffer(),
      tokenAccountKey.toBuffer(),
      ahTreasuryMintKey.toBuffer(),
      tokenMint.toBuffer(),
      buyPrice.toBuffer('le', 8),
      tokenSize.toBuffer('le', 8),
    ],
    AUCTION_HOUSE_PROGRAM_ID,
  );
};

export function loadWalletKey(keypair): Keypair {
  if (!keypair || keypair == '') {
    throw new Error('Keypair is required!');
  }

  const decodedKey = new Uint8Array(
    keypair.endsWith('.json') && !Array.isArray(keypair)
      ? JSON.parse(fs.readFileSync(keypair).toString())
      : bs58.decode(keypair),
  );

  const loaded = Keypair.fromSecretKey(decodedKey);
  log.info(`wallet public key: ${loaded.publicKey}`);
  return loaded;
}

export async function loadAuctionHouseProgram(
  walletKeyPair: Keypair,
  env: string,
  customRpcUrl?: string,
) {
  if (customRpcUrl) console.log('USING CUSTOM URL', customRpcUrl);

  // @ts-ignore
  const solConnection = new anchor.web3.Connection(
    //@ts-ignore
    customRpcUrl || getCluster(env),
  );
  const walletWrapper = new anchor.Wallet(walletKeyPair);
  const provider = new anchor.Provider(solConnection, walletWrapper, {
    preflightCommitment: 'recent',
  });
  const idl = await anchor.Program.fetchIdl(AUCTION_HOUSE_PROGRAM_ID, provider);

  return new anchor.Program(idl, AUCTION_HOUSE_PROGRAM_ID, provider);
}

export async function getTokenAmount(
  anchorProgram: anchor.Program,
  account: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
): Promise<number> {
  let amount = 0;
  if (!mint.equals(WRAPPED_SOL_MINT)) {
    try {
      const token =
        await anchorProgram.provider.connection.getTokenAccountBalance(account);
      amount = token.value.uiAmount * Math.pow(10, token.value.decimals);
    } catch (e) {
      log.error(e);
      log.info(
        'Account ',
        account.toBase58(),
        'didnt return value. Assuming 0 tokens.',
      );
    }
  } else {
    amount = await anchorProgram.provider.connection.getBalance(account);
  }
  return amount;
}

export const getBalance = async (
  account: anchor.web3.PublicKey,
  env: string,
  customRpcUrl?: string,
): Promise<number> => {
  if (customRpcUrl) console.log('USING CUSTOM URL', customRpcUrl);
  const connection = new anchor.web3.Connection(
    //@ts-ignore
    customRpcUrl || getCluster(env),
  );
  return await connection.getBalance(account);
};

export async function getProgramAccounts(
  connection: anchor.web3.Connection,
  programId: string,
  configOrCommitment?: any,
): Promise<AccountAndPubkey[]> {
  const extra: any = {};
  let commitment;
  //let encoding;

  if (configOrCommitment) {
    if (typeof configOrCommitment === 'string') {
      commitment = configOrCommitment;
    } else {
      commitment = configOrCommitment.commitment;
      //encoding = configOrCommitment.encoding;

      if (configOrCommitment.dataSlice) {
        extra.dataSlice = configOrCommitment.dataSlice;
      }

      if (configOrCommitment.filters) {
        extra.filters = configOrCommitment.filters;
      }
    }
  }

  const args = connection._buildArgs([programId], commitment, 'base64', extra);
  const unsafeRes = await (connection as any)._rpcRequest(
    'getProgramAccounts',
    args,
  );

  return unsafeResAccounts(unsafeRes.result);
}

function unsafeAccount(account: anchor.web3.AccountInfo<[string, string]>) {
  return {
    // TODO: possible delay parsing could be added here
    data: Buffer.from(account.data[0], 'base64'),
    executable: account.executable,
    lamports: account.lamports,
    // TODO: maybe we can do it in lazy way? or just use string
    owner: account.owner,
  } as anchor.web3.AccountInfo<Buffer>;
}

function unsafeResAccounts(
  data: Array<{
    account: anchor.web3.AccountInfo<[string, string]>;
    pubkey: string;
  }>,
) {
  return data.map(item => ({
    account: unsafeAccount(item.account),
    pubkey: item.pubkey,
  }));
}
