// shared/config.js — single source of truth for the whole app

export const PLANS = [
  { name: 'Basic',         price: 199,  badge: null },
  { name: 'Standard',      price: 399,  badge: null },
  { name: 'Standard Plus', price: 499,  badge: 'BEST VALUE' },
  { name: 'Premium',       price: 799,  badge: null },
  { name: 'Premium Plus',  price: 999,  badge: null },
  { name: 'Platinum',      price: 1499, badge: 'BEST DEAL' },
];

export const PLAN_LEVELS = {
  'Basic': 1, 'Standard': 2, 'Standard Plus': 3,
  'Premium': 4, 'Premium Plus': 5, 'Platinum': 6,
};

export const PLAN_FEATURES = {
  'Basic': [
    'Access to free surveys',
    'Fast withdrawals',
    'Standard support',
  ],
  'Standard': [
    'All Basic benefits',
    '3 standard surveys daily',
    'Up to Ksh 15,000 monthly earnings',
    'Priority support',
  ],
  'Standard Plus': [
    'All Standard benefits',
    '5 standard surveys daily',
    'Up to Ksh 30,000 monthly earnings',
  ],
  'Premium': [
    'All Standard Plus benefits',
    'Access to premium surveys',
    '10 premium surveys daily',
    'Up to Ksh 40,500 monthly earnings',
  ],
  'Premium Plus': [
    'All Premium benefits',
    '15 premium surveys daily',
    'Up to Ksh 60,500 monthly earnings',
  ],
  'Platinum': [
    'All Premium Plus benefits',
    '15 premium surveys daily',
    '5 moderator surveys daily',
    'Up to Ksh 100,000 monthly earnings',
  ],
};

export const MIN_WITHDRAWAL = 4500;
export const ACTIVATION_FEE = 2000;
export const TILL_NUMBER    = '1693403';

export const API_ENDPOINTS = {
  initiatePayment: '/api/initiate-payment',
  normalizePhone:  '/api/normalize-phone',
  verifyPayment:   '/api/verify-payment',
};

export const getPlanByName = (name) => PLANS.find(p => p.name === name) || null;
export const getPlanLevel  = (name) => PLAN_LEVELS[name] || 0;