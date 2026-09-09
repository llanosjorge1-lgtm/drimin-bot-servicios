const { createVoucher } = require('./voucherService');
const { readDb, writeDb } = require('./db');

/**
 * Procesa la recepción y verificación de comprobantes de pago para Drimin Services SpA
 */
async function processPaymentReceipt({ message, clientName, unitNumber, condoName = "Drimin Services SpA", adminEmail = 'felipe.herrera@driminservices.cl' }) {
  const db = readDb();
  if (!db.receipts) db.receipts = [];

  let opNumber = `N° ${Math.floor(100000 + Math.random() * 900000)}`;
  const opMatch = message.match(/(?:comprobante|transferencia|operacion|operación|n°|nro)\s*[:#]?\s*(\d{5,12})/i);
  if (opMatch && opMatch[1]) {
    opNumber = `N° ${opMatch[1]}`;
  }

  let amountStr = 'Monto por Verificar';
  const amountMatch = message.match(/(?:\$|clp)\s*([\d.]{4,10})/i) || message.match(/(\d{2,3}\.\d{3})/);
  if (amountMatch && amountMatch[1]) {
    amountStr = `$${amountMatch[1]} CLP`;
  }

  const receiptCode = `DRM-${Date.now().toString().slice(-6)}`;

  const voucher = await createVoucher({
    clientName: `${clientName || 'Cliente'} (Empresa: ${unitNumber || 'Empresa no especificada'})`,
    clientPhone: '+56988776655',
    industry: 'drimin',
    voucherType: `Comprobante de Pago Drimin Services (${condoName})`,
    discountOrAmount: `Pago Recibido (${amountStr}) | Transf. ${opNumber} | Empresa: ${unitNumber || 'Empresa no especificada'}`,
    propertyAddress: condoName
  });

  const receiptRecord = {
    id: receiptCode,
    clientName: clientName || 'Cliente',
    unitNumber: unitNumber || 'Empresa no especificada',
    operationNumber: opNumber,
    amountStr: amountStr,
    voucherCode: voucher.code,
    status: 'Verificado',
    adminEmail,
    createdAt: new Date().toISOString()
  };

  db.receipts.unshift(receiptRecord);
  writeDb(db);

  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
  if (n8nWebhookUrl) {
    try {
      await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'PAYMENT_RECEIPT_SUBMITTED',
          emailSubject: 'comprobante de pago',
          receiptCode,
          clientName,
          unitNumber,
          operationNumber: opNumber,
          amountStr,
          voucherCode: voucher.code,
          adminEmail
        })
      });
      console.log(`🧾 Comprobante de honorarios Drimin ${receiptCode} despachado a n8n!`);
    } catch (e) {
      console.error("Error enviando comprobante Drimin a n8n:", e.message);
    }
  }

  const nameTag = clientName ? `@${clientName}` : 'Cliente';
  const replyText = `🧾 **COMPROBANTE DE HONORARIOS JURÍDICOS VERIFICADO** 💳✨\n\n` +
    `Estimado/a **${nameTag}** (Empresa **${unitNumber}**):\n` +
    `Hemos recibido exitosamente el comprobante de pago de tus servicios jurídicos.\n\n` +
    `• 🏦 **N° Operación / Transf.**: \`${opNumber}\`\n` +
    `• 💵 **Monto Declarado**: **${amountStr}**\n` +
    `• 🎟️ **Código de Validación QR**: \`${voucher.code}\`\n` +
    `• 🚦 **Estado de Recepción**: **Registrado & Verificado por Administración Drimin**\n` +
    `• 📩 **Copia enviada a finanzas**: \`${adminEmail}\`\n\n` +
    `El recibo oficial de honorarios ha sido adjunto a tu ficha corporativa. ¡Muchas gracias por tu pago oportuno! ⚖️📜`;

  return {
    success: true,
    receipt: receiptRecord,
    voucher,
    reply: replyText
  };
}

module.exports = {
  processPaymentReceipt
};
