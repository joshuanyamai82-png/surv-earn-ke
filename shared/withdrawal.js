// shared/withdrawal.js
import { MIN_WITHDRAWAL } from './config.js';
import { getCurrentUser, updateUser } from './auth.js';
import { showToast, closeModal, openModal, updateShellUser } from './ui.js';
import { showActivationFeeModal, showSubscriptionModal } from './subscription.js';

export function handleWithdrawClick() {
  const user = getCurrentUser();
  if (!user) return;

  if ((user.balance || 0) < MIN_WITHDRAWAL) {
    showToast(`Minimum withdrawal is Ksh ${MIN_WITHDRAWAL}`);
    return;
  }

  // One-time activation fee — trigger only when user is ready to withdraw
  if (!user.activationFeePaid) {
    showActivationFeeModal({ onSuccess: () => showWithdrawalModal() });
    return;
  }

  // If the flow requires an active subscription before withdrawal (dashboard parity)
  if (!user.subscription) {
    showSubscriptionModal({ pendingAction: 'withdraw', onSuccess: () => showWithdrawalModal() });
    return;
  }

  showWithdrawalModal();
}

export function showWithdrawalModal() {
  const user = getCurrentUser();
  if (!user) return;
  if ((user.balance || 0) < MIN_WITHDRAWAL) {
    showToast(`Minimum withdrawal is Ksh ${MIN_WITHDRAWAL}`);
    return;
  }
  document.getElementById('withdrawBalanceDisplay').value = `Ksh ${user.balance}`;
  document.getElementById('withdrawAmount').value = '';
  document.getElementById('withdrawPhone').value = user.mpesaNumber || '';
  openModal('withdrawalModal');
}

export function processWithdrawal() {
  const user = getCurrentUser();
  if (!user) return;

  const amount = parseFloat(document.getElementById('withdrawAmount').value);
  const phone  = document.getElementById('withdrawPhone').value.trim();

  if (isNaN(amount) || amount < MIN_WITHDRAWAL) {
    showToast(`Please enter a valid amount (minimum Ksh ${MIN_WITHDRAWAL})`); return;
  }
  if (amount > user.balance) { showToast('Amount exceeds available balance'); return; }
  if (!phone || !/^07\d{8}$/.test(phone)) { showToast('Enter a valid M-Pesa number (07XXXXXXXX)'); return; }

  Swal.fire({ title: 'Processing Withdrawal', html: '<div style="padding:0.5rem;">Please wait…</div>', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  setTimeout(() => {
    user.balance -= amount;
    updateUser(user);
    updateShellUser(user);
    closeModal('withdrawalModal');
    Swal.fire({
      title: 'Withdrawal Initiated!',
      html: `<div style="text-align:center">
        <i class="fas fa-clock" style="font-size:2rem;color:#f59e0b;"></i>
        <p>Ksh ${amount} will be sent to ${phone}</p>
        <p style="font-size:0.85rem;">Please allow 24 hours for processing.</p></div>`,
      confirmButtonText: 'Got it', confirmButtonColor: '#4f46e5',
    });
  }, 1500);
}

// Ensure handler is bound whenever a withdrawal modal is present
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('confirmWithdrawBtn');
  if (btn) btn.addEventListener('click', processWithdrawal);
});