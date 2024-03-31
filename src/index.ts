import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
  toMetaplexFile,
} from "@metaplex-foundation/js";
import {
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction,
  DataV2,
} from "@metaplex-foundation/mpl-token-metadata";
import * as token from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import * as fs from "fs";

import { initializeKeypair } from "./initializeKeypair";

async function main() {
  const connection = new web3.Connection(web3.clusterApiUrl("devnet"), {
    commitment: "confirmed",
  });
  const user = await initializeKeypair(connection);

  console.log("PublicKey: ", user.publicKey.toBase58());

  const mint = await createNewMint(
    connection,
    user,
    user.publicKey,
    user.publicKey,
    2,
  );

  const tokenAcc = await createTokenAccount(
    connection,
    user,
    mint,
    user.publicKey,
  );

  await mintTokens(connection, user, mint, tokenAcc.address, user, 100);

  const receiver = new web3.PublicKey(
    "cPCtdiH74Diga568rAHy7BQbBmhgCKC3KP9AML4sxcv",
  );

  const MINT_ADDRESS = "FNQExDf5BdPb8pZCezDsfJmrLmA8xsTt4L2XU1pwhE6s";
  const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(user))
  .use(
    bundlrStorage({
      address: "https://devnet.bundlr.network",
        providerUrl: "https://api.devnet.solana.com",
        timeout: 60000,
    }),
  );

  await createTokenMetadata(
    connection,
    metaplex,
    new web3.PublicKey(MINT_ADDRESS),
    user,
    "Symbol",
    "SBL",
    "Chase signal among noise."
  )

  const receiverTokenAccount = await createTokenAccount(
    connection,
    user,
    mint,
    receiver,
  );

  await transferTokens(
    connection,
    user,
    tokenAcc.address,
    receiverTokenAccount.address,
    user.publicKey,
    50,
    mint,
  );

  await burnTokens(connection, user, tokenAcc.address, mint, user, 25);

}

main()
  .then(() => {
    console.log("Finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });

async function createNewMint(
  connection: web3.Connection,
  payer: web3.Keypair,
  mintAuthority: web3.PublicKey,
  freezeAuthority: web3.PublicKey,
  decimals: number,
): Promise<web3.PublicKey> {
  const tokenMint = await token.createMint(
    connection,
    payer,
    mintAuthority,
    freezeAuthority,
    decimals,
  );

  console.log(`The token mint account address: ${tokenMint}`);
  console.log(
    `Token Mint: https://explorer.solana.com/address/${tokenMint}?cluster=devnet`,
  );
  return tokenMint;
}

async function createTokenAccount(
  connection: web3.Connection,
  payer: web3.Keypair,
  mint: web3.PublicKey,
  owner: web3.PublicKey,
) {
  const tokenAccount = await token.getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner,
  );

  console.log(
    `Token Account: https://explorer.solana.com/address/${tokenAccount.address}?cluster=devnet`,
  );

  return tokenAccount;
}

async function mintTokens(
  connection: web3.Connection,
  payer: web3.Keypair,
  mint: web3.PublicKey,
  destination: web3.PublicKey,
  authority: web3.Keypair,
  amount: number,
) {
  const mintInfo = await token.getMint(connection, mint);

  const txnSignature = await token.mintTo(
    connection,
    payer,
    mint,
    destination,
    authority,
    amount * 10 ** mintInfo.decimals,
  );
  console.log(
    `Mint Token Transaction: https://explorer.solana.com/tx/${txnSignature}?cluster=devnet`,
  );
}

async function transferTokens(
  connection: web3.Connection,
  payer: web3.Keypair,
  source: web3.PublicKey,
  destination: web3.PublicKey,
  owner: web3.PublicKey,
  amount: number,
  mint: web3.PublicKey,
) {
  const mintInfo = await token.getMint(connection, mint);
  const txnSig = await token.transfer(
    connection,
    payer,
    source,
    destination,
    owner,
    amount * 10 ** mintInfo.decimals,
  );
  console.log(
    `Transfer Transaction: https://explorer.solana.com/tx/${txnSig}?cluster=devnet`,
  );
}

async function burnTokens(
  connection: web3.Connection,
  payer: web3.Keypair,
  account: web3.PublicKey,
  mint: web3.PublicKey,
  owner: web3.Keypair,
  amount: number,
) {
  const mintInfo = await token.getMint(connection, mint);

  const txnSig = await token.burn(
    connection,
    payer,
    account,
    mint,
    owner,
    amount * 10 ** mintInfo.decimals,
  );

  console.log(
    `Burn Transaction: https://explorer.solana.com/tx/${txnSig}?cluster=devnet`,
  );
}

async function createTokenMetadata(
  connection: web3.Connection,
  metaplex: Metaplex,
  mint: web3.PublicKey,
  user: web3.Keypair,
  name: string,
  symbol: string,
  description: string,
) {
  const buffer = fs.readFileSync("assets/symbol-logo.png");
  const file = toMetaplexFile(buffer, "symbol.png");

  const imageUri = await metaplex.storage().upload(file);
  console.log("Image uri: ", imageUri);

  const { uri } = await metaplex.nfts().uploadMetadata({
    name: name,
    description: description,
    image: imageUri,
  });

  console.log("Metadata uri: ", uri);

  const metadataPDA = metaplex.nfts().pdas().metadata({ mint });

  const tokenMetadata = {
    name: name,
    symbol: symbol,
    uri: uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  } as DataV2;

  const txn = new web3.Transaction().add(
    createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPDA,
        mint: mint,
        mintAuthority: user.publicKey,
        payer: user.publicKey,
        updateAuthority: user.publicKey,
      },
      {
        createMetadataAccountArgsV3: {
          collectionDetails: null,
          data: tokenMetadata,
          isMutable: true,
        },
      },
    ),
  );

  const txnSig = await web3.sendAndConfirmTransaction(connection, txn, [user]);
  console.log(
    `Create Metadata Account: https://explorer.solana.com/tx/${txnSig}?cluster=devnet`,
  );
}
