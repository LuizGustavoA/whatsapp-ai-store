const PAYMENT_METHODS = ['debito', 'dinheiro', 'pix', 'credito', 'ifood', 'outros'];

const PAYMENT_METHOD_LABELS = {
  debito: 'Débito',
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  credito: 'Crédito',
  ifood: 'iFood',
  outros: 'Outros'
};

const isValidPaymentMethod = (value) => PAYMENT_METHODS.includes(value);

const getPaymentMethodLabel = (value) =>
  PAYMENT_METHOD_LABELS[value] || value || '—';

module.exports = {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  isValidPaymentMethod,
  getPaymentMethodLabel
};
