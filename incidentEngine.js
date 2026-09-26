const { readDb, writeDb } = require('./db');
const { dispatchDriminEvent } = require('./emailService');

const INCIDENT_MENU_DRIMIN = [
  { id: 1, label: "Requerimiento en Derecho Minero (Concesiones, Amparos, Pedimentos)", keywords: ["minero", "mineria", "minería", "concesion", "concesión", "pedimento", "manifestacion"] },
  { id: 2, label: "Consulta / Incidencia en proyectos de Energía", keywords: ["energia", "energía", "electrico", "eléctrico", "planta", "solicitud"] },
  { id: 3, label: "Gestión de Terrenos Fiscales y Concesiones Marítimas / Territoriales", keywords: ["terreno", "fiscal", "territorial", "maritima", "marítima", "bienes nacionales"] },
  { id: 4, label: "Asesoría Legal Corporativa & Contratos de Empresas", keywords: ["empresa", "corporativo", "contrato", "sociedad", "estatuto"] },
  { id: 5, label: "Resolución de Controversias, Litigios y Recuperación de Activos", keywords: ["controversia", "litigio", "demanda", "juicio", "activo", "cobranza"] },
  { id: 6, label: "Consultoría en Compliance, Auditoría y Buenas Prácticas Corporativas", keywords: ["compliance", "auditoria", "auditoría", "prevencion", "prevención", "delito"] },
  { id: 7, label: "Fiscalización / Requerimiento regulatorio urgente de autoridad", keywords: ["fiscalizacion", "fiscalización", "autoridad", "sumario", "multa", "regulacion"] },
  { id: 8, label: "Requerimiento de informe o dictamen jurídico urgente", keywords: ["informe", "dictamen", "opinión", "opinion", "legal"] },
  { id: 9, label: "Otra consulta o requerimiento jurídico (Describir la situación)", keywords: ["otro", "otra", "diferente"] }
];

function getIncidentMenuText(clientName, unitNumber) {
  const nameTag = clientName ? `@${clientName}` : 'Cliente';
  const unitTag = (unitNumber && unitNumber !== 'Empresa no especificada') ? ` (Empresa/Unidad **${unitNumber}**)` : '';

  return `¡Hola **${nameTag}**${unitTag}! Con gusto registramos tu requerimiento jurídico / incidencia ⚖️📜\n\n` +
    `Por favor selecciona el **área o tipo de consulta legal** indicando la opción correspondiente:\n\n` +
    `1️⃣ **Derecho Minero** (Concesiones, Amparos, Pedimentos)\n` +
    `2️⃣ **Energía** (Proyectos Eléctricos, Permisos, Regulaciones)\n` +
    `3️⃣ **Terrenos Fiscales y Gestión Territorial** (Bienes Nacionales, Concesiones)\n` +
    `4️⃣ **Asesoría Legal a Empresas** (Contratos, Sociedades, Estructuración)\n` +
    `5️⃣ **Resolución de Controversias y Recuperación de Activos** (Litigios, Arbitrajes)\n` +
    `6️⃣ **Compliance y Corporativo** (Auditorías, Ley 20.393, Modelos de Prevención)\n` +
    `7️⃣ **Fiscalización / Requerimiento regulatorio urgente**\n` +
    `8️⃣ **Informe o Dictamen Jurídico Urgente**\n` +
    `9️⃣ **Otra consulta o requerimiento jurídico (Describir la situación)**\n\n` +
    `Por favor indícanos el número de opción (1 a 9) o describe brevemente la situación.`;
}

