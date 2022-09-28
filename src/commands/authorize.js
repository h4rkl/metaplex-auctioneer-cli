import auctioneer, {
  createSellInstruction,
} from '@metaplex-foundation/mpl-auctioneer';
import pkg, {
  ListingConfigVersion,
  AuctioneerAuthority,
} from '@metaplex-foundation/mpl-auctioneer';
import { createDelegateAuctioneerInstruction } from '@metaplex-foundation/mpl-auction-house';
const { AuctioneerAuthorityArgs } = pkg;
import pack from '@solana/web3.js';
const {
  Connection,
  clusterApiUrl,
  Keypair,
  PublicKey,
  web3,
  Transaction,
  getCluster,
} = pack;
import * as anchor from '@project-serum/anchor';
import pkggg from '@project-serum/anchor';
const { Provider } = pkggg;
import pkkk from '@project-serum/anchor';
const { BN } = pkkk;
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  getMint,
} from '@solana/spl-token';
import pkgg, { Metadata } from '@metaplex-foundation/mpl-token-metadata';
import {
  TOKEN_METADATA_PROGRAM_ID,
  WRAPPED_SOL_MINT,
  AUCTION_HOUSE_PROGRAM_ID,
  AUCTIONEER,
} from '../helpers/constants.js';
import dotenv from 'dotenv';
dotenv.config();
import { Buffer } from 'buffer';
import fs from 'fs';

const key = [
  51, 2, 34, 195, 173, 249, 234, 30, 34, 12, 67, 162, 12, 127, 33, 117, 228, 99,
  104, 60, 105, 105, 181, 163, 158, 216, 91, 223, 183, 97, 176, 20, 49, 116, 67,
  172, 8, 62, 193, 104, 116, 116, 93, 44, 37, 69, 192, 52, 244, 218, 171, 128,
  127, 107, 188, 46, 106, 189, 22, 24, 50, 46, 218, 166,
];
const connection = new Connection(clusterApiUrl('devnet'));
const wallet = Keypair.fromSecretKey(Uint8Array.from(key));
const mint = new PublicKey(process.env.MINT);
const aH = new PublicKey(process.env.AH);
const publicKey = wallet.publicKey;
console.log(publicKey);

const auctioneerAuthority = await PublicKey.findProgramAddress(
  [Buffer.from('auctioneer'), aH.toBuffer()],
  AUCTIONEER,
);

const authorizeKeys = {
  wallet: publicKey,
  auctionHouse: aH,
  auctioneerAuthority: auctioneerAuthority[0],
};

const authorizeIns = await auctioneer.createAuthorizeInstruction(authorizeKeys);

let tx = new Transaction();
tx.add(authorizeIns);
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
tx.feePayer = publicKey;
tx.instructions[0].keys[3];
tx.instructions[0].programId = AUCTIONEER;

await tx.sign(wallet);

const sign = await connection.sendRawTransaction(tx.serialize());

const tra = await connection.confirmTransaction(sign, 'confirmed');
console.log(tra);
