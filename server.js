require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { connectToWhatsApp, getWhatsAppStatus, resetWhatsAppConnection } = require('./whatsappBaileys');
const { processMessage } = require('./agentEngine');
const { readDb, writeDb, getCompanyPaymentDetails, writeCompanyPayments, readCompanyPayments, readPendingRequests, resolvePendingRequest } = require('./db');
const { validateAndRedeemVoucher, getVouchers } = require('./voucherService');
const { startReminderCron } = require('./reminderCron');

const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Estado de WhatsApp & QR
app.get('/api/status', (req, res) => {
  const status = getWhatsAppStatus();
  res.json(status);
});

// Reinicio manual de WhatsApp
app.post('/api/reset-whatsapp', async (req, res) => {
  try {
    const result = await resetWhatsAppConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Simulador de Chat en vivo
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], senderPhone = '+56988776655', pushName = 'Cliente Pruebas' } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: "Falta parámetro 'message'" });
    }

    const response = await processMessage({
      message,
      history,
      senderPhone,
      pushName
    });

    res.json({ success: true, ...response });
  } catch (err) {
    console.error("Error en simulador /api/chat:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Citas & Consultas Agendadas
app.get('/api/appointments', (req, res) => {
  const db = readDb();
  res.json({ success: true, appointments: db.appointments || [] });
});

// Incidencias / Requerimientos Legales
app.get('/api/incidents', (req, res) => {
  const db = readDb();
  res.json({ success: true, incidents: db.incidents || [] });
});

app.post('/api/incidents/:id/resolve', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const item = (db.incidents || []).find(i => i.id === id);
  if (item) {
    item.status = 'Resuelto';
    item.resolvedAt = new Date().toISOString();
    writeDb(db);
    return res.json({ success: true, item });
  }
  res.status(404).json({ success: false, message: 'Requerimiento no encontrado' });
});

// Pases / Vouchers QR
app.get('/api/vouchers', (req, res) => {
  const vouchers = getVouchers();
  res.json({ success: true, vouchers });
});

app.post('/api/vouchers/redeem', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ success: false, message: "Falta parámetro 'code'" });
  const result = validateAndRedeemVoucher(code);
  res.json(result);
});

// Datos de Transferencia Bancaria
app.get('/api/company-payments', (req, res) => {
  const info = getCompanyPaymentDetails('drimin');
  res.json({ success: true, company: info });
});

app.post('/api/company-payments', (req, res) => {
  const newDetails = req.body;
  const all = readCompanyPayments();
  all.drimin = {
    ...all.drimin,
    ...newDetails
  };
  writeCompanyPayments(all);
  res.json({ success: true, company: all.drimin });
});

// Solicitudes Pendientes
app.get('/api/pending-requests', (req, res) => {
  const pending = readPendingRequests();
  res.json({ success: true, pendingRequests: pending });
});

app.post('/api/pending-requests/:id/resolve', (req, res) => {
  const { id } = req.params;
  const result = resolvePendingRequest(id);
  res.json(result);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`\n===================================================`);
  console.log(`🚀 SERVIDOR DRIMIN SERVICES INICIADO EN PUERTO ${PORT}`);
  console.log(`🌐 Dashboard UI: http://localhost:${PORT}`);
  console.log(`===================================================\n`);

  startReminderCron();
  await connectToWhatsApp();
});
