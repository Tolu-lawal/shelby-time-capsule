// ── AIP-62 Aptos Wallet Standard ────────────────────────────────────────
// Uses @wallet-standard/core for proper wallet discovery — Petra and other
// modern Aptos wallets deprecated window.aptos/window.petra direct access
// in favor of this event-based registration system.

import { getWallets } from '@wallet-standard/core';

const { get: getRegisteredWallets, on: onWalletEvent } = getWallets();

function findAptosWallet(preferredName = 'Petra') {
  const all = getRegisteredWallets();
  return (
    all.find(w => w.name === preferredName) ||
    all.find(w => w.chains?.some(c => c.startsWith('aptos'))) ||
    null
  );
}

/** Wait up to maxMs for a wallet to register itself, polling via the standard's event. */
export async function waitForWallet(maxMs = 3000) {
  let wallet = findAptosWallet();
  if (wallet) return wallet;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => { off(); resolve(findAptosWallet()); }, maxMs);
    const off = onWalletEvent('register', () => {
      const w = findAptosWallet();
      if (w) { clearTimeout(timeout); off(); resolve(w); }
    });
  });
}

/** Connect to a wallet via the aptos:connect standard feature. Returns the address string. */
export async function connectWallet(wallet) {
  const connectFeature = wallet.features?.['aptos:connect'];
  if (!connectFeature) throw new Error('Wallet does not support aptos:connect');

  const result = await connectFeature.connect();
  let address = result?.args?.address || result?.address || result?.account?.address;
  if (!address && Array.isArray(result?.accounts) && result.accounts[0]) {
    address = result.accounts[0].address;
  }
  if (!address && wallet.accounts?.[0]) address = wallet.accounts[0].address;
  if (!address) throw new Error('Could not get wallet address');

  return typeof address === 'string' ? address : (address.toString ? address.toString() : JSON.stringify(address));
}

/** Disconnect a wallet via the standard feature, if supported. */
export async function disconnectWallet(wallet) {
  try {
    const feature = wallet?.features?.['aptos:disconnect'];
    if (feature) await feature.disconnect();
  } catch (e) { /* not all wallets support programmatic disconnect */ }
}

/**
 * Sign and submit an Aptos transaction via the wallet standard.
 * @param functionId - e.g. "0xADDR::module::function_name"
 * @param functionArguments - array of arguments matching the Move entry function signature
 * @returns the transaction hash
 */
export async function signAndSubmitTransaction(wallet, functionId, functionArguments, typeArguments = []) {
  const feature = wallet.features?.['aptos:signAndSubmitTransaction'];
  if (!feature) throw new Error('Wallet does not support signAndSubmitTransaction');

  const result = await feature.signAndSubmitTransaction({
    payload: {
      function: functionId,
      typeArguments,
      functionArguments,
    },
  });

  const hash = result?.args?.hash || result?.hash;
  if (!hash) throw new Error('Transaction submission did not return a hash');
  return hash;
}

/** Sign a message via the wallet standard. */
export async function signMessage(wallet, message, nonce = '0') {
  const feature = wallet.features?.['aptos:signMessage'];
  if (!feature) throw new Error('Wallet does not support signMessage');
  return feature.signMessage({ message, nonce });
}

export async function switchToShelbyNet(wallet) {
  const feature = wallet.features?.['aptos:changeNetwork'];
  if (!feature) return false;
  try {
    await feature.changeNetwork({ name: 'shelbynet', chainId: '0x72' });
    return true;
  } catch (e) {
    console.warn('Could not auto-switch to ShelbyNet:', e);
    return false;
  }
}

export { findAptosWallet, };
