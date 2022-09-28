# Auctioneer CLI for @metaplex (WIP)

The partially completed missing CLI for Metaplex's Auctioneer program.

## Commands

- authorize [options] (working)
- delegate [options] (working)
- sell [options] (broken - see notes on method)
- help [command] (display help for command)

## Pre-requisites

Follow the metaplex docs to create an auction house using the metaplex auction house CLI at https://docs.metaplex.com/programs/auction-house/getting-started.

eg.

ts-node auction-house-cli.ts create_auction_house -e devnet -k $YOUR_KEY -tm boomh1LQnwDnHtKxWTFgxcbdRjPypRSjdwxkAEJkFSH -sfbp 500
ts-node auction-house-cli.ts update_auction_house -e devnet -k $YOUR_KEY -tm boomh1LQnwDnHtKxWTFgxcbdRjPypRSjdwxkAEJkFSH -sfbp 200 -ah $YOUR_AUCTION_HOUSE

Created auction house $YOUR_AUCTION_HOUSE

Once setup use show and transfer SOL to fund the 'Fee Payer Acc'

ts-node auction-house-cli.ts show -k $YOUR_KEY -ah $YOUR_AUCTION_HOUSE
ts-node auction-house-cli.ts sell -k $YOUR_KEY -e devnet -ah $YOUR_AUCTION_HOUSE -b 100 -t 1 -m 8MATkSayE5SQS9gK8HqBmqcj5RKUxX8f9zmydomBcN7h
ts-node auction-house-cli.ts show_escrow -k $YOUR_KEY -ah $YOUR_AUCTION_HOUSE

## Setup

Once your auction house is setup you can authorize and delegate authority using this CLI.

### Delegate auth to auctioneer

ts-node auctioneer-cli.ts delegate -k $YOUR_KEY -ah $YOUR_AUCTION_HOUSE

Delegated auctioneer authority at: BxgMwm7DBrMgfeMt33LgLzba3Hp6ihgeW2UkipsZCL4y with PDA: 93FsHeacX2R6hskeHfZyorpHAoY1LFyFaWddmF5Hmzez for auction house at: $YOUR_AUCTION_HOUSE now you can sell your NFTs.

## WIP functions non-working

ts-node auctioneer-cli.ts sell -k $YOUR_KEY -ah $YOUR_AUCTION_HOUSE -m $TOKEN_MINT -b 500
ts-node auctioneer-cli.ts cancel -k $YOUR_KEY -ah $YOUR_AUCTION_HOUSE -m $TOKEN_MINT -b 500

## Credits

If you want to say thanks, come and see what I'm building over at https://app.boom.army. Connect your wallet, grab a Boom Hero and say Hi on Solana's original social platform.
