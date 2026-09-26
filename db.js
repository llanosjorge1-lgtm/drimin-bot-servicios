const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'data', 'store.json');
const COMPANY_PAYMENTS_PATH = path.join(__dirname, 'data', 'company_payments.json');

function ensureDataDir() {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readDb() {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const initialDb = {
      appointments: [],
      vouchers: [],
      clients: [],
      pendingRequests: [],
      incidents: [],
      settings: {}
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initialDb, null, 2), 'utf-8');
    return initialDb;
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const db = JSON.parse(raw);
    db.pendingRequests = db.pendingRequests || [];
    db.incidents = db.incidents || [];
    db.conversationStates = db.conversationStates || {};
    return db;
  } catch (err) {
    console.error("Error leyendo store.json:", err);
    return { appointments: [], vouchers: [], clients: [], pendingRequests: [], incidents: [], settings: {}, conversationStates: {} };
  }
}

function writeDb(data) {
  ensureDataDir();
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error escribiendo store.json:", err);
  }
}

function readCompanyPayments() {
  ensureDataDir();
  if (!fs.existsSync(COMPANY_PAYMENTS_PATH)) {
    const defaultPayments = {
      drimin: {
        companyId: "drimin",
        companyName: "Drimin Services - Servicios Jurídicos & Derecho Minero",
        bankName: "Banco de Chile",
        accountType: "Cuenta Corriente",
        accountNumber: "88-98765-02",
        rut: "76.543.210-9",
        holderName: "Drimin Services SpA",
        emailNotification: "felipe.herrera@driminservices.cl",
        instructions: "Transfiera el honorario de la consulta jurídica a la atención del Abg. Felipe Herrera indicando su empresa o RUT en el asunto."
      }
    };
    fs.writeFileSync(COMPANY_PAYMENTS_PATH, JSON.stringify(defaultPayments, null, 2), 'utf-8');
    return defaultPayments;
  }

  try {
    const raw = fs.readFileSync(COMPANY_PAYMENTS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error leyendo company_payments.json:", err);
    return {};
  }
}

function writeCompanyPayments(data) {
  ensureDataDir();
  try {
    fs.writeFileSync(COMPANY_PAYMENTS_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error escribiendo company_payments.json:", err);
  }
}

function getCompanyPaymentDetails(companyId) {
  const allPayments = readCompanyPayments();
  return allPayments.drimin || {
    companyId: "drimin",
    companyName: "Drimin Services - Servicios Jurídicos & Derecho Minero",
    bankName: "Banco de Chile",
    accountType: "Cuenta Corriente",
    accountNumber: "88-98765-02",
    rut: "76.543.210-9",
    holderName: "Drimin Services SpA",
    emailNotification: "felipe.herrera@driminservices.cl",
    instructions: "Transfiera el honorario de la consulta jurídica a la atención del Abg. Felipe Herrera indicando su empresa o RUT en el asunto."
  };
}

function readPendingRequests() {
  const db = readDb();
  return db.pendingRequests || [];
}

function addPendingRequest(reqData) {
  const db = readDb();
  db.pendingRequests = db.pendingRequests || [];
  const newReq = {
    id: `req-${Date.now()}`,
    condoName: reqData.condoName || "Drimin Services SpA",
    clientName: reqData.clientName || "Cliente",
    unitNumber: reqData.unitNumber || "Empresa no especificada",
    requestType: reqData.requestType || "Consulta Jurídica Especializada",
    details: reqData.details || "Solicitud de atención jurídica capturada",
    status: "Pendiente de Atención por Abogado",
    createdAt: new Date().toISOString()
  };
  db.pendingRequests.unshift(newReq);
  writeDb(db);
  return newReq;
}

function resolvePendingRequest(id) {
  const db = readDb();
  db.pendingRequests = db.pendingRequests || [];
  const item = db.pendingRequests.find(r => r.id === id);
  if (item) {
    item.status = "Resuelto / Atendido";
    item.resolvedAt = new Date().toISOString();
    writeDb(db);
    return { success: true, item };
  }
  return { success: false, message: "Solicitud no encontrada" };
}

function getConversationState(phone) {
  if (!phone) return null;
  const db = readDb();
  return (db.conversationStates && db.conversationStates[phone]) || null;
}

function saveConversationState(phone, state) {
  if (!phone) return;
  const db = readDb();
  db.conversationStates = db.conversationStates || {};
  db.conversationStates[phone] = {
    ...(db.conversationStates[phone] || {}),
    ...state,
    updatedAt: new Date().toISOString()
  };
  writeDb(db);
  return db.conversationStates[phone];
}

function getAllConversationStates() {
  const db = readDb();
  return db.conversationStates || {};
}

module.exports = {
  readDb,
  writeDb,
  readCompanyPayments,
  writeCompanyPayments,
  getCompanyPaymentDetails,
  readPendingRequests,
  addPendingRequest,
  resolvePendingRequest,
  getConversationState,
  saveConversationState,
  getAllConversationStates
};