async function processIncidentFlow({ message, history = [], clientName, unitNumber, condoName = "Drimin Services SpA", adminEmail = 'felipe.herrera@driminservices.cl' }) {
  const incidentMenu = INCIDENT_MENU_DRIMIN;
  const textLower = message.trim().toLowerCase();
  const hasMeetingIntent = textLower.includes('reunion') || textLower.includes('reunión') || textLower.includes('agendar') || textLower.includes('coordinar') || textLower.includes('cita');
  
  if (hasMeetingIntent) {
    return { completed: false, cancelFlow: true, reply: null };
  }

  const db = readDb();
  if (!db.incidents) db.incidents = [];

  const lastBotMsg = (history && history.length > 0) 
    ? history.filter(h => h.role === 'assistant').slice(-1)[0]?.content || ''
    : '';

  const wasAskingName = lastBotMsg.includes('Nombre, Apellido') || lastBotMsg.includes('Nombre de tu Empresa');
  const wasShowingMenu = lastBotMsg.includes('área o tipo de consulta legal') || lastBotMsg.includes('Derecho Minero');
  const wasAskingDescription = lastBotMsg.includes('describe el problema') || lastBotMsg.includes('inconveniente') || lastBotMsg.includes('situación');

  if (!clientName || clientName === 'Cliente / Empresa Minera') {
    const textClean = message.replace(/(?:empresa|faena|unidad)\s*n?°?\s*[A-Za-z0-9]+/gi, '').trim();
    const words = textClean.split(/\s+/).filter(w => w.length > 1 && !['reporte', 'incidencia', 'hola', 'buenas', 'tardes'].includes(w.toLowerCase()));
    if (words.length >= 2) {
      clientName = words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }

  if (!unitNumber || unitNumber === 'Empresa no especificada') {
    const depMatch = message.match(/(?:empresa|faena|compañía|compania|unidad)\s*n?°?\s*([A-Za-z0-9\s.-]+?)(?=\s+y\s|\s+asunto|\s+para|\s+el\s|\s+a\s+las|$|,|\.)/i);
    if (depMatch && depMatch[1]) {
      unitNumber = depMatch[1].trim();
    }
  }

  if (!clientName || !unitNumber || unitNumber === 'Empresa no especificada') {
    return {
      completed: false,
      reply: `¡Hola! Con gusto te ayudamos a registrar tu requerimiento jurídico ⛏️📜\n\n` +
        `Por favor, indícanos primero tu **Nombre, Apellido** y el **Nombre de tu Empresa / Unidad Minera** para asociarlo a tu solicitud.`
    };
  }

  if (wasAskingName || (!wasShowingMenu && !wasAskingDescription)) {
    return {
      completed: false,
      reply: getIncidentMenuText(clientName, unitNumber)
    };
  }

  let selectedCategory = null;
  const numberMatch = textLower.match(/^([1-9])$/);
  if (numberMatch) {
    const optId = parseInt(numberMatch[1], 10);
    const cat = incidentMenu.find(m => m.id === optId);
    if (cat) selectedCategory = cat.label;
  }

  if (!selectedCategory) {
    for (const cat of incidentMenu) {
      if (cat.id === 9) continue;
      if (cat.keywords.some(k => textLower.includes(k))) {
        selectedCategory = cat.label;
        break;
      }
    }
  }

  if (numberMatch && parseInt(numberMatch[1], 10) === 9 && !wasAskingDescription) {
    return {
      completed: false,
      reply: `Por favor describe detalladamente la consulta o situación legal que se presenta para notificar al equipo de abogados.`
    };
  }

  if (!selectedCategory && !wasAskingDescription) {
    return {
      completed: false,
      reply: getIncidentMenuText(clientName, unitNumber)
    };
  }

  const finalDescription = selectedCategory || message;
  const ticketId = `INC-${Math.floor(100000 + Math.random() * 900000)}`;
  const emailSubject = `reporte de incidencia técnica / HSEC - Drimin Services`;

  const newIncident = {
    id: ticketId,
    condoName,
    clientName: clientName || "Cliente / Empresa Minera",
    unitNumber: unitNumber || "Empresa no especificada",
    description: finalDescription,
    fullText: message,
    status: "Pendiente",
    priority: textLower.includes('urgente') || textLower.includes('fiscalización') || textLower.includes('sumario') ? "Alta" : "Normal",
    adminEmail,
    industry: 'drimin',
    createdAt: new Date().toISOString()
  };

  db.incidents.unshift(newIncident);
  writeDb(db);

  // Despacho nativo de alerta por correo Ferozo + n8n opcional
  dispatchDriminEvent({
    event: 'INCIDENT_REPORTED',
    emailSubject,
    ticketId,
    condoName,
    clientName: newIncident.clientName,
    unitNumber: newIncident.unitNumber,
    description: finalDescription,
    priority: newIncident.priority,
    adminEmail
  });

  const nameTag = clientName ? `@${clientName}` : 'Cliente';
  const unitTag = (unitNumber && unitNumber !== 'Empresa no especificada') ? ` (Empresa **${unitNumber}**)` : '';

  const confirmationReply = `🚨 **REQUERIMIENTO JURÍDICO REGISTRADO CON ÉXITO** ⚖️📜\n\n` +
    `Estimado/a **${nameTag}**${unitTag}:\n\n` +
    `Informamos que se ha notificado de manera exitosa al **Equipo Jurídico de Drimin Services** para atender su requerimiento de **${finalDescription}** (Ticket ID: \`${ticketId}\`) y gestionar la asesoría requerida a la brevedad.\n\n` +
    `Agradecemos su contacto y por **confiar en Drimin Services**. ¡Que tenga un excelente día! ⚖️📜`;

  return {
    completed: true,
    incident: newIncident,
    reply: confirmationReply
  };
}

module.exports = {
  processIncidentFlow,
  getIncidentMenuText
};
