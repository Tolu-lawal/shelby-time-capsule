# Deploying the Shelby Time Capsule contract

This Move module is what makes the time-lock **actually enforced by the
blockchain** instead of just the page's JavaScript. You need to publish it
once to ShelbyNet, then paste the resulting address into the frontend.

## 1. Install the Aptos CLI (if you don't have it)

```bash
curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3
```

Verify:
```bash
aptos --version
```

## 2. Set up a profile for ShelbyNet

```bash
cd move
aptos init --network custom \
  --rest-url https://api.shelbynet.shelby.xyz/v1 \
  --faucet-url https://faucet.shelbynet.shelby.xyz \
  --profile shelby-capsule
```

This generates a new local keypair and saves it to `.aptos/config.yaml`.
**This is a separate deploy-only key — it is NOT your Petra wallet.** Your
Petra wallet is what end users (including you) use to *call* the contract;
this CLI profile is only used once, to *publish* it.

## 3. Fund the deploy account

```bash
aptos account fund-with-faucet --profile shelby-capsule --amount 100000000
```

## 4. Publish the module

From the `move/` directory:

```bash
aptos move publish --profile shelby-capsule --named-addresses shelby_capsule=shelby-capsule
```

Confirm when prompted. On success you'll see a transaction hash and your
account address — that address **is** your contract address.

## 5. Wire the address into the frontend

Copy the account address from step 4, then open
`src/lib/contract.js` and replace:

```js
export const CONTRACT_ADDRESS = '__SET_AFTER_PUBLISH__';
```

with:

```js
export const CONTRACT_ADDRESS = '0xYOUR_DEPLOYED_ADDRESS_HERE';
```

## 6. Verify it's live

```bash
aptos move view \
  --function-id ${CONTRACT_ADDRESS}::time_capsule::get_capsule_count \
  --args address:${CONTRACT_ADDRESS} \
  --url https://api.shelbynet.shelby.xyz/v1
```

Should return `0` for a freshly published contract.

## Notes

- ShelbyNet wipes weekly per Shelby's own docs — you'll need to **republish
  the contract after every wipe**, and update `CONTRACT_ADDRESS` again.
  Consider scripting steps 3–5 if you're iterating often.
- The deploy account from step 2 is *not* used at runtime by end users —
  once published, all `seal_capsule` calls go through whichever Petra
  wallet the visitor connects with. The deploy account just owns the
  module code itself.
