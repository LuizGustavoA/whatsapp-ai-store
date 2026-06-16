const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');

const normalizeText = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isMenuRequest = (text) => {
  const normalized = normalizeText(text);

  return (
    normalized.includes('cardapio') ||
    /\bmenu\b/.test(normalized) ||
    /ver (o )?cardapio/.test(normalized) ||
    /manda(r)? (o )?cardapio/.test(normalized) ||
    /quero ver (o )?(cardapio|menu)/.test(normalized) ||
    /mostra(r)? (o )?cardapio/.test(normalized)
  );
};

const getLocalMenuImagePath = () => {
  const publicDir = path.join(__dirname, '../../public');
  const candidates = ['cardapio.jpg', 'cardapio.jpeg', 'cardapio.png', 'menu.jpg', 'menu.png'];

  for (const filename of candidates) {
    const fullPath = path.join(publicDir, filename);

    if (fs.existsSync(fullPath)) {
      return { fullPath, filename };
    }
  }

  return null;
};

const getMenuImageUrl = () => {
  if (process.env.MENU_IMAGE_URL?.trim()) {
    return process.env.MENU_IMAGE_URL.trim();
  }

  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');

  if (!publicBaseUrl) {
    return null;
  }

  const local = getLocalMenuImagePath();

  if (!local) {
    return null;
  }

  return `${publicBaseUrl}/public/${local.filename}`;
};

const hasMenuImage = () => Boolean(getMenuImageUrl());

const formatCurrency = (value) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const buildTextMenu = (products = []) => {
  if (!products.length) {
    return 'No momento ainda não temos produtos no cardápio. Em breve novidades!';
  }

  const sorted = [...products].sort((a, b) => {
    if (a.is_promotion !== b.is_promotion) {
      return a.is_promotion ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });

  const lines = sorted.map((product) => {
    const price = Product.getEffectivePrice(product);
    const promo = product.is_promotion ? ' 🔥' : '';

    return `• ${product.name}${promo} — ${formatCurrency(price)}`;
  });

  return ['📋 *Cardápio*', '', ...lines, '', 'É só me dizer o que você quer pedir! 😊'].join('\n');
};

module.exports = {
  isMenuRequest,
  getMenuImageUrl,
  hasMenuImage,
  buildTextMenu,
  getLocalMenuImagePath
};
