// shared/auth.js
export function getCurrentUser() {
  const session = sessionStorage.getItem('loggedInUser');
  if (!session) return null;
  try {
    const { email } = JSON.parse(session);
    const users = JSON.parse(localStorage.getItem('users')) || [];
    return users.find(u => u.email === email) || null;
  } catch { return null; }
}

export function updateUser(user) {
  const users = JSON.parse(localStorage.getItem('users')) || [];
  const i = users.findIndex(u => u.email === user.email);
  if (i !== -1) users[i] = user;
  localStorage.setItem('users', JSON.stringify(users));
  sessionStorage.setItem('loggedInUser', JSON.stringify({ email: user.email, name: user.name }));
}

export function requireAuth(redirect = 'login.html') {
  const user = getCurrentUser();
  if (!user) { window.location.href = redirect; return null; }
  if (user.activationFeePaid === undefined) user.activationFeePaid = false;
  if (user.completedSurveys === undefined) user.completedSurveys = [];
  return user;
}

export function getUserInitials(name) {
  return (name || 'User').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}