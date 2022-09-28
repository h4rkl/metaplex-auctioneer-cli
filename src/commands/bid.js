import auctioneer, {
  createSellInstruction,
  createBuyInstruction,
} from '@metaplex-foundation/mpl-auctioneer';
import { createDelegateAuctioneerInstruction } from '@metaplex-foundation/mpl-auction-house';

import pack from '@solana/web3.js';
const { Connection, clusterApiUrl, Keypair, PublicKey, web3, Transaction } =
  pack;
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
import {
  TOKEN_METADATA_PROGRAM_ID,
  WRAPPED_SOL_MINT,
  AUCTION_HOUSE_PROGRAM_ID,
  AUCTIONEER,
} from '../helpers/constants.js';
import dotenv from 'dotenv';
dotenv.config();

async function by() {
  const sellerKey = [
    201, 127, 6, 149, 29, 164, 83, 181, 23, 2, 115, 92, 244, 206, 178, 80, 20,
    119, 95, 3, 204, 246, 101, 39, 167, 170, 218, 241, 99, 212, 157, 182, 143,
    90, 61, 168, 156, 64, 146, 244, 233, 199, 175, 141, 157, 82, 105, 239, 106,
    66, 192, 46, 179, 146, 240, 230, 249, 137, 89, 255, 64, 139, 2, 139,
  ];

  const buyerKey = [
    51, 2, 34, 195, 173, 249, 234, 30, 34, 12, 67, 162, 12, 127, 33, 117, 228,
    99, 104, 60, 105, 105, 181, 163, 158, 216, 91, 223, 183, 97, 176, 20, 49,
    116, 67, 172, 8, 62, 193, 104, 116, 116, 93, 44, 37, 69, 192, 52, 244, 218,
    171, 128, 127, 107, 188, 46, 106, 189, 22, 24, 50, 46, 218, 166,
  ];

  const connection = new Connection(clusterApiUrl('devnet'));
  const mint = new PublicKey(process.env.MINT);
  const aH = new PublicKey(process.env.AH);
  const seller = Keypair.fromSecretKey(Uint8Array.from(sellerKey));
  const buyer = Keypair.fromSecretKey(Uint8Array.from(buyerKey));

  const auctioneerAuthority = await PublicKey.findProgramAddress(
    [Buffer.from('auctioneer'), aH.toBuffer()],
    AUCTIONEER,
  );

  const pda = await PublicKey.findProgramAddress(
    [
      Buffer.from('auctioneer'),
      aH.toBuffer(),
      auctioneerAuthority[0].toBuffer(),
    ],
    AUCTION_HOUSE_PROGRAM_ID,
  );

  const associatedAddress = await getAssociatedTokenAddress(
    mint,
    seller.publicKey,
  );

  const listingConfig = await PublicKey.findProgramAddress(
    [
      Buffer.from('listing_config'),
      seller.publicKey.toBuffer(),
      aH.toBuffer(),
      associatedAddress.toBuffer(),
      WRAPPED_SOL_MINT.toBuffer(),
      mint.toBuffer(),
      new BN(1).toBuffer('le', 8),
    ],
    AUCTIONEER,
  );

  const metadata = await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );

  const escrowPaymentAccount = await PublicKey.findProgramAddress(
    [Buffer.from('auction_house'), aH.toBuffer(), buyer.publicKey.toBuffer()],
    AUCTION_HOUSE_PROGRAM_ID,
  );
  const buyerTradeState = await PublicKey.findProgramAddress(
    [
      Buffer.from('auction_house'),
      buyer.publicKey.toBuffer(),
      aH.toBuffer(),
      associatedAddress.toBuffer(),
      WRAPPED_SOL_MINT.toBuffer(),
      mint.toBuffer(),
      new BN(1000000000).toArrayLike(Buffer, 'le', 8),
      new BN(1).toArrayLike(Buffer, 'le', 8),
    ],
    AUCTION_HOUSE_PROGRAM_ID,
  );

  console.log(buyerTradeState[0].toBase58());

  const buyArgs = {
    tradeStateBump: buyerTradeState[1],
    escrowPaymentBump: escrowPaymentAccount[1],
    auctioneerAuthorityBump: auctioneerAuthority[1],
    buyerPrice: 1000000000,
    tokenSize: 1,
  };

  const buyAccounts = {
    auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
    listingConfig: listingConfig[0],
    seller: seller.publicKey,
    wallet: buyer.publicKey,
    paymentAccount: buyer.publicKey,
    transferAuthority: seller.publicKey,
    treasuryMint: WRAPPED_SOL_MINT,
    tokenAccount: associatedAddress,
    metadata: metadata[0],
    escrowPaymentAccount: escrowPaymentAccount[0],
    authority: new PublicKey('4L3oWp4ANModX1TspSSetKsB8HUu2TiBpuqj5FGJonAh'),
    auctionHouse: aH,
    auctionHouseFeeAccount: new PublicKey(
      'D1kvoSvimMF8Mr1HzK6qaiwzhqFgbHuSVmeEMC23G3N9',
    ),
    buyerTradeState: buyerTradeState[0],
    auctioneerAuthority: auctioneerAuthority[0],
    ahAuctioneerPda: pda[0],
  };

  const buy = await auctioneer.createBuyInstruction(buyAccounts, buyArgs);

  let tx = new Transaction();
  tx.add(buy);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = buyer.publicKey;
  await tx.sign(buyer);
  const signature = await connection.sendRawTransaction(tx.serialize());

  const Transact = await connection.confirmTransaction(signature, 'confirmed');

  console.log(Transact);
}

by();
