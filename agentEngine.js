const { readDb, writeDb, getCompanyPaymentDetails, addPendingRequest } = require('./db');
const { createVoucher } = require('./voucherService');
const { dispatchDriminEvent } = require('./emailService');
const { generateGeminiReply } = require('./geminiService');

const DRIMIN_CONFIG = {
  name: "Drimin Services - Servicios Jurídicos & Derecho Minero",
  companyEmail: "felipe.herrera@driminservices.cl",
  phone: "+56 9 8877 6655",
  role: "Abg. Felipe Herrera / Asistente Virtual Drimin Services",
  termCita: "Consulta Legal Especializada (Derecho Minero, Energía, Terrenos, Compliance)",
  termCliente: "Cliente / Empresa",
  quickPromptCita: "Agendar Consulta Jurídica (Derecho Minero, Energía, Terrenos Fiscales)",
  quickPromptVoucher: "Reportar Requerimiento Jurídico / Consulta Urgente",
  quickPromptPrecios: "Ver Especialidades Legales & Datos Bancarios",
  services: [
    { name: "Derecho Minero & Concesiones (Outlook Calendar)", duration: "1 hora", price: "Sin costo ($0)" },
    { name: "Energía & Proyectos Eléctricos / Regulaciones", duration: "1 hora", price: "Sin costo ($0)" },
    { name: "Terrenos Fiscales y Gestión Territorial (Bienes Nacionales)", duration: "1 hora", price: "Sin costo ($0)" },
    { name: "Asesoría Legal a Empresas (Contratos & Sociedades)", duration: "1 hora", price: "Sin costo ($0)" },
    { name: "Resolución de Controversias y Recuperación de Activos", duration: "1 hora", price: "Sin costo ($0)" },
    { name: "Compliance y Corporativo (Modelos de Prevención)", duration: "1 hora", price: "Sin costo ($0)" }
  ],
  greeting: `¡Hola! Un gusto saludarte ⚖️📜 Te escribe el asistente virtual del **Abogado Felipe Herrera** en **Drimin Services SpA** (Servicios Jurídicos Especializados & Derecho Minero).\n\n` +
    `¿En qué te podemos asesorar el día de hoy?\n\n` +
    `• 1️⃣ **Coordinar una consulta jurídica** (Derecho Minero, Energía, Terrenos Fiscales, Empresas o Litigios)\n` +
    `• 2️⃣ **Cancelar una cita previa**\n` +
    `• 3️⃣ **Reprogramar una reunión**\n` +
    `• 4️⃣ **Reporte de urgencia legal o fiscalización**\n` +
    `• 5️⃣ **Datos bancarios oficiales**\n\n` +
    `*(O si prefieres, cuéntame directamente qué necesitas y con gusto te oriento).*`
};

// BLOQUES OFICIALES DE REUNIÓN DE LUNES A VIERNES (1 HORA CADA UNO: 15:00 A 18:00 HRS)
const MEETING_SLOTS = [
  { id: 1, label: "15:00 a 16:00 hrs", hour: 15, minute: 0, timeStr: "15:00", block: "TARDE" },
  { id: 2, label: "16:00 a 17:00 hrs", hour: 16, minute: 0, timeStr: "16:00", block: "TARDE" },
  { id: 3, label: "17:00 a 18:00 hrs", hour: 17, minute: 0, timeStr: "17:00", block: "TARDE" }
];

function getNextBusinessDays(count = 3) {
  const days = [];
  const date = new Date();
  while (days.length < count) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      days.push(new Date(date));
    }
  }
  return days;
}

function formatBusinessDate(dateObj) {
  const dayNum = dateObj.getDate();
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const dayOfWeek = dayNames[dateObj.getDay()];
  const monthName = monthNames[dateObj.getMonth()];
  return `${dayOfWeek} ${dayNum} de ${monthName}`;
}

