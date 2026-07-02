import { waitForWallet, connectWallet, disconnectWallet, switchToShelbyNet } from './lib/wallet.js';
import { generateTimeKey, encryptMessage, deriveRecipientSecret, bytesToHex } from './lib/crypto.js';
import { uploadCapsuleToShelby } from './lib/shelby.js';
import { sealCapsuleOnChain, getCapsuleIdFromTx, CONTRACT_ADDRESS } from './lib/contract.js';

const $ = (id) => document.getElementById(id);

let authorWallet = null;
let authorAddress = null;
let recipientWallet = null;
let recipientAddress = null;
let recipientSecret = null;
let capsuleSeed = null; // random hex, generated once, embedded in the blob name

function ensureCapsuleSeed() {
  if (!capsuleSeed) {
    capsuleSeed = bytesToHex(crypto.getRandomValues(new Uint8Array(16))).slice(2);
  }
  return capsuleSeed;
}

function showError(msg) { $('errorMsg').textContent = msg; $('errorMsg').classList.add('active'); }
function clearError() { $('errorMsg').classList.remove('active'); }

function setStep(id, state) {
  const el = $(id);
  el.className = 'progress-step ' + state;
  const icon = el.querySelector('.step-icon');
  if (state === 'active-step') icon.innerHTML = '<span class="spinner"></span>';
  else if (state === 'done') icon.textContent = '✓';
  else icon.textContent = '○';
}

// ── Contract deployment guard ──
if (CONTRACT_ADDRESS === '__SET_AFTER_PUBLISH__') {
  showError('The time capsule contract has not been deployed yet. See move/DEPLOY.md, publish the module, then set CONTRACT_ADDRESS in src/lib/contract.js.');
}

// ── Author wallet connect ──
$('walletBtn').addEventListener('click', async () => {
  if (authorWallet) return;
  const right = $('walletBtnRight');
  right.textContent = 'Detecting...';

  const wallet = await waitForWallet(3000);
  if (!wallet) {
    right.textContent = 'CONNECT →';
    window.open('https://petra.app/', '_blank');
    showError('Petra wallet not detected. Enable it for this site, refresh, and try again.');
    return;
  }

  try {
    authorAddress = await connectWallet(wallet);
    await switchToShelbyNet(wallet);
    authorWallet = wallet;

    $('walletDot').classList.add('connected');
    $('walletLabel').textContent = 'Petra Wallet Connected';
    $('walletAddress').textContent = authorAddress.slice(0,10) + '...' + authorAddress.slice(-6);
    $('walletBtn').classList.add('connected');
    right.textContent = '✓ CONNECTED';
    $('disconnectBtn').style.display = 'block';

    $('message').disabled = false;
    $('unlockDate').disabled = false;
    document.querySelectorAll('.quick-pick-btn').forEach(b => b.disabled = false);
    $('recipient').disabled = false;
    $('sealBtn').disabled = false;
    clearError();
  } catch (err) {
    right.textContent = 'CONNECT →';
    showError('Connection failed: ' + (err.message || String(err)));
  }
});

$('disconnectBtn').addEventListener('click', async () => {
  await disconnectWallet(authorWallet);
  authorWallet = null; authorAddress = null;
  recipientWallet = null; recipientAddress = null; recipientSecret = null;

  $('walletDot').classList.remove('connected');
  $('walletLabel').textContent = 'Connect Petra Wallet to Continue';
  $('walletAddress').textContent = '';
  $('walletBtn').classList.remove('connected');
  $('walletBtnRight').textContent = 'CONNECT →';
  $('disconnectBtn').style.display = 'none';

  $('message').disabled = true;
  $('unlockDate').disabled = true;
    document.querySelectorAll('.quick-pick-btn').forEach(b => b.disabled = true);
  $('recipient').disabled = true;
  $('sealBtn').disabled = true;
  $('recipient').value = '';
  onRecipientChange();
  clearError();
});

// ── Recipient field ──
$('recipient').addEventListener('input', onRecipientChange);
function onRecipientChange() {
  const val = $('recipient').value.trim();
  const section = $('recipientAuthSection');
  if (val) {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
    recipientSecret = null; recipientAddress = null; recipientWallet = null;
    $('recipientWalletDot').classList.remove('connected');
    $('recipientWalletLabel').textContent = 'Recipient: Connect Wallet to Authorize';
    $('recipientWalletAddress').textContent = '';
    $('recipientWalletBtn').classList.remove('connected');
    $('recipientWalletBtnRight').textContent = 'AUTHORIZE →';
  }
}

$('recipientWalletBtn').addEventListener('click', async () => {
  const typed = $('recipient').value.trim();
  if (!typed) { showError('Enter the recipient wallet address first.'); return; }

  const right = $('recipientWalletBtnRight');
  right.textContent = 'Detecting...';

  const wallet = await waitForWallet(3000);
  if (!wallet) { right.textContent = 'AUTHORIZE →'; showError('Petra wallet not detected.'); return; }

  try {
    const addr = await connectWallet(wallet);
    if (addr.toLowerCase() !== typed.toLowerCase()) {
      right.textContent = 'AUTHORIZE →';
      showError('Connected wallet (' + addr.slice(0,10) + '...) does not match the recipient address you entered. Have the recipient connect their own wallet here.');
      return;
    }

    ensureCapsuleSeed();
    recipientSecret = await deriveRecipientSecret(wallet, capsuleSeed);
    recipientAddress = addr;
    recipientWallet = wallet;

    $('recipientWalletDot').classList.add('connected');
    $('recipientWalletLabel').textContent = 'Recipient Authorized ✓';
    $('recipientWalletAddress').textContent = addr.slice(0,10) + '...' + addr.slice(-6);
    $('recipientWalletBtn').classList.add('connected');
    right.textContent = '✓ AUTHORIZED';
    clearError();
  } catch (err) {
    right.textContent = 'AUTHORIZE →';
    showError('Recipient authorization failed: ' + (err.message || String(err)));
  }
});

