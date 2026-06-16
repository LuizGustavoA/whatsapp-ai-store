const Customer = require('../models/Customer');

const CASHBACK_RATE = Number(process.env.CASHBACK_RATE || 0.05);

const calculateDiscount = async (phoneNumber, subtotal) => {
  const customer = await Customer.findOrCreateByPhoneNumber(phoneNumber);
  const balance = Number(customer.cashback_balance);
  const discount = Math.min(balance, Number(subtotal));

  return {
    customer,
    discountAmount: Number(discount.toFixed(2)),
    remainingBalance: Number((balance - discount).toFixed(2))
  };
};

const applyCashbackDiscount = async (phoneNumber, subtotal, useCashback) => {
  if (!useCashback) {
    const customer = await Customer.findOrCreateByPhoneNumber(phoneNumber);

    return {
      customer,
      discountAmount: 0,
      cashbackUsed: 0,
      totalAmount: Number(subtotal)
    };
  }

  const { customer, discountAmount } = await calculateDiscount(phoneNumber, subtotal);
  const totalAmount = Math.max(Number(subtotal) - discountAmount, 0);

  if (discountAmount > 0) {
    await Customer.deductCashback(phoneNumber, discountAmount);
  }

  return {
    customer,
    discountAmount,
    cashbackUsed: discountAmount,
    totalAmount: Number(totalAmount.toFixed(2))
  };
};

const accrueForPaidOrder = async (phoneNumber, orderTotal) => {
  const cashbackAmount = Number((Number(orderTotal) * CASHBACK_RATE).toFixed(2));

  if (cashbackAmount <= 0) {
    return null;
  }

  await Customer.findOrCreateByPhoneNumber(phoneNumber);
  const customer = await Customer.addCashback(phoneNumber, cashbackAmount);

  return {
    cashbackAmount,
    newBalance: Number(customer.cashback_balance)
  };
};

module.exports = {
  CASHBACK_RATE,
  calculateDiscount,
  applyCashbackDiscount,
  accrueForPaidOrder
};
