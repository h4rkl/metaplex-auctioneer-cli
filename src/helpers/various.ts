import {
  LAMPORTS_PER_SOL,
  AccountInfo,
  PublicKey,
  Connection,
  Keypair,
} from '@solana/web3.js';
import log from 'loglevel';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { CLUSTERS, DEFAULT_CLUSTER } from './constants';
import {
  Uses,
  UseMethod,
  Metadata,
  MetadataKey,
} from '@metaplex-foundation/mpl-token-metadata';
import { web3, Program } from '@project-serum/anchor';

export const getUnixTs = () => {
  return new Date().getTime() / 1000;
};

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function fromUTF8Array(data: number[]) {
  // array of bytes
  let str = '',
    i;

  for (i = 0; i < data.length; i++) {
    const value = data[i];

    if (value < 0x80) {
      str += String.fromCharCode(value);
    } else if (value > 0xbf && value < 0xe0) {
      str += String.fromCharCode(((value & 0x1f) << 6) | (data[i + 1] & 0x3f));
      i += 1;
    } else if (value > 0xdf && value < 0xf0) {
      str += String.fromCharCode(
        ((value & 0x0f) << 12) |
          ((data[i + 1] & 0x3f) << 6) |
          (data[i + 2] & 0x3f),
      );
      i += 2;
    } else {
      // surrogate pair
      const charCode =
        (((value & 0x07) << 18) |
          ((data[i + 1] & 0x3f) << 12) |
          ((data[i + 2] & 0x3f) << 6) |
          (data[i + 3] & 0x3f)) -
        0x010000;

      str += String.fromCharCode(
        (charCode >> 10) | 0xd800,
        (charCode & 0x03ff) | 0xdc00,
      );
      i += 3;
    }
  }

  return str;
}

export function parsePrice(price: string, mantissa: number = LAMPORTS_PER_SOL) {
  return Math.ceil(parseFloat(price) * mantissa);
}

// funtion to parse a date string to unix timestamp which allows for null value
export function parseDate(date?: string) {
  return date ? new Date(date).getTime() / 1000 : new Date().getTime() / 1000;
}

export function addDaysToDate(days: number, date?: string) {
  const result = date? new Date(date) : new Date();
  result.setDate(result.getDate() + days);
  return result;
}

const getMultipleAccountsCore = async (
  connection: any,
  keys: string[],
  commitment: string,
) => {
  const args = connection._buildArgs([keys], commitment, 'base64');

  const unsafeRes = await connection._rpcRequest('getMultipleAccounts', args);
  if (unsafeRes.error) {
    throw new Error(
      'failed to get info about account ' + unsafeRes.error.message,
    );
  }

  if (unsafeRes.result.value) {
    const array = unsafeRes.result.value as AccountInfo<string[]>[];
    return { keys, array };
  }

  // TODO: fix
  throw new Error();
};

export const getMultipleAccounts = async (
  connection: any,
  keys: string[],
  commitment: string,
) => {
  const result = await Promise.all(
    chunks(keys, 99).map(chunk =>
      getMultipleAccountsCore(connection, chunk, commitment),
    ),
  );

  const array = result
    .map(
      a =>
        //@ts-ignore
        a.array.map(acc => {
          if (!acc) {
            return undefined;
          }

          const { data, ...rest } = acc;
          const obj = {
            ...rest,
            data: Buffer.from(data[0], 'base64'),
          } as AccountInfo<Buffer>;
          return obj;
        }) as AccountInfo<Buffer>[],
    )
    //@ts-ignore
    .flat();
  return { keys, array };
};

export function chunks(array, size) {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map(
    (_, index) => array.slice(index * size, (index + 1) * size),
  );
}

export function getCluster(name: string): string {
  if (name === '') {
    log.info('Using cluster', DEFAULT_CLUSTER.name);
    return DEFAULT_CLUSTER.url;
  }

  for (const cluster of CLUSTERS) {
    if (cluster.name === name) {
      log.info('Using cluster', cluster.name);
      return cluster.url;
    }
  }

  throw new Error(`Could not get cluster: ${name}`);
  return null;
}

export function parseUses(useMethod: string, total: number): Uses | null {
  if (!!useMethod && !!total) {
    const realUseMethod = (UseMethod as any)[useMethod];
    if (!realUseMethod) {
      throw new Error(`Invalid use method: ${useMethod}`);
    }
    return new Uses({ useMethod: realUseMethod, total, remaining: total });
  }
  return null;
}

export const getPriceWithMantissa = async (
  price: number,
  mint: web3.PublicKey,
  walletKeyPair: any,
  anchorProgram: Program,
): Promise<number> => {
  const token = new Token(
    anchorProgram.provider.connection,
    new web3.PublicKey(mint),
    TOKEN_PROGRAM_ID,
    walletKeyPair,
  );

  const mintInfo = await token.getMintInfo();

  const mantissa = 10 ** mintInfo.decimals;

  return Math.ceil(price * mantissa);
};

export async function parseCollectionMintPubkey(
  collectionMint: null | PublicKey,
  connection: Connection,
  walletKeypair: Keypair,
) {
  let collectionMintPubkey: null | PublicKey = null;
  if (collectionMint) {
    try {
      collectionMintPubkey = new PublicKey(collectionMint);
    } catch (error) {
      throw new Error(
        'Invalid Pubkey option. Please enter it as a base58 mint id',
      );
    }
    const token = new Token(
      connection,
      collectionMintPubkey,
      TOKEN_PROGRAM_ID,
      walletKeypair,
    );
    await token.getMintInfo();
  }
  if (collectionMintPubkey) {
    const metadata = await Metadata.findByMint(
      connection,
      collectionMintPubkey,
    ).catch();
    if (metadata.data.updateAuthority !== walletKeypair.publicKey.toString()) {
      throw new Error(
        'Invalid collection mint option. Metadata update authority does not match provided wallet keypair',
      );
    }
    const edition = await Metadata.getEdition(connection, collectionMintPubkey);
    if (
      edition.data.key !== MetadataKey.MasterEditionV1 &&
      edition.data.key !== MetadataKey.MasterEditionV2
    ) {
      throw new Error(
        'Invalid collection mint. Provided collection mint does not have a master edition associated with it.',
      );
    }
  }
  return collectionMintPubkey;
}