// ── Char count + date defaults ──
$('message').addEventListener('input', () => {
  $('charCount').textContent = $('message').value.length;
});

function toLocalDatetimeInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const minUnlock = new Date(Date.now() + 2 * 60000); // at least 2 minutes out
$('unlockDate').min = toLocalDatetimeInputValue(minUnlock);
$('unlockDate').value = toLocalDatetimeInputValue(new Date(Date.now() + 7 * 86400000));

document.querySelectorAll('.quick-pick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mins = parseInt(btn.dataset.mins, 10);
    $('unlockDate').value = toLocalDatetimeInputValue(new Date(Date.now() + mins * 60000));
  });
});

// ── Seal ──
$('sealBtn').addEventListener('click', async () => {
  clearError();

  if (CONTRACT_ADDRESS === '__SET_AFTER_PUBLISH__') {
    showError('Contract not deployed yet — see move/DEPLOY.md.');
    return;
  }

  const message = $('message').value.trim();
  const unlockDateStr = $('unlockDate').value;
  const recipientTyped = $('recipient').value.trim();

  if (!authorWallet) { showError('Please connect your Petra wallet first.'); return; }
  if (!message) { showError('Please write a message to seal.'); return; }
  if (!unlockDateStr) { showError('Please set an unlock date.'); return; }
  const unlockTimeSeconds = Math.floor(new Date(unlockDateStr).getTime() / 1000);
  if (unlockTimeSeconds <= Math.floor(Date.now() / 1000)) { showError('Unlock date must be in the future.'); return; }
  if (recipientTyped && !recipientSecret) { showError('Have the recipient connect & authorize their wallet first.'); return; }

  const btn = $('sealBtn');
  btn.disabled = true;
  $('progress').classList.add('active');
  $('result').classList.remove('active');

  try {
    ensureCapsuleSeed();
    const blobName = `capsules/${capsuleSeed}.bin`;
    const timeKey = generateTimeKey();

    // Step 1: encrypt + prep commitments happen inside uploadCapsuleToShelby,
    // but we encrypt first since it doesn't need network/wallet.
    const ciphertextB64 = await encryptMessage(message, timeKey, recipientSecret);
    const dataBytes = new TextEncoder().encode(ciphertextB64);

    const expirationMicros = (unlockTimeSeconds + 365 * 24 * 3600) * 1_000_000;

    const uploadResult = await uploadCapsuleToShelby({
      wallet: authorWallet,
      ownerAddress: authorAddress,
      blobName,
      data: dataBytes,
      expirationMicros,
      onProgress: (phase) => {
        if (phase === 'generating-commitments') setStep('step1', 'active-step');
        if (phase === 'registering-onchain') { setStep('step1', 'done'); setStep('step2', 'active-step'); }
        if (phase === 'uploading-bytes') { setStep('step2', 'done'); setStep('step3', 'active-step'); }
        if (phase === 'done') setStep('step3', 'done');
      },
    });

    // Step 4: seal on our time_capsule contract
    setStep('step4', 'active-step');
    const sealTxHash = await sealCapsuleOnChain(authorWallet, {
      timeKeyBytes: timeKey,
      unlockTimeSeconds,
      recipientAddress: recipientAddress || '0x0',
      blobId: uploadResult.merkleRoot,
      blobName,
      recipientBound: !!recipientSecret,
    });
    setStep('step4', 'done');

    // Step 5: confirm + get capsule id
    setStep('step5', 'active-step');
    const capsuleId = await getCapsuleIdFromTx(sealTxHash);
    setStep('step5', 'done');

    const base = window.location.href.replace(/index\.html.*$/, '').replace(/\/$/, '');
    const capsuleUrl = `${base}/open.html?id=${capsuleId}`;

    $('resultUrl').textContent = capsuleUrl;
    $('resultMeta').innerHTML = `
      Capsule ID: <span>#${capsuleId}</span><br>
      Author: <span>${authorAddress.slice(0,12)}...${authorAddress.slice(-6)}</span><br>
      Unlock: <span>${new Date(unlockTimeSeconds * 1000).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} (chain-enforced)</span><br>
      ${recipientAddress ? `Recipient: <span>${recipientAddress.slice(0,12)}...${recipientAddress.slice(-6)} — key cryptographically bound ✓</span><br>` : 'Recipient: <span>Anyone</span><br>'}
      Blob: <span>${blobName}</span><br>
      Seal tx: <a href="https://explorer.aptoslabs.com/txn/${sealTxHash}?network=custom" target="_blank">${sealTxHash.slice(0,10)}...</a>
    `;
    $('result').classList.add('active');
    window._capsuleUrl = capsuleUrl;

  } catch (err) {
    showError('Error: ' + (err.message || String(err)));
    ['step1','step2','step3','step4','step5'].forEach(s => setStep(s, ''));
  } finally {
    btn.disabled = false;
  }
});

$('copyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(window._capsuleUrl || $('resultUrl').textContent);
  $('copyBtn').textContent = 'Copied ✓';
  setTimeout(() => $('copyBtn').textContent = 'Copy Link', 2000);
});
