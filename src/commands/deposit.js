import auctioneer from "@metaplex-foundation/mpl-auctioneer";
import pack from "@solana/web3.js"
const {Connection,clusterApiUrl,Keypair,PublicKey, web3,Transaction,getCluster} = pack
import * as anchor from '@project-serum/anchor';
import pkggg from '@project-serum/anchor';
const {Provider} = pkggg;
import pkkk from "@project-serum/anchor";
const { BN } = pkkk;
import {ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress ,TOKEN_PROGRAM_ID, getMint} from "@solana/spl-token";
import pkgg,{ Metadata }from "@metaplex-foundation/mpl-token-metadata"
import {TOKEN_METADATA_PROGRAM_ID,WRAPPED_SOL_MINT,AUCTION_HOUSE_PROGRAM_ID,AUCTIONEER} from "./constants.js";
import dotenv from "dotenv";
dotenv.config();

async function by() {

const key =[51,2,34,195,173,249,234,30,34,12,67,162,12,127,33,117,228,99,104,60,105,105,181,163,158,216,91,223,183,97,176,20,49,116,67,172,8,62,193,104,116,116,93,44,37,69,192,52,244,218,171,128,127,107,188,46,106,189,22,24,50,46,218,166]
;
    const connection = new Connection(clusterApiUrl("devnet"));
    const wallet =  Keypair.fromSecretKey(await Uint8Array.from(key));
    const mint = new PublicKey(process.env.MINT);
    const aH = new PublicKey(process.env.AH);
    const publicKey = wallet.publicKey



    const auctioneerAuthority =  await PublicKey.findProgramAddress([Buffer.from('auctioneer'),
                                                            aH.toBuffer()]
                                                            ,AUCTIONEER);

    const pda =  await PublicKey.findProgramAddress(
                                                     [ Buffer.from('auctioneer'),
                                                      aH.toBuffer(),
                                                      auctioneerAuthority[0].toBuffer()
                                                    ],
                                                    AUCTION_HOUSE_PROGRAM_ID
                                                    );
     

    const feePayer = await PublicKey.findProgramAddress([
                            Buffer.from('auction_house'),
                                aH.toBuffer(),
                                Buffer.from('fee_payer'),
                            ],AUCTION_HOUSE_PROGRAM_ID);
    const [escrowPaymentAccount, escrowPaymentBump] = await PublicKey.findProgramAddress(
        [
          Buffer.from('auction_house'),
          aH.toBuffer(),
          publicKey.toBuffer(),
        ],
        AUCTION_HOUSE_PROGRAM_ID
      )

const depositArgs = {
    escrowPaymentBump: escrowPaymentBump,
    auctioneerAuthorityBump: auctioneerAuthority[1],
    amount: 1000000
  }
  
  const depositAccounts = {
    auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
    wallet: publicKey,
    paymentAccount: publicKey,
    transferAuthority: publicKey,
    escrowPaymentAccount: escrowPaymentAccount,
    treasuryMint: WRAPPED_SOL_MINT,
    authority: new PublicKey("4L3oWp4ANModX1TspSSetKsB8HUu2TiBpuqj5FGJonAh"),
    auctionHouse: aH,
    auctionHouseFeeAccount: feePayer[0],
    auctioneerAuthority: auctioneerAuthority[0],
    ahAuctioneerPda: pda[0]
  }
  
  const deposit = await auctioneer.createDepositInstruction(depositAccounts,depositArgs)
   let tx = new Transaction();
        tx.add(deposit);
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
       
         tx.feePayer = publicKey
         
         tx.sign(wallet);
        
        const signature = await connection.sendRawTransaction(tx.serialize());
  
        const Transact = await connection.confirmTransaction(signature, 'confirmed');
  
        console.log(Transact);

}by();