// shared/ui.js — shell injection, toast, modals, dropdowns
import { getCurrentUser, getUserInitials } from './auth.js';

const NAV_ITEMS = [
  { id: 'dashboard', href: 'dashboard.html', icon: 'fa-chart-pie',     label: 'Dashboard' },
  { id: 'surveys',   href: 'surveys.html',   icon: 'fa-list',          label: 'Surveys'   },
  { id: 'referrals', href: 'referrals.html', icon: 'fa-user-friends',  label: 'Referrals' },
  { id: 'settings',  href: 'settings.html',  icon: 'fa-cog',           label: 'Settings'  },
  { id: 'help',      href: 'help.html',      icon: 'fa-question-circle', label: 'Help'    },
];

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = message;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), duration);
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

export function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function buildSidebar(activePage, user) {
  const name = user ? user.name : 'User';
  const initials = getUserInitials(name);
  const earnings = user ? (user.earningsTotal || 0) : 0;
  const nav = NAV_ITEMS.map(n => `
    <a href="${n.href}" class="nav-item ${n.id === activePage ? 'active' : ''}">
      <i class="fas ${n.icon}"></i><span>${n.label}</span>
    </a>`).join('');
  return `
    <div class="sidebar-header">
      <div class="logo"><i class="fas fa-clipboard-list"></i><span>SurveyEarn</span></div>
    </div>
    <div class="nav-menu">${nav}</div>
    <div class="sidebar-footer">
      <div class="earn-card">
        <p>Earned so far</p>
        <h3 id="earnCardAmount">Ksh ${earnings}</h3>
        <button id="withdrawBtn">Withdraw</button>
      </div>
    </div>`;
}

function buildTopbar(title, subtitle, user) {
  const name = user ? user.name : 'User';
  const email = user ? user.email : '';
  const initials = getUserInitials(name);
  return `
    <div class="page-title">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </div>
    <div class="user-area">
      <div class="notif-wrapper">
        <i class="far fa-bell" id="notifBtn"></i>
        <div class="dropdown notif-dropdown" id="notifMenu">
          <p class="dropdown-title">Notifications</p>
          <div class="empty-state"><i class="fas fa-bell-slash"></i><p>No notifications yet</p></div>
        </div>
      </div>
      <div class="user-wrapper">
        <div class="avatar" id="userBtn">${initials}</div>
        <div class="dropdown user-dropdown" id="userMenu">
          <div class="user-info">
            <strong id="userNameStrong">${escapeHtml(name)}</strong>
            <span id="userEmailSpan">${escapeHtml(email)}</span>
          </div>
          <div class="dropdown-item" id="settingsMenuItem"><i class="fas fa-cog"></i> Settings</div>
          <div class="dropdown-item logout" id="logoutMenuItem"><i class="fas fa-sign-out-alt"></i> Sign out</div>
        </div>
      </div>
    </div>`;
}

function buildBottomNav(activePage) {
  return NAV_ITEMS.map(n => `
    <a href="${n.href}" class="nav-link ${n.id === activePage ? 'active' : ''}">
      <i class="fas ${n.icon}"></i><span>${n.label}</span>
    </a>`).join('');
}

function buildMobileBalance(user) {
  const earnings = user ? (user.earningsTotal || 0) : 0;
  return `
    <div class="mobile-balance-card" id="mobileBalanceCard">
      <p>Earned so far</p>
      <h3 id="mobileEarnAmount">Ksh ${earnings}</h3>
      <button id="mobileWithdrawBtn">Withdraw</button>
    </div>`;
}

function buildModals() {
  return `
    <div id="subscriptionModal" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3 id="subscriptionModalTitle">Choose a Subscription Plan</h3>
          <button class="close-modal" data-close="subscriptionModal">&times;</button>
        </div>
        <div class="modal-body" id="subscriptionContent"></div>
      </div>
    </div>
    <div id="withdrawalModal" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3>Withdraw Funds</h3>
          <button class="close-modal" data-close="withdrawalModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="withdraw-input">
            <label>Available Balance</label>
            <input type="text" id="withdrawBalanceDisplay" readonly style="background:#f9fafb;font-weight:600;">
          </div>
          <div class="withdraw-input">
            <label>Amount to Withdraw (Ksh)</label>
            <input type="number" id="withdrawAmount" placeholder="Min Ksh 4500" step="100">
            <div class="withdraw-note">Minimum withdrawal is Ksh 4500</div>
          </div>
          <div class="withdraw-input">
            <label>M-Pesa Number</label>
            <input type="tel" id="withdrawPhone" placeholder="07XXXXXXXX">
          </div>
          <button class="btn" id="confirmWithdrawBtn">Request Withdrawal</button>
        </div>
      </div>
    </div>`;
}

