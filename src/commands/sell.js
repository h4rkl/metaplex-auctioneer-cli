import auctioneer, {
  createSellInstruction,
} from '@metaplex-foundation/mpl-auctioneer';
import pack from '@solana/web3.js';
const { Connection, clusterApiUrl, Keypair, PublicKey, Transaction } = pack;
import * as anchor from '@project-serum/anchor';
import pkg from '@project-serum/anchor';
const { BN } = pkg;
import { getAssociatedTokenAddress } from '@solana/spl-token';
import {
  TOKEN_METADATA_PROGRAM_ID,
  WRAPPED_SOL_MINT,
  AUCTION_HOUSE_PROGRAM_ID,
  AUCTIONEER,
} from './constants.js';
import dotenv from 'dotenv';
dotenv.config();

async function sell() {
  const key = process.env.KEY;

  const connection = new Connection(clusterApiUrl('devnet'));
  const wallet = Keypair.fromSecretKey(await Uint8Array.from(key));
  const mint = new PublicKey(process.env.MINT);
  const aH = new PublicKey(process.env.AH);
  const publicKey = wallet.publicKey;

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

  const associatedAddress = await getAssociatedTokenAddress(mint, publicKey);

  const listingConfig = await PublicKey.findProgramAddress(
    [
      Buffer.from('listing_config'),
      publicKey.toBuffer(),
      aH.toBuffer(),
      associatedAddress.toBuffer(),
      WRAPPED_SOL_MINT.toBuffer(),
      mint.toBuffer(),
      new BN(1).toBuffer('le', 8),
    ],
    AUCTIONEER,
  );

  async function getAuctionHouseTradeState(
    auctionHouse,
    wallet,
    tokenAccount,
    treasuryMint,
    tokenMint,
    tokenSize,
    buyPrice,
  ) {
    return await PublicKey.findProgramAddress(
      [
        Buffer.from('auction_house'),
        wallet.toBuffer(),
        auctionHouse.toBuffer(),
        tokenAccount.toBuffer(),
        treasuryMint.toBuffer(),
        tokenMint.toBuffer(),
        new BN(buyPrice).toArrayLike(Buffer, 'le', 8),
        new BN(tokenSize).toArrayLike(Buffer, 'le', 8),
      ],
      AUCTION_HOUSE_PROGRAM_ID,
    );
  }

  const [sellerTradeState, tradeBump] = await getAuctionHouseTradeState(
    aH,
    publicKey,
    associatedAddress,
    WRAPPED_SOL_MINT,
    mint,
    1,
    '18446744073709551615',
  );

  const [freeTradeState, freeTradeBump] = await getAuctionHouseTradeState(
    aH,
    publicKey,
    associatedAddress,
    WRAPPED_SOL_MINT,
    mint,
    1,
    '0',
  );

  const feePayer = await PublicKey.findProgramAddress(
    [Buffer.from('auction_house'), aH.toBuffer(), Buffer.from('fee_payer')],
    AUCTION_HOUSE_PROGRAM_ID,
  );

  const metadata = await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );

  const [signer, signerBump] = await PublicKey.findProgramAddress(
    [Buffer.from('auction_house'), Buffer.from('signer')],
    AUCTION_HOUSE_PROGRAM_ID,
  );

  const accounts = {
    auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
    listingConfig: listingConfig[0],
    wallet: publicKey,
    tokenAccount: associatedAddress,
    metadata: metadata[0],
    authority: new PublicKey('4L3oWp4ANModX1TspSSetKsB8HUu2TiBpuqj5FGJonAh'),
    auctionHouse: aH,
    auctionHouseFeeAccount: feePayer[0],
    sellerTradeState: sellerTradeState,
    freeSellerTradeState: freeTradeState,
    auctioneerAuthority: auctioneerAuthority[0],
    ahAuctioneerPda: pda[0],
    programAsSigner: signer,
  };

  const auctioneerAuthorityBump =
    await auctioneer.AuctioneerAuthority.fromAccountAddress(
      connection,
      auctioneerAuthority[0],
    );

  const args = {
    tradeStateBump: tradeBump,
    freeTradeStateBump: freeTradeBump,
    programAsSignerBump: signerBump,
    auctioneerAuthorityBump: 254,
    tokenSize: new BN(Math.ceil(1 * 1)),
    startTime: 1657714393,
    endTime: 1657714599,
    reservePrice: 1,
    minBidIncrement: 1,
    timeExtPeriod: 1,
    timeExtDelta: 1,
    allowHighBidCancel: true,
  };

  const sellInstruction = await createSellInstruction(accounts, args);

  let tx = new Transaction();
  tx.add(sellInstruction);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet);
  const signature = await connection.sendRawTransaction(tx.serialize());

  const Transact = await connection.confirmTransaction(signature, 'confirmed');

  console.log(Transact);
}

sell();
