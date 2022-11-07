/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  CancelInstructionAccounts,
  CancelInstructionArgs,
  SellInstructionAccounts,
  SellInstructionArgs,
  createAuthorizeInstruction,
  createCancelInstruction,
  createExecuteSaleInstruction,
  createSellInstruction,
  ExecuteSaleInstructionAccounts,
  ExecuteSaleInstructionArgs,
  DepositInstructionAccounts,
  DepositInstructionArgs,
  createDepositInstruction,
  createWithdrawInstruction,
  WithdrawInstructionAccounts,
  WithdrawInstructionArgs,
  createBuyInstruction,
  BuyInstructionArgs,
  BuyInstructionAccounts,
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
  getAuctionHouseBuyerEscrow,
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
  CloseEscrowAccountInstructionAccounts,
  CloseEscrowAccountInstructionArgs,
  createCloseEscrowAccountInstruction,
  createDelegateAuctioneerInstruction,
  createUpdateAuctioneerInstruction,
  DelegateAuctioneerInstructionAccounts,
  DelegateAuctioneerInstructionArgs,
  UpdateAuctioneerInstructionAccounts,
  updateAuctioneerInstructionDiscriminator,
} from '@metaplex-foundation/mpl-auction-house';
import { PublicKey } from '@solana/web3.js';

// A function to easily inspect the accounts and args base58 addresses
const ObjtoString = obj => {
  return Object.keys(obj).map(key => {
    return `${key}: ${obj[key].toString()}`;
  });
};

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
  .description('Authorize the Auctioneer to manage an Auction House.')
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
  .description(
    'Delegate the Auctioneer to manage an Auction House (update delegate using flag).',
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, auctionHouse, update } = cmd.opts();

    const auctionHouseKey = new web3.PublicKey(auctionHouse);
    const walletKeyPair = loadWalletKey(keypair);

    const connection = new anchor.web3.Connection(getCluster(env));
    const [auctioneerAuthority] = await getAuctioneerAuthority(auctionHouseKey);

    const [ahAuctioneerPda] = await getAHAuctioneerPDA(
      auctionHouseKey,
      auctioneerAuthority,
    );

    const delegateIns: DelegateAuctioneerInstructionAccounts = {
      auctionHouse: auctionHouseKey,
      authority: walletKeyPair.publicKey,
      auctioneerAuthority: auctioneerAuthority,
      ahAuctioneerPda,
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
      ahAuctioneerPda.toBase58(),
      'for auction house at:',
      auctionHouseKey.toBase58(),
      'now you can `sell` your NFTs.',
    );
  });

programCommand('deposit')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  .option('-a, --amount <string>', 'Amount to deposit')
  .description(
    'Deposit `amount` into the escrow payment account for your specific wallet.',
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, amount, auctionHouse } = cmd.opts();
    const auctionHouseKey = new web3.PublicKey(auctionHouse);
    const walletKeyPair = loadWalletKey(keypair);

    const anchorProgram = await loadAuctionHouseProgram(walletKeyPair, env);
    const auctionHouseObj = await anchorProgram.account.auctionHouse.fetch(
      auctionHouseKey,
    );
    const amountAdjusted = await getPriceWithMantissa(
      amount,
      auctionHouseObj.treasuryMint,
      walletKeyPair,
      anchorProgram,
    );
    const [escrowPaymentAccount, escrowPaymentBump] =
      await getAuctionHouseBuyerEscrow(
        auctionHouseKey,
        walletKeyPair.publicKey,
      );
    const [auctioneerAuthority, auctioneerAuthorityBump] =
      await getAuctioneerAuthority(auctionHouseKey);

    const [ahAuctioneerPda] = await getAHAuctioneerPDA(
      auctionHouseKey,
      auctioneerAuthority,
    );

    const args: DepositInstructionArgs = {
      escrowPaymentBump,
      auctioneerAuthorityBump,
      amount: amountAdjusted,
    };

    const accounts: DepositInstructionAccounts = {
      auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
      wallet: walletKeyPair.publicKey,
      paymentAccount: walletKeyPair.publicKey,
      transferAuthority: walletKeyPair.publicKey,
      escrowPaymentAccount,
      treasuryMint: auctionHouseObj.treasuryMint,
      authority: walletKeyPair.publicKey,
      auctionHouse: auctionHouseKey,
      auctionHouseFeeAccount: auctionHouseObj.auctionHouseFeeAccount,
      auctioneerAuthority,
      ahAuctioneerPda,
    };

    console.log('accounts', ObjtoString(accounts));

    const instruction = createDepositInstruction(accounts, args);

    const currBal = await getTokenAmount(
      anchorProgram,
      escrowPaymentAccount,
      auctionHouseObj.treasuryMint,
    );

    await sendTransactionWithRetryWithKeypair(
      anchorProgram.provider.connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info(
      'Deposited ',
      amountAdjusted,
      'to your account with Auction House',
      auctionHouse,
      '. New Balance:',
      currBal + amountAdjusted,
    );
  });

