export type Dict = Record<string, string>;

const ru: Dict = {
  loyalty_program: 'Программа лояльности',
  show_qr: 'Показать QR',
  balance: 'Баланс',
  history: 'История',
  consent_grant: 'Дать согласие',
  consent_revoke: 'Отозвать согласие',
  auth_required: 'Сначала авторизуйтесь',
  auth_ok: 'Авторизовано через Telegram',
  qr_gen_error: 'Ошибка генерации QR',
  balance_error: 'Ошибка баланса',
  history_error: 'Ошибка истории',
  consent_error: 'Ошибка согласия',
  qr_not_generated: 'QR ещё не сгенерирован',
  no_operations: 'Операций пока нет',
  load_more: 'Показать ещё',
  profile: 'Профиль',
  merchant: 'Мерчант',
  customer_id: 'CustomerId',
  update_balance: 'Обновить баланс',
};

const en: Dict = {
  loyalty_program: 'Loyalty Program',
  show_qr: 'Show QR',
  balance: 'Balance',
  history: 'History',
  consent_grant: 'Give Consent',
  consent_revoke: 'Revoke Consent',
  auth_required: 'Please authorize first',
  auth_ok: 'Authorized via Telegram',
  qr_gen_error: 'QR generation error',
  balance_error: 'Balance error',
  history_error: 'History error',
  consent_error: 'Consent error',
  qr_not_generated: 'QR not generated yet',
  no_operations: 'No operations yet',
  load_more: 'Load more',
  profile: 'Profile',
  merchant: 'Merchant',
  customer_id: 'CustomerId',
  update_balance: 'Refresh balance',
};

export function getDict(lang?: string): Dict {
  const l = (lang || '').toLowerCase();
  if (l.startsWith('en')) return en;
  return ru;
}

