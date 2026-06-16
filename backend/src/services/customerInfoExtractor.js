const extractCustomerName = (text) => {
  const value = String(text || '').trim();

  if (!value) {
    return null;
  }

  const explicitPatterns = [
    /(?:meu nome (?:é|e)|me chamo|sou (?:o|a)?)\s*[:.]?\s*(.+)$/i,
    /^nome\s*[:.]?\s*(.+)$/i
  ];

  for (const pattern of explicitPatterns) {
    const match = value.match(pattern);

    if (match?.[1]?.trim()) {
      return match[1].trim().slice(0, 80);
    }
  }

  if (looksLikePlainName(value)) {
    return value.slice(0, 80);
  }

  return null;
};

const looksLikePlainName = (text) => {
  const value = String(text || '').trim();

  if (!value || value.length < 2 || value.length > 60) {
    return false;
  }

  if (/\d|@|https?:|www\.|^\W+$/.test(value)) {
    return false;
  }

  if (
    /\b(pedido|pizza|refrigerante|confirmo|confirmar|fechar|cardapio|cardápio|menu|quero|sim|nao|não|obrigad|delivery|entrega|endereco|endereço|rua|avenida|calabresa|margarita|margherita|bebida|total|pix|paguei)\b/i.test(
      value
    )
  ) {
    return false;
  }

  const words = value.split(/\s+/);

  return words.length <= 4 && /^[\p{L}\s'-]+$/u.test(value);
};

const extractDeliveryAddress = (text) => {
  const value = String(text || '').trim();

  if (!value || value.length < 6) {
    return null;
  }

  if (looksLikePlainName(value)) {
    return null;
  }

  if (
    /\b(rua|r\.|av\.|avenida|travessa|alameda|nº|numero|n°|bairro|casa|apto|apartamento|bloco|cep|entrega|tijuca|centro)\b/i.test(
      value
    )
  ) {
    return value.slice(0, 255);
  }

  if (/\d/.test(value) && value.length >= 10) {
    return value.slice(0, 255);
  }

  return null;
};

const resolveCustomerInfoFromMessage = ({ text, aiCustomerName, aiDeliveryAddress, existingName }) => {
  const inferredName = extractCustomerName(text);
  const inferredAddress = extractDeliveryAddress(text);

  return {
    customerName: aiCustomerName || (!existingName ? inferredName : null),
    deliveryAddress: aiDeliveryAddress || inferredAddress
  };
};

module.exports = {
  extractCustomerName,
  extractDeliveryAddress,
  looksLikePlainName,
  resolveCustomerInfoFromMessage
};
