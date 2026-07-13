# Missive — On-Chain Enforced

A time capsule app where the time-lock is enforced by a Move smart contract
on Aptos, and the encrypted message is genuinely stored on ShelbyNet — not
simulated, not in localStorage.

## What's actually real here

| Piece | How it's enforced |
|---|---|
| **Time-lock** | A Move contract (`move/sources/shelby_time_capsule.move`) holds a random `time_key`. Its `get_time_key` view function asserts `timestamp::now_seconds() >= unlock_time` **on-chain** — it aborts the call if it's not time yet. There is no client-side bypass: the key simply does not exist outside the contract until the chain's own clock says so. |
| **Storage** | The encrypted message is uploaded as a real blob to ShelbyNet via `register_blob` (signed by your Petra wallet) + the Shelby RPC's `putBlob`. |
| **Recipient-binding** | If you set a recipient, their wallet's deterministic Ed25519 signature is mixed into the AES-256 key. Even after `time_key` becomes public, only that wallet can derive the same signature, so only they can decrypt. |

## What you need to do before this works

This is **not plug-and-play** — two things require your action:

### 1. Publish the Move contract (one-time, per ShelbyNet wipe)

Follow `move/DEPLOY.md` step by step. At the end you'll have a contract
address. Paste it into `src/lib/contract.js`:

```js
export const CONTRACT_ADDRESS = '0xYOUR_DEPLOYED_ADDRESS';
```

**ShelbyNet wipes weekly** (per Shelby's own docs) — you'll need to
republish after every wipe and update this address again.

### 2. Run it locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173/index.html`.

To build static files for hosting (e.g. Vercel):
```bash
npm run build
```
Output goes to `dist/`.

## Honest limitations

- **I could not compile-test the Move contract myself.** My sandbox can't
  reach the binary release assets needed to install the Aptos CLI. I
  reasoned through the syntax carefully (and caught two real bugs doing
  so — wrong module paths for `Table` and `signer`), but you should run
  `aptos move compile` yourself before publishing, and let me know if the
  compiler flags anything.
- **I could not test the live upload flow against ShelbyNet either** — the
  Shelby API domains aren't reachable from my network sandbox. The code
  is built directly from the real `@shelby-protocol/sdk` source (I read
  its actual implementation, not just guessed at an API), and the
  Vite build compiles clean with all 486 modules resolving correctly, but
  the only way to know it works end-to-end against the live network is to
  run it yourself.
- **Gas/fees**: every seal does 2 on-chain transactions (`register_blob` +
  `seal_capsule`) — your wallet needs a small amount of APT on ShelbyNet
  for both.
- **Blob expiration**: blobs are set to expire ~1 year after the unlock
  date. If you need them to last longer, adjust `expirationMicros` in
  `src/seal.js`.

## File map

```
move/
  sources/shelby_time_capsule.move   — the on-chain enforcement contract
  Move.toml                          — package manifest
  DEPLOY.md                          — step-by-step publish guide

src/
  index.html / seal.js               — seal a capsule
  open.html  / open.js               — open a capsule
  style.css                          — shared wax-seal aesthetic
  lib/
    wallet.js     — AIP-62 wallet standard (Petra connect/sign/submit)
    crypto.js     — AES-256-GCM encrypt/decrypt + recipient binding
    shelby.js     — real ShelbyNet upload/download (commitments, register, putBlob)
    contract.js   — calls into the time_capsule Move contract
```