programCommand('sell')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  .option('-b, --buy-price <number>', 'Price you wish to sell for')
  .option('-m, --mint <string>', 'Mint of the token to purchase')
  .option(
    '-st, --start-time <string>',
    'Auction start datetime in format `24-Nov-2009 17:57:35` GMT',
  )
  .option(
    '-et, --end-time <string>',
    'Auction end datetime in format `24-Nov-2009 17:57:35` GMT',
  )
  .description(
    'Create a sell bid by creating a `seller_trade_state` account and approving the program as the token delegate.',
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

    const tx = await sendTransactionWithRetryWithKeypair(
      auctionHouseProgram.provider.connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info(
      'Transaction:',
      tx.txid,
      '| Sell',
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

programCommand('cancel')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  .option('-m, --mint <string>', 'Mint of the token to cancel')
  .option('-b, --buyer-price <number>', 'Price the item was listed for')
  .option('-cb, --cancel-bid <number>', 'The bid price to cancel')
  .description(
    'Cancel a bid or ask by revoking the token delegate, transferring all lamports from the trade state account to the fee payer, and setting the trade state account data to zero so it can be garbage collected.',
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, auctionHouse, mint, buyerPrice, cancelBid } =
      cmd.opts();

    const auctionHouseKey = new web3.PublicKey(auctionHouse);
    const walletKeyPair = loadWalletKey(keypair);

    const mintKey = new web3.PublicKey(mint);

    const auctionHouseProgram = await loadAuctionHouseProgram(
      walletKeyPair,
      env,
    );
    const auctionHouseObj =
      await auctionHouseProgram.account.auctionHouse.fetch(auctionHouseKey);

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
    );

    const buyPriceAdjusted = new BN(
      await getPriceWithMantissa(
        buyerPrice,
        auctionHouseObj.treasuryMint,
        walletKeyPair,
        auctionHouseProgram,
      ),
    );

    const cancelBidAdjusted = new BN(
      await getPriceWithMantissa(
        cancelBid,
        auctionHouseObj.treasuryMint,
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

    const [auctioneerAuthority, auctioneerAuthorityBump] =
      await getAuctioneerAuthority(auctionHouseKey);

    const [ahAuctioneerPda] = await getAHAuctioneerPDA(
      auctionHouseKey,
      auctioneerAuthority,
    );

    const [auctionHouseFeeAccount] = await getAuctionHouseFeeAcct(
      auctionHouseKey,
    );

    const [sellerTradeState] = await getAuctionHouseTradeState(
      walletKeyPair.publicKey,
      auctionHouseKey,
      tokenAccountKey,
      auctionHouseObj.treasuryMint,
      mintKey,
      cancelBidAdjusted,
      tokenSizeAdjusted,
    );

    const args: CancelInstructionArgs = {
      auctioneerAuthorityBump,
      buyerPrice: buyPriceAdjusted,
      tokenSize: tokenSizeAdjusted,
    };
    const accounts: CancelInstructionAccounts = {
      auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
      listingConfig,
      seller: walletKeyPair.publicKey,
      wallet: walletKeyPair.publicKey,
      tokenAccount: tokenAccountKey,
      tokenMint: mintKey,
      authority: walletKeyPair.publicKey,
      auctionHouse: auctionHouseKey,
      auctionHouseFeeAccount,
      tradeState: sellerTradeState,
      auctioneerAuthority,
      ahAuctioneerPda,
    };

    const instruction = createCancelInstruction(accounts, args);

    await sendTransactionWithRetryWithKeypair(
      auctionHouseProgram.provider.connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info(
      'Cancelled bid of',
      cancelBid,
      'on',
      mint,
      'with Auction House',
      auctionHouse,
    );
  });

programCommand('withdraw')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  .option('-m, --mint <string>', 'Mint of the token to cancel')
  .option('-a, --amount <number>', 'Amount to withdraw')
  .description(
    'Withdraw `amount` from the escrow payment account for your specific wallet.',
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, auctionHouse, mint, amount } = cmd.opts();

    const auctionHouseKey = new web3.PublicKey(auctionHouse);
    const walletKeyPair = loadWalletKey(keypair);

    const auctionHouseProgram = await loadAuctionHouseProgram(
      walletKeyPair,
      env,
    );
    const auctionHouseObj =
      await auctionHouseProgram.account.auctionHouse.fetch(auctionHouseKey);

    const amountAdjusted = new BN(
      await getPriceWithMantissa(
        amount,
        auctionHouseObj.treasuryMint,
        walletKeyPair,
        auctionHouseProgram,
      ),
    );

    const [auctioneerAuthority, auctioneerAuthorityBump] =
      await getAuctioneerAuthority(auctionHouseKey);

    const [ahAuctioneerPda] = await getAHAuctioneerPDA(
      auctionHouseKey,
      auctioneerAuthority,
    );

    const [escrowPaymentAccount, escrowPaymentBump] =
      await getAuctionHouseBuyerEscrow(
        auctionHouseKey,
        walletKeyPair.publicKey,
      );

    const [auctionHouseFeeAccount] = await getAuctionHouseFeeAcct(
      auctionHouseKey,
    );

    const args: WithdrawInstructionArgs = {
      escrowPaymentBump,
      auctioneerAuthorityBump,
      amount: amountAdjusted,
    };
    const accounts: WithdrawInstructionAccounts = {
      auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
      wallet: walletKeyPair.publicKey,
      receiptAccount: walletKeyPair.publicKey,
      escrowPaymentAccount,
      treasuryMint: auctionHouseObj.treasuryMint,
      authority: walletKeyPair.publicKey,
      auctionHouse: auctionHouseKey,
      auctionHouseFeeAccount,
      auctioneerAuthority,
      ahAuctioneerPda,
    };

    const instruction = createWithdrawInstruction(accounts, args);

    await sendTransactionWithRetryWithKeypair(
      auctionHouseProgram.provider.connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info('Withdrew amount of', amount, 'on Auction House', auctionHouse);
  });

programCommand('buy')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  .option('-b, --buy-price <string>', 'Price you wish to purchase for')
  .option('-m, --mint <string>', 'Mint of the NFT/token to purchase')
  .option('-sw, --seller-wallet <string>', 'Seller wallet')
  .description(
    'Create a private buy bid by creating a `buyer_trade_state` account and an `escrow_payment` account and funding the escrow with the necessary SOL or SPL token amount.',
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, auctionHouse, buyPrice, mint, sellerWallet } = cmd.opts();

    const sellerWalletKey = new web3.PublicKey(sellerWallet);

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
        auctionHouseObj.treasuryMint,
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

    const [paymentAccountKey] = await getAtaForMint(
      auctionHouseObj.treasuryMint,
      walletKeyPair.publicKey,
    );

    const [tokenAccountKey] = await getAtaForMint(
      mintKey,
      sellerWalletKey,
    );

    const [listingConfig] = await getAuctioneerListingConfig(
      sellerWalletKey,
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

    const [buyerTradeState, tradeStateBump] = await getAuctionHouseTradeState(
      walletKeyPair.publicKey,
      auctionHouseKey,
      tokenAccountKey,
      auctionHouseObj.treasuryMint,
      mintKey,
      buyPriceAdjusted,
      tokenSizeAdjusted,
    );

    const [escrowPaymentAccount, escrowPaymentBump] =
      await getAuctionHouseBuyerEscrow(
        auctionHouseKey,
        walletKeyPair.publicKey,
      );

    const args: BuyInstructionArgs = {
      tradeStateBump,
      escrowPaymentBump,
      auctioneerAuthorityBump,
      buyerPrice: buyPriceAdjusted,
      tokenSize: tokenSizeAdjusted,
    };
    const accounts: BuyInstructionAccounts = {
      auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
      listingConfig,
      seller: sellerWalletKey,
      wallet: walletKeyPair.publicKey,
      paymentAccount: paymentAccountKey,
      transferAuthority: walletKeyPair.publicKey,
      treasuryMint: auctionHouseObj.treasuryMint,
      tokenAccount: tokenAccountKey,
      metadata,
      escrowPaymentAccount,
      authority: auctionHouseObj.authority,
      auctionHouse: auctionHouseKey,
      auctionHouseFeeAccount: auctionHouseObj.auctionHouseFeeAccount,
      buyerTradeState,
      auctioneerAuthority,
      ahAuctioneerPda,
    };
    
    const instruction = createBuyInstruction(accounts, args);

    const tx = await sendTransactionWithRetryWithKeypair(
      auctionHouseProgram.provider.connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info(
      'Transaction:',
      tx.txid,
      '| Buy',
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

  programCommand('close_account')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  .option('-b, --buy-price <string>', 'Price you wish to purchase for')
  .description('Close the escrow account of the user')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const { keypair, env, auctionHouse } = cmd.opts();

    const auctionHouseKey = new web3.PublicKey(auctionHouse);
    const walletKeyPair = loadWalletKey(keypair);

    const auctionHouseProgram = await loadAuctionHouseProgram(
      walletKeyPair,
      env,
    );

    const [escrowPaymentAccount, escrowPaymentBump] =
      await getAuctionHouseBuyerEscrow(
        auctionHouseKey,
        walletKeyPair.publicKey,
      );

      const args: CloseEscrowAccountInstructionArgs = {
        escrowPaymentBump
    };
    const accounts: CloseEscrowAccountInstructionAccounts = {
        wallet: walletKeyPair.publicKey,
        escrowPaymentAccount,
        auctionHouse: auctionHouseKey,
    };

    const instruction = createCloseEscrowAccountInstruction(accounts, args);

    const tx = await sendTransactionWithRetryWithKeypair(
      auctionHouseProgram.provider.connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info(
      'Transaction:',
      tx.txid,
      '| Close escrow acount',
      'from your account',
      walletKeyPair.publicKey.toString(),
      'with Auction House',
      auctionHouse,
    );
  });

programCommand('execute_sale')
  .option('-ah, --auction-house <string>', 'Specific auction house')
  .option('-b, --buy-price <string>', 'Price you wish to sell for')
  .option('-m, --mint <string>', 'Mint of the token to purchase')
  .option('-t, --token-size <string>', 'Amount of tokens you want to sell')
  .option('-bw, --buyer-wallet <string>', 'Buyer wallet')
  .option('-sw, --seller-wallet <string>', 'Buyer wallet')
  .description('Execute sale between provided buyer and seller trade state accounts transferring funds to seller wallet and token to buyer wallet.')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  .action(async (directory, cmd) => {
    const {
      keypair,
      env,
      auctionHouse,
      buyPrice,
      mint,
      tokenSize,
      buyerWallet,
      sellerWallet,
    } = cmd.opts();

    const auctionHouseKey = new web3.PublicKey(auctionHouse);
    const walletKeyPair = loadWalletKey(keypair);

    const mintKey = new web3.PublicKey(mint);
    const buyer = new web3.PublicKey(buyerWallet);
    const seller = new web3.PublicKey(sellerWallet);

    const [auctioneerAuthority, auctioneerAuthorityBump] =
      await getAuctioneerAuthority(auctionHouseKey);

    const anchorProgram = await loadAuctionHouseProgram(walletKeyPair, env);
    const auctionHouseObj = await anchorProgram.account.auctionHouse.fetch(
      auctionHouseKey,
    );
    const [auctionHouseFeeAccount] = await getAuctionHouseFeeAcct(
      auctionHouseKey,
    );
    const buyerWalletKey = new web3.PublicKey(buyerWallet);
    const sellerWalletKey = new web3.PublicKey(sellerWallet);

    const [buyerReceiptTokenAccount] = await getAtaForMint(mintKey, buyerWalletKey);

    const buyPriceAdjusted = new BN(
      await getPriceWithMantissa(
        buyPrice,
        auctionHouseObj.treasuryMint,
        walletKeyPair,
        anchorProgram,
      ),
    );

    const tokenSizeAdjusted = new BN(
      await getPriceWithMantissa(
        tokenSize,
        mintKey,
        walletKeyPair,
        anchorProgram,
      ),
    );

    const [tokenAccountKey] = (await getAtaForMint(mintKey, sellerWalletKey));

    const [listingConfig] = await getAuctioneerListingConfig(
      walletKeyPair.publicKey,
      auctionHouseKey,
      tokenAccountKey,
      auctionHouseObj.treasuryMint,
      mintKey,
      tokenSizeAdjusted,
    );

    const [buyerTradeState, tradeStateBump] = await getAuctionHouseTradeState(
      walletKeyPair.publicKey,
      auctionHouseKey,
      tokenAccountKey,
      auctionHouseObj.treasuryMint,
      mintKey,
      buyPriceAdjusted,
      tokenSizeAdjusted,
    );

    const [sellerTradeState] = await getAuctionHouseTradeState(
      walletKeyPair.publicKey,
      auctionHouseKey,
      tokenAccountKey,
      auctionHouseObj.treasuryMint,
      mintKey,
      new BN('0'),
      tokenSizeAdjusted,
    );

    const [ahAuctioneerPda] = await getAHAuctioneerPDA(
      auctionHouseKey,
      auctioneerAuthority,
    );

    const [freeTradeState, freeTradeStateBump] =
      await getAuctionHouseTradeState(
        auctionHouseKey,
        sellerWalletKey,
        tokenAccountKey,
        auctionHouseObj.treasuryMint,
        mintKey,
        new BN(0),
        tokenSizeAdjusted,
      );
    const [escrowPaymentAccount, escrowPaymentBump] =
      await getAuctionHouseBuyerEscrow(auctionHouseKey, buyerWalletKey);
    const [programAsSigner, programAsSignerBump] =
      await getAuctionHouseProgramAsSigner();
    const metadata = await getMetadata(mintKey);

    const executeSaleArgs: ExecuteSaleInstructionArgs = {
      escrowPaymentBump,
      freeTradeStateBump,
      programAsSignerBump,
      auctioneerAuthorityBump,
      buyerPrice: buyPriceAdjusted,
      tokenSize: tokenSizeAdjusted,
    };

    const executeSaleAccounts: ExecuteSaleInstructionAccounts = {
      auctionHouseProgram: AUCTION_HOUSE_PROGRAM_ID,
      listingConfig,
      buyer,
      seller,
      tokenAccount: tokenAccountKey,
      tokenMint: mintKey,
      metadata,
      treasuryMint: auctionHouseObj.treasuryMint,
      escrowPaymentAccount,
      sellerPaymentReceiptAccount: seller,
      buyerReceiptTokenAccount,
      authority: auctionHouseObj.authority,
      auctionHouse: auctionHouseKey,
      auctionHouseFeeAccount,
      auctionHouseTreasury: auctionHouseObj.auctionHouseTreasury,
      buyerTradeState,
      sellerTradeState,
      freeTradeState,
      auctioneerAuthority,
      ahAuctioneerPda,
      programAsSigner,
    };

    const instruction = createExecuteSaleInstruction(
      executeSaleAccounts,
      executeSaleArgs,
    );

    const tx = await sendTransactionWithRetryWithKeypair(
      anchorProgram.provider.connection,
      walletKeyPair,
      [instruction],
      [walletKeyPair],
      'max',
    );

    log.info(
      'Transaction:',
      tx.txid,
      ' | Accepted',
      tokenSize,
      mint,
      'sale from wallet',
      sellerWalletKey.toBase58(),
      'to',
      buyerWalletKey.toBase58(),
      'for',
      buyPrice,
      'from your account with Auction House',
      auctionHouse,
    );
  });

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
