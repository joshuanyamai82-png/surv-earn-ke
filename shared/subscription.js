// shared/subscription.js — plan selection, activation fee, upgrade, manual fallback
import { PLANS, PLAN_FEATURES, MIN_WITHDRAWAL, ACTIVATION_FEE, TILL_NUMBER, getPlanByName } from './config.js';
import { getCurrentUser, updateUser } from './auth.js';
import { showToast, closeModal, openModal, escapeHtml, updateShellUser } from './ui.js';
import { normalizePhoneNumber, initiatePayment, pollPaymentStatus, extractAmountFromMpesaMessage } from './payment.js';

/* ------------ generic manual fallback (used by sub + activation + upgrade) ------------ */
function renderManualFallback({ amount, label, phoneNumber, returnFn, onSuccess }) {
  const container = document.getElementById('subscriptionContent');
  const title = document.getElementById('subscriptionModalTitle');
  title.innerText = 'Manual Payment Option';
  container.innerHTML = `
    <div class="manual-payment-box">
      <i class="fas fa-exclamation-triangle" style="color:#f59e0b"></i>
      <strong>STK Push failed</strong>
      <p>You can still complete payment manually via M-Pesa.</p>
    </div>
    <div style="background:#f9fafb;padding:16px;border-radius:16px;">
      <p><strong>Pay to Till Number:</strong></p>
      <div class="copy-till">
        <span class="till-number">${TILL_NUMBER}</span>
        <button id="copyTillBtn" class="btn" style="background:#4f46e5;padding:6px 12px;width:auto;">Copy</button>
      </div>
      <p><small>M-Pesa → Lipa Na M-Pesa → Buy Goods → Till <b>${TILL_NUMBER}</b>. Amount: <b>Ksh ${amount}</b> (${escapeHtml(label)})</small></p>
      <div class="mpesa-input" style="margin-top:16px;">
        <label>Paste your M-Pesa message</label>
        <input type="text" id="manualTxMsg" placeholder="Paste the full M-Pesa message here">
      </div>
      <button id="submitManualBtn" class="btn" style="margin-top:12px;">I have paid</button>
      <button id="retryStkBtn" class="back-btn">Retry STK</button>
      <button id="cancelManualBtn" class="back-btn">Cancel</button>
    </div>`;

  document.getElementById('copyTillBtn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(TILL_NUMBER);
    showToast('Till number copied!');
  });

  document.getElementById('submitManualBtn')?.addEventListener('click', () => {
    const raw = document.getElementById('manualTxMsg')?.value.trim() || '';
    if (!raw) { showToast('Please paste your M-Pesa message'); return; }
    const amt = extractAmountFromMpesaMessage(raw);
    if (amt === null) { showToast('Could not extract amount from the message'); return; }
    if (Math.abs(amt - amount) < 0.01) {
      const user = getCurrentUser();
      if (!user) { showToast('User not found'); return; }
      if (!user.manualPaymentRecords) user.manualPaymentRecords = [];
      user.manualPaymentRecords.push({
        label, amount, phone: phoneNumber, rawMessage: raw,
        extractedAmount: amt, timestamp: Date.now(), status: 'verified',
      });
      user.mpesaNumber = user.mpesaNumber || phoneNumber;
      updateUser(user);
      onSuccess(user, { raw, amt, phoneNumber });
    } else {
      showToast(`Amount mismatch. Expected Ksh ${amount}, detected Ksh ${amt}`);
    }
  });

  document.getElementById('retryStkBtn')?.addEventListener('click', () => { if (returnFn) returnFn(); });
  document.getElementById('cancelManualBtn')?.addEventListener('click', () => closeModal('subscriptionModal'));
}

