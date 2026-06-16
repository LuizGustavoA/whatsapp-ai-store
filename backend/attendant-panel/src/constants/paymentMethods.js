export const PAYMENT_METHOD_OPTIONS = [
  { value: 'debito', label: 'Débito' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'credito', label: 'Crédito' },
  { value: 'ifood', label: 'iFood' },
  { value: 'outros', label: 'Outros' }
];

export const paymentMethodLabel = (value) =>
  PAYMENT_METHOD_OPTIONS.find((option) => option.value === value)?.label || '—';