function getAvailableSlots(targetDate) {
  const db = readDb();
  const appointments = db.appointments || [];

  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1;
  const day = targetDate.getDate();

  const padMonth = String(month).padStart(2, '0');
  const padDay = String(day).padStart(2, '0');
  const dateIsoPrefix = `${year}-${padMonth}-${padDay}`;

  const bookedSlotIds = new Set();

  appointments.forEach(apt => {
    if (apt.status === 'Cancelada' || apt.status === 'Cancelada (Reprogramada)' || (apt.paymentStatus && apt.paymentStatus.includes('Cancelad'))) {
      return;
    }

    let isSameDay = false;
    if (apt.startIso && apt.startIso.startsWith(dateIsoPrefix)) {
      isSameDay = true;
    } else if (apt.dateTime) {
      const aptText = apt.dateTime.toLowerCase();
      if (aptText.includes(dateIsoPrefix) || 
          aptText.includes(`${day} de`) || 
          aptText.includes(`${padDay} de`)) {
        isSameDay = true;
      }
    }

    if (!isSameDay) return;

    if (apt.startIso && apt.startIso.includes('T')) {
      try {
        const timePart = apt.startIso.split('T')[1];
        const [hStr, mStr] = timePart.split(':');
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        const matchedIsoSlot = MEETING_SLOTS.find(s => s.hour === h && s.minute === m);
        if (matchedIsoSlot) {
          bookedSlotIds.add(matchedIsoSlot.id);
        }
      } catch (e) {}
    }

    if (apt.slotId && typeof apt.slotId === 'number') {
      bookedSlotIds.add(apt.slotId);
    }

    if (apt.dateTime || apt.serviceType) {
      const text = `${apt.dateTime || ''} ${apt.serviceType || ''}`.toLowerCase();
      MEETING_SLOTS.forEach(slot => {
        if (text.includes(slot.label.toLowerCase()) || 
            text.includes(`(${slot.timeStr}`) || 
            text.includes(`a las ${slot.timeStr}`) ||
            text.includes(`${slot.timeStr} hrs`) ||
            text.includes(`${slot.timeStr} a `) ||
            text.includes(slot.timeStr)) {
          bookedSlotIds.add(slot.id);
        }
      });
    }
  });

  return MEETING_SLOTS.filter(slot => !bookedSlotIds.has(slot.id));
}

async function executeTool(toolName, args) {
  const db = readDb();

  if (toolName === 'agendar_cita') {
    const { clientName, clientPhone, serviceType, dateTime, slotId, startIso, endIso, asunto, summary, unitNumber } = args;

    const newAppointment = {
      id: `apt-${Date.now()}`,
      clientName: clientName || DRIMIN_CONFIG.termCliente,
      clientPhone: clientPhone || '+56988776655',
      unitNumber: unitNumber || 'Empresa no especificada',
      asunto: asunto || summary || `Consulta Minera: ${clientName || 'Cliente'}`,
      summary: summary || asunto || `Consulta Minera: ${clientName || 'Cliente'}`,
      industry: 'drimin',
      serviceType: serviceType || "Consulta Legal Drimin Services",
      propertyAddress: "Drimin Services SpA",
      dateTime: dateTime || new Date(Date.now() + 86400000).toISOString(),
      slotId: slotId || null,
      startIso: startIso || null,
      endIso: endIso || null,
      nightsCount: 0,
      pricePerNight: 0,
      subtotal: 0,
      ivaOrFee: 0,
      totalAmount: 0,
      paymentStatus: 'Confirmada (Gratuita)',
      status: 'Confirmada',
      createdAt: new Date().toISOString()
    };
    db.appointments.unshift(newAppointment);
    writeDb(db);

    return {
      success: true,
      message: `Consulta legal registrada exitosamente para ${newAppointment.clientName} en ${newAppointment.serviceType}. Estado: Confirmada. ID: ${newAppointment.id}`,
      appointment: newAppointment
    };
  }

  return { success: false, message: "Herramienta desconocida" };
}

