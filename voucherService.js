const QRCode = require('qrcode');
const { readDb, writeDb } = require('./db');
const { randomBytes } = require('crypto');

function generateVoucherCode(prefix = 'DRM') {
  const num = Math.floor(1000 + Math.random() * 9000);
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${rand}-${num}`;
}

const INDUSTRY_PASS_THEMES = {
  drimin: { bg: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', text: '#f59e0b', label: 'DRIMIN DERECHO MINERO PASS' }
};

const LEGAL_ANTI_FRAUD_DISCLAIMER = "⚠️ AVISO LEGAL DE SEGURIDAD: Este Voucher de atención legal está sujeto a validación bancaria definitiva de Drimin Services SpA.";

async function createVoucher({ 
  clientName, 
  clientPhone, 
  industry = 'drimin', 
  voucherType, 
  discountOrAmount, 
  expirationDays = 30,
  propertyAddress = 'Drimin Services SpA',
  nightsCount = 0,
  subtotal = 0,
  iva = 0,
  totalPrice = 0,
  paymentProofUrl
}) {
  const db = readDb();
  
  const code = generateVoucherCode('DRM');
  const id = `vch-${Date.now()}`;
  
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + expirationDays);
  const expirationDateStr = expDate.toISOString().split('T')[0];

  const theme = INDUSTRY_PASS_THEMES.drimin;

  const title = voucherType || 'Pase Digital de Consulta Minera Drimin Services';
  const benefit = discountOrAmount || 'Consulta Jurídica Especializada ($0)';

  const qrPayload = `DRIMIN SERVICES SpA
Pase Digital Oficial de Reunión
Código: ${code}
Cliente: ${clientName || 'Cliente'}
Detalle: ${benefit}
Modalidad: Virtual
Contacto: +56 9 8877 6655
Drimin Services - Soluciones Jurídicas & Técnicas`;

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0b2545',
        light: '#ffffff'
      },
      margin: 2,
      width: 400
    });
  } catch (err) {
    console.error('Error generando QR code:', err);
  }

  const walletPassData = {
    formatVersion: 1,
    passTypeIdentifier: "pass.com.driminservices.legal",
    serialNumber: code,
    teamIdentifier: "DRIMIN_SERVICES",
    organizationName: "Drimin Services SpA - Derecho Minero",
    description: title,
    logoText: theme.label,
    backgroundColor: theme.bg,
    foregroundColor: theme.text,
    barcode: {
      format: "PKBarcodeFormatQR",
      message: code,
      messageEncoding: "iso-8859-1"
    },
    generic: {
      primaryFields: [
        { key: "paymentStatus", label: "ESTADO DE ATENCIÓN", value: "✅ CONSULTA AGENDADA" },
        { key: "benefit", label: "CLIENTE / EMPRESA", value: clientName }
      ],
      secondaryFields: [
        { key: "address", label: "ORGANIZACIÓN", value: propertyAddress || "Drimin Services SpA" }
      ],
      auxiliaryFields: [
        { key: "code", label: "LLAVE DIGITAL / QR", value: code },
        { key: "legalNotice", label: "AVISO LEGAL", value: LEGAL_ANTI_FRAUD_DISCLAIMER }
      ]
    }
  };

  const voucher = {
    id,
    code,
    clientName: clientName || 'Cliente Drimin',
    clientPhone: clientPhone || '+56988776655',
    industry: 'drimin',
    voucherType: title,
    discountOrAmount: benefit,
    expirationDate: expirationDateStr,
    propertyAddress: propertyAddress || 'Drimin Services SpA',
    nightsCount,
    subtotal,
    iva,
    totalPrice,
    paymentProofUrl: paymentProofUrl || null,
    paymentConfirmed: true,
    paymentConfirmedStamp: "✅ CONSULTA CONFIRMADA",
    legalDisclaimer: LEGAL_ANTI_FRAUD_DISCLAIMER,
    qrDataUrl,
    qrCodeDataUrl: qrDataUrl,
    walletPassData,
    status: 'Activo',
    createdAt: new Date().toISOString()
  };

  db.vouchers.unshift(voucher);
  writeDb(db);

  return voucher;
}

function validateAndRedeemVoucher(codeOrId) {
  const db = readDb();
  const index = db.vouchers.findIndex(v => v.code === codeOrId || v.id === codeOrId);

  if (index === -1) {
    return { success: false, message: 'Voucher no encontrado. Código inválido.' };
  }

  const voucher = db.vouchers[index];

  if (voucher.status === 'Canjeado') {
    return { 
      success: false, 
      message: `El voucher ${voucher.code} ya fue VALIDADO el ${new Date(voucher.redeemedAt).toLocaleString()}.`,
      voucher
    };
  }

  voucher.status = 'Canjeado';
  voucher.redeemedAt = new Date().toISOString();
  db.vouchers[index] = voucher;
  writeDb(db);

  return {
    success: true,
    message: `¡Pase Digital Drimin Services ${voucher.code} validado exitosamente!`,
    voucher
  };
}

function getVouchers() {
  const db = readDb();
  return db.vouchers;
}

module.exports = {
  createVoucher,
  validateAndRedeemVoucher,
  getVouchers,
  LEGAL_ANTI_FRAUD_DISCLAIMER
};