/* ------------ shared STK poll cycle (init + verify) ------------ */
async function runStkAndVerify({ phone, amount, description, onSuccess, onFailManual }) {
  let normalizedPhone;
  try { normalizedPhone = await normalizePhoneNumber(phone); }
  catch { normalizedPhone = phone; }

  Swal.fire({ title: 'Processing', html: 'Please wait…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const res = await initiatePayment(normalizedPhone, amount, description);
    if (!res.reference) throw new Error('No payment reference');

    Swal.fire({
      title: 'Request Sent!',
      html: `<div style="text-align:center"><i class="fas fa-mobile-alt" style="font-size:2rem;color:#4f46e5;"></i><p>Check your phone</p><p style="font-size:0.9rem;">Enter PIN to complete payment</p></div>`,
      timer: 3000, timerProgressBar: true, showConfirmButton: false,
    });

    Swal.fire({
      title: 'Verifying Payment',
      html: '<div class="loading-spinner" style="padding:1rem;"><i class="fas fa-spinner fa-pulse fa-2x"></i><p style="margin-top:12px">Please wait while we confirm your payment…</p></div>',
      allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading(),
    });

    const poll = await pollPaymentStatus(res.reference);
    Swal.close();

    if (poll.success) {
      const user = getCurrentUser();
      if (user) { user.mpesaNumber = normalizedPhone; updateUser(user); }
      onSuccess(user, { phone: normalizedPhone });
    } else {
      throw new Error(poll.error || 'Payment failed');
    }
  } catch (err) {
    Swal.close();
    console.warn('STK Push error, showing manual fallback:', err);
    onFailManual(normalizedPhone);
  }
}

/* ============================== SUBSCRIPTION ============================== */
export function showSubscriptionModal(opts = {}) {
  if (typeof opts === 'string') opts = { pendingAction: opts };
  const { requiredPlan = null, surveyId = null, onSuccess = null } = opts;
  showPlanSelection({ requiredPlan, surveyId, onSuccess });
}

let _selectedPlan = null;

function showPlanSelection({ requiredPlan, surveyId, onSuccess }) {
  _selectedPlan = null;
  const modal = document.getElementById('subscriptionModal');
  const container = document.getElementById('subscriptionContent');
  document.getElementById('subscriptionModalTitle').innerText = 'Choose a Subscription Plan';

  /* Banner telling the user why they need a plan (only when coming from a locked survey) */
  let banner = '';
  if (requiredPlan === 'standard') {
    banner = '<div style="margin-bottom:16px;background:#fef3c7;padding:12px;border-radius:12px;font-size:0.9rem;"><i class="fas fa-info-circle"></i> This survey requires a <strong>Standard</strong> or higher plan.</div>';
  } else if (requiredPlan === 'premium') {
    banner = '<div style="margin-bottom:16px;background:#f1e5ff;padding:12px;border-radius:12px;font-size:0.9rem;"><i class="fas fa-info-circle"></i> This survey requires a <strong>Premium</strong> or higher plan.</div>';
  }

  /* Which plan should be auto-selected for this context? */
  const defaultPlanName =
    requiredPlan === 'premium'  ? 'Premium'  :
    requiredPlan === 'standard' ? 'Standard' : null;

  /* Preselect if the plan exists */
  if (defaultPlanName) {
    const plan = PLANS.find(p => p.name === defaultPlanName);
    if (plan) _selectedPlan = { name: plan.name, price: plan.price };
  }

  /* Build plan rows using the .sub-plan-row styling */
  const planRows = PLANS.map(p => {
    const isRequired = defaultPlanName === p.name;
    const badgeText  = isRequired ? '✓ Required for this survey' : (p.badge || '');
    const badgeClass = isRequired ? 'badge-required' : 'badge-promo';
    const features = (PLAN_FEATURES[p.name] || []).map(f =>
      `<li style="font-size:0.82rem;color:#4b5563;display:flex;align-items:center;gap:6px;margin-bottom:5px;">
        <i class="fas fa-check" style="color:#10b981;font-size:11px;width:14px;"></i>${escapeHtml(f)}
      </li>`).join('');

    return `
      <div class="sub-plan-row ${isRequired ? 'sub-plan-selected' : ''}" data-plan="${p.name}">
        ${badgeText ? `<span class="sub-plan-badge ${badgeClass}">${badgeText}</span>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span class="plan-row-name" style="font-weight:700;font-size:1rem;color:#1f2937;">${p.name}</span>
          <span style="font-weight:700;color:#4f46e5;">Ksh ${p.price} / month</span>
        </div>
        <ul style="list-style:none;padding:0;margin:0;">${features}</ul>
      </div>`;
  }).join('');

  container.innerHTML = `
    ${banner}
    <p style="color:#6b7280;font-size:0.9rem;margin-bottom:16px;">
      Select a plan that fits your needs. All plans include withdrawals after reaching Ksh ${MIN_WITHDRAWAL}.
    </p>
    <div id="plansList">${planRows}</div>
    <div class="modal-footer-sticky">
      <button class="next-btn" id="nextToMpesa">Continue</button>
    </div>`;

  container.querySelectorAll('.sub-plan-row').forEach(row => {
    row.addEventListener('click', () => {
      container.querySelectorAll('.sub-plan-row').forEach(r => r.classList.remove('sub-plan-selected'));
      row.classList.add('sub-plan-selected');
      const planName = row.getAttribute('data-plan');
      const plan = PLANS.find(p => p.name === planName);
      if (plan) _selectedPlan = { name: plan.name, price: plan.price };
    });
  });

  document.getElementById('nextToMpesa').addEventListener('click', () => {
    if (!_selectedPlan) { showToast('Please select a plan'); return; }
    showMpesaStep(_selectedPlan, { surveyId, onSuccess });
  });

  openModal('subscriptionModal');
}

function showMpesaStep(plan, { surveyId, onSuccess }) {
  const container = document.getElementById('subscriptionContent');
  document.getElementById('subscriptionModalTitle').innerText = 'Complete Subscription';
  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <p>You've selected <strong>${plan.name}</strong> plan (Ksh ${plan.price}).</p>
      <p>Enter your M-Pesa number to pay Ksh ${plan.price}.</p>
    </div>
    <div class="mpesa-input"><input type="tel" id="mpesaNumber" placeholder="07XXXXXXXX" style="width:100%;padding:12px;border:1px solid #eef2f6;border-radius:12px;"></div>
    <div class="modal-footer-sticky">
      <button class="btn" id="confirmSubscription">Subscribe Now</button>
      <button class="back-btn" id="backToPlans" style="margin-top:10px;">← Back to plans</button>
    </div>`;

  const returnFn = () => showMpesaStep(plan, { surveyId, onSuccess });
  document.getElementById('backToPlans').addEventListener('click', () => showPlanSelection({ requiredPlan: null, surveyId, onSuccess }));

  document.getElementById('confirmSubscription').addEventListener('click', () => {
    const phone = document.getElementById('mpesaNumber').value.trim();
    if (!phone) { showToast('Please enter your M-Pesa number'); return; }

    runStkAndVerify({
      phone, amount: plan.price, description: `SurveyEarn ${plan.name} Subscription`,
      onSuccess: (user) => {
        user.subscription = { plan: plan.name, expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 };
        updateUser(user);
        updateShellUser(user);
        closeModal('subscriptionModal');
        Swal.fire({
          title: 'Subscription Active!',
          html: `<div style="text-align:center"><i class="fas fa-check-circle" style="font-size:2rem;color:#10b981;"></i><p>Your ${plan.name} plan is now active.</p></div>`,
          confirmButtonText: 'Great!', confirmButtonColor: '#4f46e5',
        }).then(() => { if (onSuccess) onSuccess(user); });
      },
      onFailManual: (normalizedPhone) => renderManualFallback({
        amount: plan.price, label: `${plan.name} plan`, phoneNumber: normalizedPhone,
        returnFn,
        onSuccess: (user) => {
          user.subscription = { plan: plan.name, expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 };
          updateUser(user);
          updateShellUser(user);
          closeModal('subscriptionModal');
          Swal.fire({
            title: 'Subscription Activated!',
            html: `<div><i class="fas fa-check-circle" style="font-size:2rem;color:#10b981"></i><p>Your ${plan.name} plan is now active.</p></div>`,
            confirmButtonText: 'Great!', confirmButtonColor: '#4f46e5',
          }).then(() => { if (onSuccess) onSuccess(user); });
        },
      }),
    });
  });
}

/* ============================== ACTIVATION FEE ============================== */
export function showActivationFeeModal({ onSuccess } = {}) {
  const container = document.getElementById('subscriptionContent');
  document.getElementById('subscriptionModalTitle').innerText = 'One-Time Activation Fee';
  container.innerHTML = `
    <div class="manual-payment-box" style="background:#e0f2fe;border-left-color:#0284c7;">
      <i class="fas fa-gem"></i> <strong>One-time activation fee of Ksh ${ACTIVATION_FEE} is required.</strong>
      <p>This fee ensures secure and verified accounts. After payment, you can withdraw any amount anytime.</p>
    </div>
    <div style="margin-bottom:20px;"><p>Enter your M-Pesa number to pay Ksh ${ACTIVATION_FEE}.</p></div>
    <div class="mpesa-input"><input type="tel" id="activationPhone" placeholder="07XXXXXXXX" style="width:100%;padding:12px;"></div>
    <div class="modal-footer-sticky">
      <button class="btn" id="payActivationBtn">Pay Ksh ${ACTIVATION_FEE}</button>
      <button class="back-btn" id="cancelActivationBtn" style="margin-top:10px;">Cancel</button>
    </div>`;

  const returnFn = () => showActivationFeeModal({ onSuccess });
  document.getElementById('cancelActivationBtn').addEventListener('click', () => closeModal('subscriptionModal'));

  document.getElementById('payActivationBtn').addEventListener('click', () => {
    const phone = document.getElementById('activationPhone').value.trim();
    if (!phone) { showToast('Please enter your M-Pesa number'); return; }

    runStkAndVerify({
      phone, amount: ACTIVATION_FEE, description: 'SurveyEarn Activation Fee',
      onSuccess: (user) => {
        user.activationFeePaid = true;
        updateUser(user);
        updateShellUser(user);
        closeModal('subscriptionModal');
        Swal.fire({
          title: 'Activation Successful!',
          html: `<div style="text-align:center"><i class="fas fa-check-circle" style="font-size:2rem;color:#10b981;"></i><p>You can now withdraw your funds.</p></div>`,
          confirmButtonText: 'Proceed to Withdrawal', confirmButtonColor: '#4f46e5',
        }).then(() => { if (onSuccess) onSuccess(user); });
      },
      onFailManual: (normalizedPhone) => renderManualFallback({
        amount: ACTIVATION_FEE, label: 'Activation Fee', phoneNumber: normalizedPhone,
        returnFn,
        onSuccess: (user) => {
          user.activationFeePaid = true;
          updateUser(user);
          updateShellUser(user);
          closeModal('subscriptionModal');
          Swal.fire({
            title: 'Activation Successful!',
            html: `<div><i class="fas fa-check-circle" style="font-size:2rem;color:#10b981"></i><p>You can now withdraw your funds.</p></div>`,
            confirmButtonText: 'Proceed to Withdrawal', confirmButtonColor: '#4f46e5',
          }).then(() => { if (onSuccess) onSuccess(user); });
        },
      }),
    });
  });

  openModal('subscriptionModal');
}

/* ============================== UPGRADE ============================== */
export function showUpgradeModal({ offer, onSuccess } = {}) {
  const container = document.getElementById('subscriptionContent');
  document.getElementById('subscriptionModalTitle').innerText = 'Upgrade Your Plan';
  container.innerHTML = `
    <div style="margin-bottom:20px;background:#e0f2fe;padding:12px;border-radius:12px;">
      <i class="fas fa-rocket"></i> You have reached your limit for ${offer.fromPlan} surveys.
    </div>
    <div class="sub-plan-row sub-plan-selected" style="cursor:default;">
      <span class="sub-plan-badge badge-required">Special Upgrade</span>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span class="plan-row-name" style="font-weight:700;font-size:1rem;color:#1f2937;">${offer.toPlan}</span>
        <span style="font-weight:700;color:#4f46e5;">Ksh ${offer.price}</span>
      </div>
      <ul style="list-style:none;padding:0;margin:0;">
        <li style="font-size:0.82rem;color:#4b5563;display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          <i class="fas fa-check" style="color:#10b981;font-size:11px;width:14px;"></i>Unlimited ${offer.toPlan === 'Standard Plus' ? 'standard' : 'premium'} surveys
        </li>
        <li style="font-size:0.82rem;color:#4b5563;display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          <i class="fas fa-check" style="color:#10b981;font-size:11px;width:14px;"></i>All features of ${offer.fromPlan}
        </li>
      </ul>
    </div>
    <div class="modal-footer-sticky">
      <button class="next-btn" id="upgradeNowBtn">Upgrade Now for Ksh ${offer.price}</button>
      <button class="back-btn" id="cancelUpgradeBtn" style="margin-top:10px;">Cancel</button>
    </div>`;

  document.getElementById('cancelUpgradeBtn').addEventListener('click', () => closeModal('subscriptionModal'));
  document.getElementById('upgradeNowBtn').addEventListener('click', () => showUpgradePaymentStep(offer, onSuccess));
  openModal('subscriptionModal');
}

function showUpgradePaymentStep(offer, onSuccess) {
  const container = document.getElementById('subscriptionContent');
  document.getElementById('subscriptionModalTitle').innerText = 'Complete Upgrade';
  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <p>Upgrade from <strong>${offer.fromPlan}</strong> to <strong>${offer.toPlan}</strong> for only Ksh ${offer.price}.</p>
      <p>Enter your M-Pesa number to pay Ksh ${offer.price}.</p>
    </div>
    <div class="mpesa-input"><input type="tel" id="upgradePhone" placeholder="07XXXXXXXX" style="width:100%;padding:12px;"></div>
    <div class="modal-footer-sticky">
      <button class="btn" id="confirmUpgrade">Pay Now</button>
      <button class="back-btn" id="backUpgrade" style="margin-top:10px;">← Back</button>
    </div>`;

  const returnFn = () => showUpgradePaymentStep(offer, onSuccess);
  document.getElementById('backUpgrade').addEventListener('click', () => showUpgradeModal({ offer, onSuccess }));

  document.getElementById('confirmUpgrade').addEventListener('click', () => {
    const phone = document.getElementById('upgradePhone').value.trim();
    if (!phone) { showToast('Enter M-Pesa number'); return; }

    runStkAndVerify({
      phone, amount: offer.price, description: `Upgrade to ${offer.toPlan}`,
      onSuccess: (user) => {
        user.subscription = { plan: offer.toPlan, expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 };
        updateUser(user);
        updateShellUser(user);
        closeModal('subscriptionModal');
        Swal.fire({
          title: 'Upgraded!',
          html: `<div><i class="fas fa-check-circle" style="font-size:2rem;color:#10b981"></i><p>You now have the ${offer.toPlan} plan.</p></div>`,
          confirmButtonColor: '#4f46e5',
        }).then(() => { if (onSuccess) onSuccess(user); });
      },
      onFailManual: (normalizedPhone) => renderManualFallback({
        amount: offer.price, label: `Upgrade to ${offer.toPlan}`, phoneNumber: normalizedPhone,
        returnFn,
        onSuccess: (user) => {
          user.subscription = { plan: offer.toPlan, expiry: Date.now() + 30 * 24 * 60 * 60 * 1000 };
          updateUser(user);
          updateShellUser(user);
          closeModal('subscriptionModal');
          Swal.fire({
            title: 'Upgrade Successful!',
            html: `<div><i class="fas fa-check-circle" style="font-size:2rem;color:#10b981"></i><p>You now have the ${offer.toPlan} plan.</p></div>`,
            confirmButtonColor: '#4f46e5',
          }).then(() => { if (onSuccess) onSuccess(user); });
        },
      }),
    });
  });
}