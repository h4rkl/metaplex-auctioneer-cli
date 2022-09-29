/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  CancelInstructionAccounts,
  CancelInstructionArgs,
  createAuthorizeInstruction,
  createCancelInstruction,
  createSellInstruction,
  SellInstructionAccounts,
  SellInstructionArgs,
} from '@metaplex-foundation/mpl-auctioneer';
import log from 'loglevel';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import { BN, Idl, web3 } from '@project-serum/anchor';
import {
  AUCTIONEER_PROGRAM_ID,
  AUCTION_HOUSE_PROGRAM_ID,
  BIG_INT_MAX_U64,
  TOKEN_PROGRAM_ID,
  WRAPPED_SOL_MINT,
} from './helpers/constants';
import { decodeMetadata, Metadata } from './helpers/schema';
import IDL from './idl/auctioneer.json';
import {
  getAHAuctioneerPDA,
  getAtaForMint,
  getAuctionHouse,
  getAuctionHouseProgramAsSigner,
  getAuctionHouseTradeState,
  getAuctioneerAuthority,
  getMetadata,
  getTokenAmount,
  loadAuctionHouseProgram,
  loadWalletKey,
  getAuctioneerListingConfig,
  getAuctionHouseFeeAcct,
} from './helpers/accounts';
import * as anchor from '@project-serum/anchor';
import {
  addDaysToDate,
  getCluster,
  getPriceWithMantissa,
  parseDate,
} from './helpers/various';
import { program } from 'commander';
import { sendTransactionWithRetryWithKeypair } from './helpers/transactions';
import {
  createDelegateAuctioneerInstruction,
  createUpdateAuctioneerInstruction,
  DelegateAuctioneerInstructionAccounts,
  DelegateAuctioneerInstructionArgs,
  UpdateAuctioneerInstructionAccounts,
  updateAuctioneerInstructionDiscriminator,
} from '@metaplex-foundation/mpl-auction-house';
import { PublicKey } from '@solana/web3.js';

// Always 1 token for NFTs
const tokenSize = 1;

program.version('0.0.1');
log.setLevel('info');

export async function getAuctionHouseFromOpts(
  auctionHouse: any,
  walletKeyPair: any,
  tMintKey: any,
) {
  let auctionHouseKey: web3.PublicKey;
  if (auctionHouse) {
    auctionHouseKey = new web3.PublicKey(auctionHouse);
  } else {
    log.info(
      'No auction house explicitly passed in, assuming you are creator on it and deriving key...',
    );
    auctionHouseKey = (
      await getAuctionHouse(walletKeyPair.publicKey, tMintKey)
    )[0];
  }
  return auctionHouseKey;
}

programCommand('authorize')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, auctionHouse } = cmd.opts();

    const auctionHouseKey = new web3.PublicKey(auctionHouse);
    const walletKeyPair = loadWalletKey(keypair);

    const connection = new anchor.web3.Connection(getCluster(env));
    const [auctioneerAuthority] = await getAuctioneerAuthority(auctionHouseKey);

    const authorizeKeys = {
      wallet: walletKeyPair.publicKey,
      auctionHouse: auctionHouseKey,
      auctioneerAuthority,
    };

    const instruction = createAuthorizeInstruction(authorizeKeys);

    await sendTransactionWithRetryWithKeypair(
      connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info(
      'Authorized new auctioneer authority at:',
      auctioneerAuthority.toBase58(),
      'for auction house at:',
      auctionHouseKey.toBase58(),
      'now you can `delegate` your authority to the auction house to sell.',
    );
  });