async function processMessage({ message, history = [], senderPhone = null, pushName = null }) {
  const textLower = message.toLowerCase();
  const condoName = "Drimin Services - Derecho Minero & Soluciones Industriales";
  const adminEmail = "felipe.herrera@driminservices.cl";
  const brandEmoji = "⛏️📜";

  const userMessagesText = history ? history.filter(h => h.role === 'user').map(h => h.content).join(' ') : '';
  const userCombinedText = `${userMessagesText} ${message}`;

  let residentPhone = senderPhone || '+56988776655';
  if (residentPhone && !residentPhone.startsWith('+') && /^\d+$/.test(residentPhone)) {
    residentPhone = '+' + residentPhone;
  }

  let clientName = null;
  const nameMatch = userCombinedText.match(/(?:mi nombre es|nombre es|soy|me llamo)\s+([A-Za-zÁéíóúñÁÉÍÓÚÑ]{2,}(?:\s+[A-Za-zÁéíóúñÁÉÍÓÚÑ]{2,})+)/i) ||
                    userCombinedText.match(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})\b/);

  if (nameMatch && nameMatch[1]) {
    let candidate = nameMatch[1].trim();
    // Truncar candidate en palabras clave de parada (de, empresa, asunto, para, el, la, quiero, bloque, depto)
    candidate = candidate.split(/\s+(?:de\s+empresa|de|empresa|asunto|para|quiero|el|la|bloque|depto|unidad)\b/i)[0].trim();
    const candWords = candidate.split(/\s+/);
    if (candWords.length > 3) candidate = candWords.slice(0, 3).join(' ');

    const candLower = candidate.toLowerCase();
    if (!candLower.includes('buenas tardes') && !candLower.includes('drimin') && !candLower.includes('administracion') && !candLower.includes('hola')) {
      clientName = candidate;
    }
  }

  if (!clientName && pushName && typeof pushName === 'string') {
    const pClean = pushName.trim();
    const pLower = pClean.toLowerCase();
    if (pClean && !pLower.includes('user') && !pLower.includes('whatsapp') && pClean.length >= 3) {
      clientName = pClean;
    }
  }

  let unitNumber = 'Empresa no especificada';
  const deptoMatch = userCombinedText.match(/(?:depto|departamento|dpto|unidad|empresa|faena|compañía|compania)\s*n?°?\s*([A-Za-z0-9\s.-]+?)(?=\s+y\s|\s+asunto|\s+para|\s+el\s|\s+a\s+las|\s+quiero|$|,|\.)/i) || 
                    userCombinedText.match(/(?:empresa|faena|compañía|compania)\s*([A-Za-z0-9\s.-]+)/i);
  if (deptoMatch && deptoMatch[1]) {
    unitNumber = deptoMatch[1].trim();
  }

  const businessDays = getNextBusinessDays(5);
  const day1Formatted = formatBusinessDate(businessDays[0]);
  const day2Formatted = formatBusinessDate(businessDays[1]);
  const day3Formatted = formatBusinessDate(businessDays[2]);

  let targetBusinessDate = businessDays[0];
  let targetFormatted = formatBusinessDate(targetBusinessDate);

  let matchedByDayName = false;
  for (const bDay of businessDays) {
    const dayNames = ["domingo", "lunes", "martes", "miércoles", "miercoles", "jueves", "viernes", "sábado"];
    const bDayName = dayNames[bDay.getDay()];
    if (textLower.includes(bDayName) || (bDayName === 'miércoles' && textLower.includes('miercoles'))) {
      targetBusinessDate = bDay;
      targetFormatted = formatBusinessDate(bDay);
      matchedByDayName = true;
      break;
    }
  }

  if (!matchedByDayName) {
    for (const bDay of businessDays) {
      const dayNumStr = String(bDay.getDate());
      const regexDayNum = new RegExp(`(?:el|día|dia|de|para)?\\s*\\b${dayNumStr}\\b`);
      if (regexDayNum.test(textLower)) {
        targetBusinessDate = bDay;
        targetFormatted = formatBusinessDate(bDay);
        break;
      }
    }
  }

  const availableSlots = getAvailableSlots(targetBusinessDate);

  const isCancelRequest = textLower.includes('cancelar') || textLower.includes('anular') || textLower.includes('no podre') || textLower.includes('no podré') || textLower.includes('eliminar cita');
  const isRescheduleRequest = textLower.includes('reprogramar') || textLower.includes('cambiar hora') || textLower.includes('cambiar fecha') || textLower.includes('modificar cita');

  // MÓDULO CANCELACIÓN
  if (isCancelRequest) {
    const db = readDb();
    const appointments = db.appointments || [];
    const activeAptIndex = appointments.findIndex(a => a.status !== 'Cancelada' && a.status !== 'Cancelada (Reprogramada)');

    if (activeAptIndex !== -1) {
      const aptToCancel = appointments[activeAptIndex];
      aptToCancel.status = 'Cancelada';
      aptToCancel.paymentStatus = 'Cancelada por el cliente';
      writeDb(db);

      const nameTag = clientName ? `@${clientName}` : (aptToCancel.clientName || 'Cliente');
      const responseText = `🚫 **CONSULTA MINERA CANCELADA CON ÉXITO** 📅\n\n` +
        `Estimado/a **${nameTag}**:\n` +
        `Tu consulta técnica agendada para el **${aptToCancel.dateTime}** ha sido **cancelada exitosamente** y el bloque de horario se ha **liberado** en el sistema.\n\n` +
        `Si en el futuro deseas agendar una nueva cita, estaremos gustosos de atenderte. ¡Que tengas un excelente día! ⛏️📜`;

      // Despacho nativo de correo Outlook Ferozo + n8n opcional
      dispatchDriminEvent({
        event: 'MEETING_CANCELED',
        emailSubject: 'cancelación de reunión',
        clientName: nameTag,
        appointmentId: aptToCancel.id,
        adminEmail
      });

      return { reply: responseText, toolExecuted: { name: 'cancelar_cita', result: { canceledId: aptToCancel.id } }, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting };
    } else {
      return { reply: `ℹ️ No encontramos una cita activa registrada a tu nombre para cancelar. Si deseas agendar una nueva reunión, con gusto te mostramos los horarios disponibles. ${brandEmoji}`, toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting };
    }
  }

  // MÓDULO REPROGRAMACIÓN
  if (isRescheduleRequest) {
    const db = readDb();
    const appointments = db.appointments || [];
    const activeApt = appointments.find(a => a.status !== 'Cancelada' && a.status !== 'Cancelada (Reprogramada)');

    if (activeApt) {
      activeApt.status = 'Cancelada (Reprogramada)';
      writeDb(db);
    }

    const refreshedSlots = getAvailableSlots(targetBusinessDate);
    const nameTag = clientName ? `@${clientName}` : 'Cliente';
    const morningList = refreshedSlots.filter(s => s.block === 'MAÑANA').map(s => `• **${s.id}**️⃣ ${s.label}`).join('\n');
    const afternoonList = refreshedSlots.filter(s => s.block === 'TARDE').map(s => `• **${s.id}**️⃣ ${s.label}`).join('\n');

    const responseText = `🔄 **REPROGRAMACIÓN DE CITA** 🗓️\n\n` +
      `Hola **${nameTag}**, con gusto te ayudamos a reprogramar tu cita. Tu horario anterior ha sido liberado.\n\n` +
      `A continuación te mostramos las opciones disponibles para los **próximos días hábiles**:\n\n` +
      `📅 **DÍAS HÁBILES DISPONIBLES**:\n` +
      `• 📆 **${day1Formatted}**\n` +
      `• 📆 **${day2Formatted}**\n` +
      `• 📆 **${day3Formatted}**\n\n` +
      `Bloques libres de 1 hora para el **${targetFormatted}**:\n\n` +
      (afternoonList ? `🕒 **HORARIOS DISPONIBLES (15:00 A 18:00 HRS)**:\n${afternoonList}\n\n` : '') +
      `Por favor indícanos el nuevo día y número de bloque u horario que prefieres.`;

    return { reply: responseText, toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting };
  }

  // ENRUTAMIENTO DIRECTO DEL MENÚ PRINCIPAL (1..5)
  const lastBotMsg = (history && history.length > 0) 
    ? history.filter(h => h.role === 'assistant').slice(-1)[0]?.content || ''
    : '';

  const wasShowingMainMenu = lastBotMsg.includes('Coordinación de consulta') ||
                             lastBotMsg.includes('Reporte de incidencia') || 
                             lastBotMsg.includes('Datos de transferencia') ||
                             lastBotMsg.includes('en qué te podemos ayudar hoy');

  const trimmedMsg = message.trim();
  const mainMenuDigitMatch = trimmedMsg.match(/^([1-5])$/);

  let optNum = (wasShowingMainMenu && mainMenuDigitMatch) ? parseInt(mainMenuDigitMatch[1], 10) : null;
  if (!optNum) {
    if (textLower.includes('agendar') || textLower.includes('reunion') || textLower.includes('reunión') || textLower.includes('cita') || textLower.includes('coordinar')) {
      optNum = 1;
    } else if (textLower.includes('datos bancarios') || textLower.includes('cuenta corriente') || textLower.includes('transferir') || textLower.includes('datos de transferencia')) {
      optNum = 5;
    }
  }

  if (optNum) {
    if (optNum === 1) {
      const afternoonList = availableSlots.filter(s => s.block === 'TARDE').map(s => `• **${s.id}**️⃣ ${s.label}`).join('\n');
      const nameTag = clientName ? `@${clientName}` : 'Cliente';

      const responseText = `¡Hola **${nameTag}**, qué gusto saludarte! ⚖️📜\n\n` +
        `Con mucho gusto coordinamos tu consulta jurídica con el **Abogado Felipe Herrera**.\n\n` +
        `Para agendar tu bloque de 1 hora y sincronizar la reunión directamente en el **Calendario Oficial de Outlook**, por favor indícanos:\n\n` +
        `• 1️⃣ Tu **nombre y apellido**\n` +
        `• 2️⃣ Tu **empresa o faena** (si aplica)\n` +
        `• 3️⃣ Un breve **asunto o motivo de la consulta** (ej: concesión minera, contratos, terrenos)\n\n` +
        `📅 **PRÓXIMOS DÍAS HÁBILES DISPONIBLES**:\n` +
        `• 📆 **${day1Formatted}**\n` +
        `• 📆 **${day2Formatted}**\n` +
        `• 📆 **${day3Formatted}**\n\n` +
        (afternoonList ? `🕒 **HORARIOS DE ATENCIÓN DE 1 HORA (${targetFormatted})**:\n${afternoonList}\n\n` : '') +
        `Por favor indícanos el bloque que te acomoda y tus datos para dejarla reservada de inmediato.`;

      return { reply: responseText, toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting };
    } else if (optNum === 4) {
      const { processIncidentFlow } = require('./incidentEngine');
      const incResult = await processIncidentFlow({
        message,
        history,
        clientName: clientName || null,
        unitNumber: unitNumber || 'Empresa no especificada',
        condoName,
        adminEmail,
        industryMode: 'drimin'
      });
      return {
        reply: incResult.reply,
        toolExecuted: incResult.incident ? { name: 'reportar_incidencia', result: incResult.incident } : null,
        voucher: null,
        industry: 'drimin',
        greeting: DRIMIN_CONFIG.greeting
      };
    } else if (optNum === 5) {
      const bankInfo = getCompanyPaymentDetails('drimin');
      const nameTag = clientName ? `@${clientName}` : 'Cliente';
      const unitTag = (unitNumber && unitNumber !== 'Empresa no especificada') ? ` (Empresa ${unitNumber})` : '';

      const responseText = `🏦 **DATOS DE TRANSFERENCIA BANCARIA** 💳✨\n\n` +
        `Estimado/a **${nameTag}**${unitTag}:\n` +
        `A continuación te compartimos los datos bancarios oficiales para el pago de honorarios y servicios de **${condoName}**:\n\n` +
        `• 🏢 **Razón Social / Titular**: *${bankInfo.holderName}*\n` +
        `• 🆔 **RUT**: *${bankInfo.rut}*\n` +
        `• 🏦 **Banco**: *${bankInfo.bankName}*\n` +
        `• 📋 **Tipo de Cuenta**: *${bankInfo.accountType}*\n` +
        `• 🔢 **Número de Cuenta**: *${bankInfo.accountNumber}*\n` +
        `• 📩 **Correo para Comprobantes**: \`${bankInfo.emailNotification}\`\n\n` +
        `📌 **Instrucciones**: ${bankInfo.instructions} ⛏️📜`;

      return { reply: responseText, toolExecuted: { name: 'mostrar_datos_transferencia', result: bankInfo }, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting };
    }
  }

  // DETECCIÓN DE BLOQUE DE HORARIO
  const lastBotMsgJson = (history && history.length > 0) ? JSON.stringify(history[history.length - 1]).toLowerCase() : "";
  const wasAwaitingSlot = lastBotMsgJson.includes('bloques') || lastBotMsgJson.includes('horarios') || lastBotMsgJson.includes('días hábiles') || lastBotMsgJson.includes('número de bloque');

  let matchedSlot = null;

  if (wasAwaitingSlot) {
    const digitMatch = trimmedMsg.match(/\b([1-3])\b/i);
    if (digitMatch && digitMatch[1]) {
      const slotId = parseInt(digitMatch[1], 10);
      matchedSlot = MEETING_SLOTS.find(s => s.id === slotId);
    }

    if (!matchedSlot) {
      if (textLower.includes('15:00') || textLower.includes('3 pm') || textLower.includes('a las 3') || textLower.includes('a las 15') || textLower.includes('15 a 16') || textLower.includes('3 a 4')) matchedSlot = MEETING_SLOTS[0];
      else if (textLower.includes('16:00') || textLower.includes('4 pm') || textLower.includes('a las 4') || textLower.includes('a las 16') || textLower.includes('16 a 17') || textLower.includes('4 a 5')) matchedSlot = MEETING_SLOTS[1];
      else if (textLower.includes('17:00') || textLower.includes('5 pm') || textLower.includes('a las 5') || textLower.includes('a las 17') || textLower.includes('17 a 18') || textLower.includes('5 a 6')) matchedSlot = MEETING_SLOTS[2];
    }
  }

  if (!matchedSlot && (lastBotMsgJson.includes('datos requeridos para completar') || lastBotMsgJson.includes('datos requeridos para confirmar'))) {
    for (const s of MEETING_SLOTS) {
      if (lastBotMsgJson.includes(s.label.toLowerCase()) || lastBotMsgJson.includes(s.timeStr.toLowerCase())) {
        matchedSlot = s;
        break;
      }
    }
  }

  // FLUJO DE INCIDENCIAS LEGALES (SOLO SI NO SE ESTABA ESPERANDO SLOT NI SE TIENE INTENCIÓN DE REUNIÓN)
  const hasMeetingIntent = textLower.includes('reunion') || textLower.includes('reunión') || textLower.includes('agendar') || textLower.includes('coordinar') || textLower.includes('cita') || textLower.includes('bloque');
  const isAwaitingIncident = lastBotMsg.includes('área o tipo de consulta legal') || lastBotMsg.includes('reporte de incidencia') || lastBotMsg.includes('requerimiento jurídico');
  const isIncidentKeyword = textLower.includes('fiscalización') || textLower.includes('sumario') || textLower.includes('multa') || textLower.includes('incidencia');

  if (!wasAwaitingSlot && !hasMeetingIntent && (isIncidentKeyword || isAwaitingIncident)) {
    const { processIncidentFlow } = require('./incidentEngine');
    const incResult = await processIncidentFlow({
      message,
      history,
      clientName: clientName || null,
      unitNumber: unitNumber || 'Empresa no especificada',
      condoName,
      adminEmail,
      industryMode: 'drimin'
    });
    if (!incResult.cancelFlow) {
      return {
        reply: incResult.reply,
        toolExecuted: incResult.incident ? { name: 'reportar_incidencia', result: incResult.incident } : null,
        voucher: null,
        industry: 'drimin',
        greeting: DRIMIN_CONFIG.greeting
      };
    }
  }

  if (matchedSlot) {
    const isSlotAvailable = availableSlots.some(s => s.id === matchedSlot.id);

    if (!isSlotAvailable) {
      const nameTag = clientName ? `@${clientName}` : 'Cliente';
      const morningList = availableSlots.filter(s => s.block === 'MAÑANA').map(s => `• ${s.id}️⃣ **${s.label}**`).join('\n');
      const afternoonList = availableSlots.filter(s => s.block === 'TARDE').map(s => `• ${s.id}️⃣ **${s.label}**`).join('\n');

      const responseText = `⚠️ **${nameTag}**, el horario de las **${matchedSlot.label}** para el **${targetFormatted}** ya se encuentra **reservado**.\n\n` +
        `Para evitar choques de horario, te mostramos los bloques que aún están **disponibles para el ${targetFormatted}**:\n\n` +
        (afternoonList ? `🕒 **HORARIOS DISPONIBLES (15:00 A 18:00 HRS)**:\n${afternoonList}\n\n` : '') +
        `Por favor indícanos otro número de bloque u horario disponible.`;
      return { reply: responseText, toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting };
    } else {
      let finalName = clientName;
      let meetingReason = null;

      let cleanTextForReason = userCombinedText
        .replace(/empresa\s*n?°?\s*[A-Za-z0-9\s.-]+/gi, '')
        .replace(/asunto\s*de\s*reunion,?/gi, '')
        .replace(/asunto:?/gi, '')
        .replace(/motivo:?/gi, '')
        .replace(/consulta\s*por,?/gi, '');

      const reasonMatch = cleanTextForReason.match(/(?:motivo|asunto|por|sobre|dudas en|duda en|consulta por|consulta sobre|asunto:)\s*[:=]?\s*([^.,\n]+)/i);
      if (reasonMatch && reasonMatch[1] && reasonMatch[1].trim().length > 2) {
        meetingReason = reasonMatch[1].trim();
      }

      if (!meetingReason && message && message.trim().length > 3) {
        let candidate = message.trim().replace(/asunto:?/gi, '').replace(/motivo:?/gi, '').trim();
        if (candidate.length > 2) meetingReason = candidate;
      }

      if (!finalName || unitNumber === 'Empresa no especificada' || !meetingReason) {
        const missingFields = [];
        if (!finalName) missingFields.push('1️⃣ **Nombre y Apellido completo**');
        if (unitNumber === 'Empresa no especificada') missingFields.push('2️⃣ **Empresa / Faena / Unidad Minera** (ej: Minera San José / Santiago)');
        if (!meetingReason) missingFields.push('3️⃣ **Asunto o Motivo de la consulta minera** (ej: revisión de concesión)');

        const responseText = `📌 **DATOS REQUERIDOS PARA COMPLETAR TU REUNIÓN** 📝\n\n` +
          `Has seleccionado el horario de las **${matchedSlot.label}** para el **${targetFormatted}**.\n\n` +
          `Para registrar la cita en **Google Calendar** y notificar por correo electrónico (\`${adminEmail}\`), por favor indícanos en tu respuesta:\n\n` +
          missingFields.join('\n') + `\n\n` +
          `*(En cuanto nos indiques esta información, tu reunión quedará reservada de inmediato y emitiremos tu pase digital QR).* ${brandEmoji}`;

        return { reply: responseText, toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting };
      }

      const calendarSummary = `Consulta Minera: ${finalName} - Empresa: ${unitNumber} - Asunto: ${meetingReason}`;

      const year = targetBusinessDate.getFullYear();
      const month = String(targetBusinessDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetBusinessDate.getDate()).padStart(2, '0');
      const hStr = String(matchedSlot.hour).padStart(2, '0');
      const mStr = String(matchedSlot.minute).padStart(2, '0');

      const startIso = `${year}-${month}-${day}T${hStr}:${mStr}:00-03:00`;
      const endHour = matchedSlot.hour + 1; // Duración oficial de 1 hora
      const endMinute = matchedSlot.minute;
      const endHStr = String(endHour).padStart(2, '0');
      const endMStr = String(endMinute).padStart(2, '0');
      const endIso = `${year}-${month}-${day}T${endHStr}:${endMStr}:00-03:00`;

      const aptResult = await executeTool('agendar_cita', {
        clientName: finalName,
        clientPhone: residentPhone,
        unitNumber: unitNumber,
        asunto: meetingReason,
        summary: calendarSummary,
        title: calendarSummary,
        serviceType: calendarSummary,
        dateTime: `${targetFormatted} de ${year} (${matchedSlot.label})`,
        slotId: matchedSlot.id,
        startIso,
        endIso
      });

      const voucher = await createVoucher({
        clientName: `${finalName} (Empresa: ${unitNumber})`,
        clientPhone: residentPhone,
        industry: 'drimin',
        voucherType: `Pase Digital de Consulta Minera (${condoName})`,
        discountOrAmount: `${calendarSummary} | ${targetFormatted} ${matchedSlot.label} | Gratuita ($0)`,
        propertyAddress: condoName
      });

      // Despacho nativo de correo con archivo .ics para Outlook + n8n opcional
      dispatchDriminEvent({
        event: 'MEETING_BOOKED',
        emailSubject: `coordinación de reunión - ${calendarSummary}`,
        clientName: finalName,
        unitNumber: unitNumber,
        meetingReason: meetingReason,
        dateTime: `${targetFormatted} (${matchedSlot.label})`,
        startIso,
        endIso,
        summary: calendarSummary,
        adminEmail,
        qrCodeUrl: voucher.qrCodeDataUrl,
        voucherCode: voucher.code
      });

      const responseText = `✅ **CONSULTA JURÍDICA AGENDADA CON ÉXITO** 📅\n\n` +
        `Estimado/a **@${finalName}** (Empresa **${unitNumber}**):\n\n` +
        `Tu cita ha sido agendada y registrada en el **Calendario Oficial de Drimin Services (Outlook)** para el **${targetFormatted}** en el bloque de **${matchedSlot.label}**.\n\n` +
        `• 📋 **Asunto de la consulta**: *${meetingReason}*\n` +
        `• 🏢 **Atención**: Drimin Services SpA (Abg. Felipe Herrera)\n` +
        `• 🎟️ **Código de Pase QR**: \`${voucher.code}\`\n\n` +
        `A continuación te enviamos tu **Pase Digital QR** oficial para el ingreso a la reunión. ¡Te esperamos puntualmente! ⛏️📜`;

      return {
        reply: responseText,
        toolExecuted: { name: 'agendar_cita', result: aptResult.appointment },
        voucher,
        industry: 'drimin',
        greeting: DRIMIN_CONFIG.greeting
      };
    }
  }

  // RESPUESTA INTELIGENTE Y HUMANIZADA CON GEMINI
  const geminiReply = await generateGeminiReply({
    message,
    history,
    senderPhone: residentPhone,
    pushName: clientName || pushName,
    availableSlots
  });

  if (geminiReply) {
    return {
      reply: geminiReply,
      toolExecuted: null,
      voucher: null,
      industry: 'drimin',
      greeting: DRIMIN_CONFIG.greeting
    };
  }

  // FALLBACK AL SALUDO INICIAL Y EL MENÚ OFICIAL
  const nameTag = clientName ? `@${clientName}` : 'Cliente';
  const defaultReply = `¡Hola **${nameTag}**! Un gusto saludarte ⚖️📜 Te escribe el asistente virtual del **Abogado Felipe Herrera** en **Drimin Services SpA**.\n\n` +
    `¿En qué te podemos colaborar el día de hoy?\n\n` +
    `• 1️⃣ **Coordinar una consulta jurídica** (Derecho Minero, Energía, Terrenos Fiscales, Empresas o Litigios)\n` +
    `• 2️⃣ **Cancelar una cita previa**\n` +
    `• 3️⃣ **Reprogramar una reunión**\n` +
    `• 4️⃣ **Reportar un requerimiento legal o fiscalización urgente**\n` +
    `• 5️⃣ **Consultar datos bancarios oficiales**\n\n` +
    `*(O si prefieres, cuéntame directamente qué necesitas y con gusto te oriento).*`;

  return {
    reply: defaultReply,
    toolExecuted: null,
    voucher: null,
    industry: 'drimin',
    greeting: DRIMIN_CONFIG.greeting
  };
}

module.exports = {
  processMessage,
  executeTool,
  DRIMIN_CONFIG
};