/**
 * Injects the entire app shell (sidebar, topbar, mobile balance, bottom nav, modals).
 * Pages must have these empty containers in their body:
 *   #shellSidebar, #shellTopbar, #shellMobileBalance (inside .content), #shellBottomNav, #shellModals, #toast
 */
export function renderShell({ activePage, title, subtitle = '' }) {
  const user = getCurrentUser();
  const firstName = user ? user.name.split(' ')[0] : 'User';
  const subtitleFilled = subtitle.replace('{name}', firstName);

  const set = (id, html, isOuter = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isOuter) el.outerHTML = html; else el.innerHTML = html;
  };

  set('shellSidebar', buildSidebar(activePage, user));
  set('shellTopbar', buildTopbar(title, subtitleFilled, user));
  set('shellBottomNav', buildBottomNav(activePage));
  set('shellMobileBalance', buildMobileBalance(user));
  set('shellModals', buildModals());

  attachShellHandlers();
}

export function updateShellUser(user) {
  if (!user) return;
  const initials = getUserInitials(user.name);
  const first = user.name.split(' ')[0];

  const $ = id => document.getElementById(id);
  if ($('earnCardAmount'))   $('earnCardAmount').innerText   = `Ksh ${user.earningsTotal || 0}`;
  if ($('mobileEarnAmount')) $('mobileEarnAmount').innerText = `Ksh ${user.earningsTotal || 0}`;
  if ($('userNameStrong'))   $('userNameStrong').innerText   = user.name;
  if ($('userEmailSpan'))    $('userEmailSpan').innerText    = user.email;
  const avatar = document.querySelector('.avatar');
  if (avatar) avatar.innerText = initials;
  const welcome = document.querySelector('.page-title p');
  if (welcome && /Welcome back/i.test(welcome.innerText)) {
    welcome.innerText = `Welcome back, ${first}`;
  }
}

function attachShellHandlers() {
  const notifBtn  = document.getElementById('notifBtn');
  const notifMenu = document.getElementById('notifMenu');
  const userBtn   = document.getElementById('userBtn');
  const userMenu  = document.getElementById('userMenu');

  if (notifBtn && notifMenu) {
    notifBtn.addEventListener('click', e => {
      e.stopPropagation();
      userMenu?.classList.remove('show');
      notifMenu.classList.toggle('show');
    });
  }
  if (userBtn && userMenu) {
    userBtn.addEventListener('click', e => {
      e.stopPropagation();
      notifMenu?.classList.remove('show');
      userMenu.classList.toggle('show');
    });
  }
  document.addEventListener('click', e => {
    if (notifMenu && !notifBtn?.contains(e.target) && !notifMenu.contains(e.target)) notifMenu.classList.remove('show');
    if (userMenu  && !userBtn?.contains(e.target)  && !userMenu.contains(e.target))  userMenu.classList.remove('show');
  });

  document.getElementById('settingsMenuItem')?.addEventListener('click', () => window.location.href = 'settings.html');
  document.getElementById('logoutMenuItem')?.addEventListener('click', () => {
    sessionStorage.removeItem('loggedInUser');
    localStorage.removeItem('rememberedUser');
    window.location.href = 'login.html';
  });

  // Any .close-modal with data-close
  document.querySelectorAll('.close-modal[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close')));
  });

  // Click-outside to close modals
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('active'); });
  });

  // Withdraw buttons in shell — attach via lazy import to avoid circular dep
  const attach = (id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', async () => {
      const { handleWithdrawClick } = await import('./withdrawal.js');
      handleWithdrawClick();
    });
  };
  attach('withdrawBtn');
  attach('mobileWithdrawBtn');
}