programCommand('delegate')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  .option(
    '-u, --update <boolean>',
    'Update the delegate auctioneer authority',
    false,
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, auctionHouse, update } = cmd.opts();

    const auctionHouseKey = new web3.PublicKey(auctionHouse);
    const walletKeyPair = loadWalletKey(keypair);

    const connection = new anchor.web3.Connection(getCluster(env));
    const [auctioneerAuthority] = await getAuctioneerAuthority(auctionHouseKey);

    const [pda] = await getAHAuctioneerPDA(
      auctionHouseKey,
      auctioneerAuthority,
    );

    const delegateIns: DelegateAuctioneerInstructionAccounts = {
      auctionHouse: auctionHouseKey,
      authority: walletKeyPair.publicKey,
      auctioneerAuthority: auctioneerAuthority,
      ahAuctioneerPda: pda,
    };
    const scope: DelegateAuctioneerInstructionArgs = {
      scopes: [0, 1, 2, 3, 4, 5, 6],
    };

    const instruction = update
      ? createUpdateAuctioneerInstruction(delegateIns, scope)
      : createDelegateAuctioneerInstruction(delegateIns, scope);

    await sendTransactionWithRetryWithKeypair(
      connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info(
      'Delegated auctioneer authority at:',
      auctioneerAuthority.toBase58(),
      'with PDA:',
      pda.toBase58(),
      'for auction house at:',
      auctionHouseKey.toBase58(),
      'now you can `sell` your NFTs.',
    );
  });

programCommand('sell')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  .option('-b, --buy-price <string>', 'Price you wish to sell for')
  .option('-m, --mint <string>', 'Mint of the token to purchase')
  .option(
    '-st, --start-time <string>',
    'Auction start datetime in format `24-Nov-2009 17:57:35` GMT',
  )
  .option(
    '-et, --end-time <string>',
    'Auction end datetime in format `24-Nov-2009 17:57:35` GMT',
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, auctionHouse, buyPrice, mint, startTime, endTime } =
      cmd.opts();

    const startAuction = startTime ? parseDate(startTime) : parseDate();
    const endAuction = endTime
      ? parseDate(endTime)
      : parseDate(addDaysToDate(3).toISOString());

    const auctionHouseKey = new web3.PublicKey(auctionHouse);
    const walletKeyPair = loadWalletKey(keypair);

    const mintKey = new web3.PublicKey(mint);

    const auctionHouseProgram = await loadAuctionHouseProgram(
      walletKeyPair,
      env,
    );
    const auctionHouseObj =
      await auctionHouseProgram.account.auctionHouse.fetch(auctionHouseKey);

    const buyPriceAdjusted = new BN(
      await getPriceWithMantissa(
        buyPrice,
        //@ts-ignore
        auctionHouseObj.treasuryMint,
        walletKeyPair,
        auctionHouseProgram,
      ),
    );

    const minBidIncrement = new BN(
      await getPriceWithMantissa(
        1, // adjust for whole integer bid increment
        mintKey,
        walletKeyPair,
        auctionHouseProgram,
      ),
    );

    const tokenSizeAdjusted = new BN(
      await getPriceWithMantissa(
        tokenSize,
        mintKey,
        walletKeyPair,
        auctionHouseProgram,
      ),
    );

    const [tokenAccountKey] = await getAtaForMint(
      mintKey,
      walletKeyPair.publicKey,
    );

    const [listingConfig] = await getAuctioneerListingConfig(
      walletKeyPair.publicKey,
      auctionHouseKey,
      tokenAccountKey,
      auctionHouseObj.treasuryMint,
      mintKey,
      tokenSizeAdjusted,
    );

    const metadata = await getMetadata(mintKey);

    const [auctioneerAuthority, auctioneerAuthorityBump] =
      await getAuctioneerAuthority(auctionHouseKey);

    const [ahAuctioneerPda] = await getAHAuctioneerPDA(
      auctionHouseKey,
      auctioneerAuthority,
    );

    const [auctionHouseFeeAccount] = await getAuctionHouseFeeAcct(
      auctionHouseKey,
    );

    const [programAsSigner, programAsSignerBump] =
      await getAuctionHouseProgramAsSigner();

    const [sellerTradeState, tradeStateBump] = await getAuctionHouseTradeState(
      walletKeyPair.publicKey,
      auctionHouseKey,
      tokenAccountKey,
      auctionHouseObj.treasuryMint,
      mintKey,
      new BN(BIG_INT_MAX_U64),
      tokenSizeAdjusted,
    );

    const [freeSellerTradeState, freeTradeStateBump] =
      await getAuctionHouseTradeState(
        walletKeyPair.publicKey,
        auctionHouseKey,
        tokenAccountKey,
        auctionHouseObj.treasuryMint,
        mintKey,
        new BN('0'),
        tokenSizeAdjusted,
      );

    function ObjtoString(obj) {
      return Object.keys(obj).map(key => {
        return `${key}: ${obj[key].toString()}`;
      });
    }

    const accounts: SellInstructionAccounts = {
      auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
      listingConfig,
      wallet: walletKeyPair.publicKey,
      tokenAccount: tokenAccountKey,
      metadata,
      authority: walletKeyPair.publicKey,
      auctionHouse: auctionHouseKey,
      auctionHouseFeeAccount,
      sellerTradeState,
      freeSellerTradeState,
      auctioneerAuthority,
      ahAuctioneerPda,
      programAsSigner,
    };

    const args: SellInstructionArgs = {
      tradeStateBump,
      freeTradeStateBump,
      programAsSignerBump,
      auctioneerAuthorityBump,
      tokenSize: tokenSizeAdjusted,
      startTime: startAuction,
      endTime: endAuction,
      reservePrice: buyPriceAdjusted,
      minBidIncrement: minBidIncrement,
      timeExtPeriod: 1,
      timeExtDelta: 1,
      allowHighBidCancel: true,
    };

    const instruction = createSellInstruction(accounts, args);

    await sendTransactionWithRetryWithKeypair(
      auctionHouseProgram.provider.connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info(
      'Set',
      tokenSize,
      mint,
      'for sale for',
      buyPrice,
      'from your account',
      walletKeyPair.publicKey.toString(),
      'with Auction House',
      auctionHouse,
    );
  });

