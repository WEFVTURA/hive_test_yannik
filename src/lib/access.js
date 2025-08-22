// Central access helper for admin checks and shared visibility

export const MASTER_ADMIN_EMAILS = ['ggg@fvtura.com', 'g@fvtura.com'];

export function isMasterAdmin(user){
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  return MASTER_ADMIN_EMAILS.includes(email);
}


