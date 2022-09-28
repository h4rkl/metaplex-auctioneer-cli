import auctioneer from "@metaplex-foundation/mpl-auctioneer";
import pack from "@solana/web3.js";
const { Connection, clusterApiUrl, Keypair, PublicKey,Transaction } = pack
import * as anchor from "@project-serum/anchor";
import pkg from "@project-serum/anchor";
const { BN } = pkg;
import {getAssociatedTokenAddress,} from "@solana/spl-token";
import {TOKEN_METADATA_PROGRAM_ID,WRAPPED_SOL_MINT,AUCTION_HOUSE_PROGRAM_ID,AUCTIONEER} from "./constants.js";
import dotenv from "dotenv";
dotenv.config();

async function executeSale() {

	const sellerKey = process.env.SELLER

    const buyerKey =process.env.BUYER

	const connection = new Connection(clusterApiUrl("devnet"));
	const seller = Keypair.fromSecretKey( Uint8Array.from(sellerKey));
  	const buyer = Keypair.fromSecretKey( Uint8Array.from(buyerKey));
  	const mint = new PublicKey(process.env.MINT);
  	const aH = new PublicKey(process.env.AH);

  	const auctioneerAuthority =  await PublicKey.
									findProgramAddress([Buffer.from('auctioneer'),
                                                            aH.toBuffer()
														]
                                                            ,AUCTIONEER);
  

  	const pda = await PublicKey.findProgramAddress(
    	[
  	    Buffer.from("auctioneer"),
      	aH.toBuffer(),
      	auctioneerAuthority[0].toBuffer(),
    	],
    	AUCTION_HOUSE_PROGRAM_ID
  	)

  	const associatedAddress = await getAssociatedTokenAddress(
    	mint,
    	seller.publicKey
  	)

  	const listingConfig = await PublicKey.findProgramAddress(
    	[
      	Buffer.from("listing_config"),
     	seller.publicKey.toBuffer(),
      	aH.toBuffer(),
      	associatedAddress.toBuffer(),
      	WRAPPED_SOL_MINT.toBuffer(),
      	mint.toBuffer(),
      	new BN(1).toBuffer("le", 8),
    	],
    	AUCTIONEER
  	);

  	const metadata = await anchor.web3.PublicKey.findProgramAddress([
    	Buffer.from('metadata'),
    	TOKEN_METADATA_PROGRAM_ID.toBuffer(),
    	mint.toBuffer(),
  		],
  	TOKEN_METADATA_PROGRAM_ID,
	)

  	const escrowPaymentAccount = await PublicKey.findProgramAddress(
    	[
        	Buffer.from('auction_house'),
        	aH.toBuffer(),
        	buyer.publicKey.toBuffer(),
    	],
    	AUCTION_HOUSE_PROGRAM_ID
  	)

  	const buyerAssociatedAccount = await getAssociatedTokenAddress(
    	mint,
    	buyer.publicKey
  	)

  	const feePayer = await PublicKey.findProgramAddress([
    	Buffer.from('auction_house'),
    	aH.toBuffer(),
    	Buffer.from('fee_payer'),
  		],
		AUCTION_HOUSE_PROGRAM_ID
	);

  	const buyerTradeState = await PublicKey.findProgramAddress(
    	[	Buffer.from('auction_house'), 
        	buyer.publicKey.toBuffer(), 
        	aH.toBuffer(), 
        	associatedAddress.toBuffer(), 
        	WRAPPED_SOL_MINT.toBuffer(), 
        	mint.toBuffer(), 
        	new BN(1000000000).toArrayLike(Buffer, "le", 8), 
        	new BN(1).toArrayLike(Buffer, "le", 8),
  		],
		AUCTION_HOUSE_PROGRAM_ID
  	)

  	async function getAuctionHouseTradeState( 
    	auctionHouse, 
    	wallet, 
    	tokenAccount, 
    	treasuryMint, 
    	tokenMint, 
    	tokenSize, 
    	buyPrice 
  	) { 
    	return await PublicKey.findProgramAddress( 
      	[ 
        	Buffer.from('auction_house'), 
        	wallet.toBuffer(), 
        	auctionHouse.toBuffer(), 
        	tokenAccount.toBuffer(), 
        	treasuryMint.toBuffer(), 
        	tokenMint.toBuffer(), 
        	new BN(buyPrice).toArrayLike(Buffer, "le", 8), 
        	new BN(tokenSize).toArrayLike(Buffer, "le", 8), 
      	], 
      	AUCTION_HOUSE_PROGRAM_ID 
    ); 
  }

  	const [sellerTradeState, tradeBump] = await getAuctionHouseTradeState( 
    	aH, 
    	seller.publicKey, 
    	associatedAddress, 
    	WRAPPED_SOL_MINT, 
    	mint, 
    	1, 
    	"18446744073709551615" 
  	);

  	const [freeTradeState, freeTradeBump] = await getAuctionHouseTradeState( 
    	aH, 
    	seller.publicKey, 
    	associatedAddress, 
    	WRAPPED_SOL_MINT, 
    	mint, 
    	1, 
    	"0" 
  	);

  	const [signer,signerBump] = await PublicKey.findProgramAddress([Buffer.from('auction_house'), Buffer.from('signer')],
  																	AUCTION_HOUSE_PROGRAM_ID);


  	const executeSaleArgs = {
    	escrowPaymentBump: escrowPaymentAccount[1],
    	freeTradeStateBump: freeTradeBump,
    	programAsSignerBump: signerBump,
    	auctioneerAuthorityBump: auctioneerAuthority[1],
    	buyerPrice: 1000000000,
    	tokenSize: 1
  	}
  
  
  
  	const executeSaleAccounts =  {
  		auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
  		listingConfig: listingConfig[0],
  		buyer: buyer.publicKey,
  		seller: seller.publicKey,
  		tokenAccount: associatedAddress,
  		tokenMint: mint,
  		metadata: metadata[0],
  		treasuryMint: WRAPPED_SOL_MINT,
  		escrowPaymentAccount:escrowPaymentAccount[0] ,
  		sellerPaymentReceiptAccount: seller.publicKey,
  		buyerReceiptTokenAccount: buyerAssociatedAccount,
  		authority: new PublicKey("4L3oWp4ANModX1TspSSetKsB8HUu2TiBpuqj5FGJonAh"),
  		auctionHouse: aH,
  		auctionHouseFeeAccount: feePayer[0],
  		auctionHouseTreasury: new PublicKey("CB6WiXVsqDLQtZ6ZEdUVkGc7yFVB5nHiR7tEMiYePeDd"),
  		buyerTradeState: buyerTradeState[0],
  		sellerTradeState: sellerTradeState,
  		freeTradeState: freeTradeState,
  		auctioneerAuthority:auctioneerAuthority[0],
  		ahAuctioneerPda: pda[0],
  		programAsSigner: signer
  	}

  	const executeSale = await auctioneer.createExecuteSaleInstruction(executeSaleAccounts,executeSaleArgs);

  	let tx = new Transaction();
    tx.add(executeSale);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    tx.feePayer = buyer.publicKey
	tx.sign(buyer);
    const signature = await connection.sendRawTransaction(tx.serialize());

    const Transact = await connection.confirmTransaction(signature, 'confirmed');

    console.log(Transact);


  }

executeSale();
  