// programCommand('cancel')
//   .option('-ah, --auction-house <string>', 'Specific auction house')
//   .option('-m, --mint <string>', 'Mint of the token to cacnel')
//   .option('-b, --buyer-price <string>', 'Price the item was listed for')
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   .action(async (directory, cmd) => {
//     const { keypair, env, auctionHouse, mint, buyerPrice } = cmd.opts();

//     const auctionHouseKey = new web3.PublicKey(auctionHouse);
//     const walletKeyPair = loadWalletKey(keypair);

//     const mintKey = new web3.PublicKey(mint);

//     const auctionHouseProgram = await loadAuctionHouseProgram(
//       walletKeyPair,
//       env,
//     );
//     const auctionHouseObj =
//       await auctionHouseProgram.account.auctionHouse.fetch(auctionHouseKey);

//     const [tokenAccountKey] = await getAtaForMint(
//       mintKey,
//       walletKeyPair.publicKey,
//     );

//     const [listingConfig] = await getAuctioneerListingConfig(
//       walletKeyPair.publicKey,
//       auctionHouseKey,
//       tokenAccountKey,
//       auctionHouseObj.treasuryMint,
//       mintKey,
//     );

//     const buyPriceAdjusted = new BN(
//       await getPriceWithMantissa(
//         buyerPrice,
//         //@ts-ignore
//         auctionHouseObj.treasuryMint,
//         walletKeyPair,
//         auctionHouseProgram,
//       ),
//     );

//     const tokenSizeAdjusted = new BN(
//       await getPriceWithMantissa(
//         tokenSize,
//         mintKey,
//         walletKeyPair,
//         auctionHouseProgram,
//       ),
//     );

//     const [auctioneerAuthority, auctioneerAuthorityBump] =
//       await getAuctioneerAuthority(auctionHouseKey);

//     const [ahAuctioneerPda] = await getAHAuctioneerPDA(
//       auctionHouseKey,
//       auctioneerAuthority,
//     );

//     const [auctionHouseFeeAccount] = await getAuctionHouseFeeAcct(
//       auctionHouseKey,
//     );

//     const [sellerTradeState] = await getAuctionHouseTradeState(
//       walletKeyPair.publicKey,
//       auctionHouseKey,
//       tokenAccountKey,
//       auctionHouseObj.treasuryMint,
//       mintKey,
//       buyPriceAdjusted,
//       tokenSizeAdjusted,
//     );

//     const args: CancelInstructionArgs = {
//       auctioneerAuthorityBump,
//       buyerPrice: buyPriceAdjusted,
//       tokenSize: tokenSizeAdjusted,
//     };
//     const accounts: CancelInstructionAccounts = {
//       auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
//       listingConfig,
//       seller: walletKeyPair.publicKey,
//       wallet: walletKeyPair.publicKey,
//       tokenAccount: tokenAccountKey,
//       tokenMint: mintKey,
//       authority: walletKeyPair.publicKey,
//       auctionHouse,
//       auctionHouseFeeAccount,
//       tradeState: sellerTradeState,
//       auctioneerAuthority,
//       ahAuctioneerPda,
//     };

//     const instruction = createCancelInstruction(accounts, args);

//     await sendTransactionWithRetryWithKeypair(
//       auctionHouseProgram.provider.connection,
//       walletKeyPair,
//       [instruction],
//       [walletKeyPair],
//       'max',
//     );

//     log.info(
//       'Cancelled buy or sale of',
//       tokenSize,
//       mint,
//       'for',
//       buyerPrice,
//       'from your account with Auction House',
//       auctionHouse,
//     );
//   });

// programCommand('execute_sale')
//   .option('-ah, --auction-house <string>', 'Specific auction house')
//   .option(
//     '-ak, --auction-house-keypair <string>',
//     'If this auction house requires sign off, pass in keypair for it',
//   )
//   .option(
//     '-aks, --auction-house-signs',
//     'If you want to simulate the auction house executing the sale without another signer',
//   )
//   .option('-b, --buy-price <string>', 'Price you wish to sell for')
//   .option('-m, --mint <string>', 'Mint of the token to purchase')
//   .option('-t, --token-size <string>', 'Amount of tokens you want to sell')
//   .option('-bw, --buyer-wallet <string>', 'Buyer wallet')
//   .option('-sw, --seller-wallet <string>', 'Buyer wallet')
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   .action(async (directory, cmd) => {
//     const {
//       keypair,
//       env,
//       auctionHouse,
//       auctionHouseKeypair,
//       buyPrice,
//       mint,
//       tokenSize,
//       auctionHouseSigns,
//       buyerWallet,
//       sellerWallet,
//     } = cmd.opts();

//     const auctionHouseKey = new web3.PublicKey(auctionHouse);
//     const walletKeyPair = loadWalletKey(keypair);

//     const mintKey = new web3.PublicKey(mint);

//     const auctionHouseKeypairLoaded = auctionHouseKeypair
//       ? loadWalletKey(auctionHouseKeypair)
//       : null;
//     const anchorProgram = await loadAuctionHouseProgram(walletKeyPair, env);
//     const auctionHouseObj = await anchorProgram.account.auctionHouse.fetch(
//       auctionHouseKey,
//     );
//     const buyerWalletKey = new web3.PublicKey(buyerWallet);
//     const sellerWalletKey = new web3.PublicKey(sellerWallet);

//     //@ts-ignore
//     const isNative = auctionHouseObj.treasuryMint.equals(WRAPPED_SOL_MINT);
//     const buyPriceAdjusted = new BN(
//       await getPriceWithMantissa(
//         buyPrice,
//         //@ts-ignore
//         auctionHouseObj.treasuryMint,
//         walletKeyPair,
//         anchorProgram,
//       ),
//     );

//     const tokenSizeAdjusted = new BN(
//       await getPriceWithMantissa(
//         tokenSize,
//         mintKey,
//         walletKeyPair,
//         anchorProgram,
//       ),
//     );

//     const tokenAccountKey = (await getAtaForMint(mintKey, sellerWalletKey))[0];

//     const buyerTradeState = (
//       await getAuctionHouseTradeState(
//         auctionHouseKey,
//         buyerWalletKey,
//         tokenAccountKey,
//         //@ts-ignore
//         auctionHouseObj.treasuryMint,
//         mintKey,
//         tokenSizeAdjusted,
//         buyPriceAdjusted,
//       )
//     )[0];

//     const sellerTradeState = (
//       await getAuctionHouseTradeState(
//         auctionHouseKey,
//         sellerWalletKey,
//         tokenAccountKey,
//         //@ts-ignore
//         auctionHouseObj.treasuryMint,
//         mintKey,
//         tokenSizeAdjusted,
//         buyPriceAdjusted,
//       )
//     )[0];

//     const [freeTradeState, freeTradeStateBump] =
//       await getAuctionHouseTradeState(
//         auctionHouseKey,
//         sellerWalletKey,
//         tokenAccountKey,
//         //@ts-ignore
//         auctionHouseObj.treasuryMint,
//         mintKey,
//         tokenSizeAdjusted,
//         new BN(0),
//       );
//     const [escrowPaymentAccount, bump] = await getAuctionHouseBuyerEscrow(
//       auctionHouseKey,
//       buyerWalletKey,
//     );
//     const [programAsSigner, programAsSignerBump] =
//       await getAuctionHouseProgramAsSigner();
//     const metadata = await getMetadata(mintKey);

//     const metadataObj = await anchorProgram.provider.connection.getAccountInfo(
//       metadata,
//     );
//     const metadataDecoded: Metadata = decodeMetadata(
//       Buffer.from(metadataObj.data),
//     );

//     const remainingAccounts = [];

//     for (let i = 0; i < metadataDecoded.data.creators.length; i++) {
//       remainingAccounts.push({
//         pubkey: new web3.PublicKey(metadataDecoded.data.creators[i].address),
//         isWritable: true,
//         isSigner: false,
//       });
//       if (!isNative) {
//         remainingAccounts.push({
//           pubkey: (
//             await getAtaForMint(
//               //@ts-ignore
//               auctionHouseObj.treasuryMint,
//               remainingAccounts[remainingAccounts.length - 1].pubkey,
//             )
//           )[0],
//           isWritable: true,
//           isSigner: false,
//         });
//       }
//     }
//     const signers = [];
//     //@ts-ignore
//     const tMint: web3.PublicKey = auctionHouseObj.treasuryMint;

//     const instruction = await anchorProgram.instruction.executeSale(
//       bump,
//       freeTradeStateBump,
//       programAsSignerBump,
//       buyPriceAdjusted,
//       tokenSizeAdjusted,
//       {
//         accounts: {
//           buyer: buyerWalletKey,
//           seller: sellerWalletKey,
//           metadata,
//           tokenAccount: tokenAccountKey,
//           tokenMint: mintKey,
//           escrowPaymentAccount,
//           treasuryMint: tMint,
//           sellerPaymentReceiptAccount: isNative
//             ? sellerWalletKey
//             : (
//                 await getAtaForMint(tMint, sellerWalletKey)
//               )[0],
//           buyerReceiptTokenAccount: (
//             await getAtaForMint(mintKey, buyerWalletKey)
//           )[0],
//           //@ts-ignore
//           authority: auctionHouseObj.authority,
//           auctionHouse: auctionHouseKey,
//           //@ts-ignore
//           auctionHouseFeeAccount: auctionHouseObj.auctionHouseFeeAccount,
//           //@ts-ignore
//           auctionHouseTreasury: auctionHouseObj.auctionHouseTreasury,
//           sellerTradeState,
//           buyerTradeState,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: web3.SystemProgram.programId,
//           ataProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
//           programAsSigner,
//           rent: web3.SYSVAR_RENT_PUBKEY,
//           freeTradeState,
//         },
//         remainingAccounts,
//         signers,
//       },
//     );

//     if (auctionHouseKeypairLoaded) {
//       signers.push(auctionHouseKeypairLoaded);

//       instruction.keys
//         .filter(k => k.pubkey.equals(auctionHouseKeypairLoaded.publicKey))
//         .map(k => (k.isSigner = true));
//     }

//     if (!auctionHouseSigns) {
//       instruction.keys
//         .filter(k => k.pubkey.equals(walletKeyPair.publicKey))
//         .map(k => (k.isSigner = true));
//     }

//     await sendTransactionWithRetryWithKeypair(
//       anchorProgram.provider.connection,
//       auctionHouseSigns ? auctionHouseKeypairLoaded : walletKeyPair,
//       [instruction],
//       signers,
//       'max',
//     );

//     log.info(
//       'Accepted',
//       tokenSize,
//       mint,
//       'sale from wallet',
//       sellerWalletKey.toBase58(),
//       'to',
//       buyerWalletKey.toBase58(),
//       'for',
//       buyPrice,
//       'from your account with Auction House',
//       auctionHouse,
//     );
//   });

// programCommand('buy')
//   .option('-ah, --auction-house <string>', 'Specific auction house')
//   .option(
//     '-ak, --auction-house-keypair <string>',
//     'If this auction house requires sign off, pass in keypair for it',
//   )
//   .option('-b, --buy-price <string>', 'Price you wish to purchase for')
//   .option('-m, --mint <string>', 'Mint of the token to purchase')
//   .option(
//     '-ta, --token-account <string>',
//     'Token account of the token to purchase - defaults to finding the one with highest balance (for NFTs)',
//   )
//   .option('-t, --token-size <string>', 'Amount of tokens you want to purchase')
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   .action(async (directory, cmd) => {
//     const {
//       keypair,
//       env,
//       auctionHouse,
//       auctionHouseKeypair,
//       buyPrice,
//       mint,
//       tokenSize,
//       tokenAccount,
//     } = cmd.opts();

//     const auctionHouseKey = new web3.PublicKey(auctionHouse);
//     const walletKeyPair = loadWalletKey(keypair);

//     const mintKey = new web3.PublicKey(mint);

//     const auctionHouseKeypairLoaded = auctionHouseKeypair
//       ? loadWalletKey(auctionHouseKeypair)
//       : null;
//     const anchorProgram = await loadAuctionHouseProgram(walletKeyPair, env);
//     const auctionHouseObj = await anchorProgram.account.auctionHouse.fetch(
//       auctionHouseKey,
//     );

//     const buyPriceAdjusted = new BN(
//       await getPriceWithMantissa(
//         buyPrice,
//         //@ts-ignore
//         auctionHouseObj.treasuryMint,
//         walletKeyPair,
//         anchorProgram,
//       ),
//     );

//     const tokenSizeAdjusted = new BN(
//       await getPriceWithMantissa(
//         tokenSize,
//         mintKey,
//         walletKeyPair,
//         anchorProgram,
//       ),
//     );

//     const [escrowPaymentAccount, escrowBump] = await getAuctionHouseBuyerEscrow(
//       auctionHouseKey,
//       walletKeyPair.publicKey,
//     );

//     const results =
//       await anchorProgram.provider.connection.getTokenLargestAccounts(mintKey);

//     const tokenAccountKey: web3.PublicKey = tokenAccount
//       ? new web3.PublicKey(tokenAccount)
//       : results.value[0].address;

//     const [tradeState, tradeBump] = await getAuctionHouseTradeState(
//       auctionHouseKey,
//       walletKeyPair.publicKey,
//       tokenAccountKey,
//       //@ts-ignore
//       auctionHouseObj.treasuryMint,
//       mintKey,
//       tokenSizeAdjusted,
//       buyPriceAdjusted,
//     );

//     //@ts-ignore
//     const isNative = auctionHouseObj.treasuryMint.equals(WRAPPED_SOL_MINT);

//     const ata = (
//       await getAtaForMint(
//         //@ts-ignore
//         auctionHouseObj.treasuryMint,
//         walletKeyPair.publicKey,
//       )
//     )[0];
//     const transferAuthority = web3.Keypair.generate();
//     const signers = isNative ? [] : [transferAuthority];
//     const instruction = await anchorProgram.instruction.buy(
//       tradeBump,
//       escrowBump,
//       buyPriceAdjusted,
//       tokenSizeAdjusted,
//       {
//         accounts: {
//           wallet: walletKeyPair.publicKey,
//           paymentAccount: isNative ? walletKeyPair.publicKey : ata,
//           transferAuthority: isNative
//             ? walletKeyPair.publicKey
//             : transferAuthority.publicKey,
//           metadata: await getMetadata(mintKey),
//           tokenAccount: tokenAccountKey,
//           escrowPaymentAccount,
//           //@ts-ignore
//           treasuryMint: auctionHouseObj.treasuryMint,
//           //@ts-ignore
//           authority: auctionHouseObj.authority,
//           auctionHouse: auctionHouseKey,
//           //@ts-ignore
//           auctionHouseFeeAccount: auctionHouseObj.auctionHouseFeeAccount,
//           buyerTradeState: tradeState,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: web3.SystemProgram.programId,
//           rent: web3.SYSVAR_RENT_PUBKEY,
//         },
//       },
//     );

//     if (auctionHouseKeypairLoaded) {
//       signers.push(auctionHouseKeypairLoaded);

//       instruction.keys
//         .filter(k => k.pubkey.equals(auctionHouseKeypairLoaded.publicKey))
//         .map(k => (k.isSigner = true));
//     }
//     if (!isNative) {
//       instruction.keys
//         .filter(k => k.pubkey.equals(transferAuthority.publicKey))
//         .map(k => (k.isSigner = true));
//     }
//     const instructions = [
//       ...(isNative
//         ? []
//         : [
//             Token.createApproveInstruction(
//               TOKEN_PROGRAM_ID,
//               ata,
//               transferAuthority.publicKey,
//               walletKeyPair.publicKey,
//               [],
//               buyPriceAdjusted.toNumber(),
//             ),
//           ]),

//       instruction,
//       ...(isNative
//         ? []
//         : [
//             Token.createRevokeInstruction(
//               TOKEN_PROGRAM_ID,
//               ata,
//               walletKeyPair.publicKey,
//               [],
//             ),
//           ]),
//     ];
//     await sendTransactionWithRetryWithKeypair(
//       anchorProgram.provider.connection,
//       walletKeyPair,
//       instructions,
//       signers,
//       'max',
//     );

//     log.info('Made offer for ', buyPrice);
//   });

// programCommand('deposit')
//   .option('-ah, --auction-house <string>', 'Specific auction house')
//   .option(
//     '-ak, --auction-house-keypair <string>',
//     'If this auction house requires sign off, pass in keypair for it',
//   )
//   .option('-a, --amount <string>', 'Amount to deposit')
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   .action(async (directory, cmd) => {
//     const { keypair, env, amount, auctionHouse, auctionHouseKeypair } =
//       cmd.opts();
//     const auctionHouseKey = new web3.PublicKey(auctionHouse);
//     const walletKeyPair = loadWalletKey(keypair);

//     const auctionHouseKeypairLoaded = auctionHouseKeypair
//       ? loadWalletKey(auctionHouseKeypair)
//       : null;
//     const anchorProgram = await loadAuctionHouseProgram(walletKeyPair, env);
//     const auctionHouseObj = await anchorProgram.account.auctionHouse.fetch(
//       auctionHouseKey,
//     );
//     const amountAdjusted = await getPriceWithMantissa(
//       amount,
//       //@ts-ignore
//       auctionHouseObj.treasuryMint,
//       walletKeyPair,
//       anchorProgram,
//     );
//     const [escrowPaymentAccount, bump] = await getAuctionHouseBuyerEscrow(
//       auctionHouseKey,
//       walletKeyPair.publicKey,
//     );

//     //@ts-ignore
//     const isNative = auctionHouseObj.treasuryMint.equals(WRAPPED_SOL_MINT);

//     const ata = (
//       await getAtaForMint(
//         //@ts-ignore
//         auctionHouseObj.treasuryMint,
//         walletKeyPair.publicKey,
//       )
//     )[0];
//     const transferAuthority = web3.Keypair.generate();
//     const signers = isNative ? [] : [transferAuthority];
//     const instruction = await anchorProgram.instruction.deposit(
//       bump,
//       new BN(amountAdjusted),
//       {
//         accounts: {
//           wallet: walletKeyPair.publicKey,
//           paymentAccount: isNative ? walletKeyPair.publicKey : ata,
//           transferAuthority: isNative
//             ? web3.SystemProgram.programId
//             : transferAuthority.publicKey,
//           escrowPaymentAccount,
//           //@ts-ignore
//           treasuryMint: auctionHouseObj.treasuryMint,
//           //@ts-ignore
//           authority: auctionHouseObj.authority,
//           auctionHouse: auctionHouseKey,
//           //@ts-ignore
//           auctionHouseFeeAccount: auctionHouseObj.auctionHouseFeeAccount,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           systemProgram: web3.SystemProgram.programId,
//           rent: web3.SYSVAR_RENT_PUBKEY,
//         },
//       },
//     );

//     if (auctionHouseKeypairLoaded) {
//       signers.push(auctionHouseKeypairLoaded);

//       instruction.keys
//         .filter(k => k.pubkey.equals(auctionHouseKeypairLoaded.publicKey))
//         .map(k => (k.isSigner = true));
//     }

//     if (!isNative) {
//       instruction.keys
//         .filter(k => k.pubkey.equals(transferAuthority.publicKey))
//         .map(k => (k.isSigner = true));
//     }

//     const currBal = await getTokenAmount(
//       anchorProgram,
//       escrowPaymentAccount,
//       //@ts-ignore
//       auctionHouseObj.treasuryMint,
//     );

//     const instructions = [
//       ...(isNative
//         ? []
//         : [
//             Token.createApproveInstruction(
//               TOKEN_PROGRAM_ID,
//               ata,
//               transferAuthority.publicKey,
//               walletKeyPair.publicKey,
//               [],
//               amountAdjusted,
//             ),
//           ]),

//       instruction,
//       ...(isNative
//         ? []
//         : [
//             Token.createRevokeInstruction(
//               TOKEN_PROGRAM_ID,
//               ata,
//               walletKeyPair.publicKey,
//               [],
//             ),
//           ]),
//     ];
//     await sendTransactionWithRetryWithKeypair(
//       anchorProgram.provider.connection,
//       walletKeyPair,
//       instructions,
//       signers,
//       'max',
//     );

//     log.info(
//       'Deposited ',
//       amountAdjusted,
//       'to your account with Auction House',
//       auctionHouse,
//       '. New Balance:',
//       currBal + amountAdjusted,
//     );
//   });

function programCommand(name: string) {
  return program
    .command(name)
    .option(
      '-e, --env <string>',
      'Solana cluster env name, i.e. mainnet-beta, testnet, devnet',
      'devnet', //mainnet-beta, testnet, devnet
    )
    .option(
      '-k, --keypair <path>',
      `Solana wallet location`,
      '--keypair not provided',
    )
    .option('-l, --log-level <string>', 'log level', setLogLevel);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setLogLevel(value, prev) {
  if (value === undefined || value === null) {
    return;
  }
  log.info('setting the log value to: ' + value);
  log.setLevel(value);
}

program.parse(process.argv);
