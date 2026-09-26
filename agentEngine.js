const { readDb, writeDb, getCompanyPaymentDetails, getConversationState, saveConversationState } = require('./db');
const { createVoucher } = require('./voucherService');
const { dispatchDriminEvent } = require('./emailService');
const { generateGeminiReply } = require('./geminiService');
const { fetchGoogleCalendarBusySlots } = require('./googleCalendarService');

const DRIMIN_CONFIG = {
  name: "Drimin Services - Soluciones Jurídicas & Técnicas para la Minería",
  companyEmail: "felipe.herrera@driminservices.cl",
  phone: "+56 9 8877 6655",
  region: "Región de Antofagasta y Norte de Chile",
  role: "Asesor Virtual Drimin Services",
  greeting: `¡Hola! 👋 Bienvenido a Drimin Services.\n` +
    `Soy el asesor virtual de nuestro equipo y será un gusto orientarte.\n\n` +
    `En nuestro estudio ofrecemos soluciones jurídicas y técnicas integrales para toda la industria minera del norte de Chile. Acompañamos tanto a emprendedores individuales y pequeña minería, como a empresas de mediana y gran minería.\n\n` +
    `Integramos derecho minero, compliance normativo y experiencia técnica multidisciplinaria para respaldar tus proyectos, anticipar riesgos y evitar eventuales irregularidades que pudieran derivar en sanciones o paralizaciones. 🏔️⚖️\n\n` +
    `Para poder saludarte como corresponde, ¿me podrías indicar tu nombre y el nombre de tu empresa o faena, si corresponde?`
};

const SERVICES_MENU = `¡Por supuesto! 😊 No te preocupes, estoy aquí para ayudarte a encontrar la asesoría que necesitas.
En Drimin Services contamos con distintas áreas de especialización. Te comparto nuestros principales servicios para que puedas explorar el que más se acerque a tu situación:

1. Derecho minero
Concesiones mineras, permisos, contratos y asesoría legal para proyectos de exploración y explotación.

2. Compliance y cumplimiento normativo
Prevención de delitos corporativos, gestión de riesgos legales y programas de cumplimiento.

3. Ingeniería y asesoría eléctrica SEC
Apoyo técnico especializado en instalaciones eléctricas, seguridad y exigencias regulatorias.

4. Prevención de riesgos
Seguridad y salud ocupacional, asesoría preventiva y cumplimiento de exigencias laborales.

5. Geología y proyectos mineros
Apoyo geológico y orientación técnica durante las distintas etapas de los proyectos.

6. Gestión ambiental y sostenibilidad
Orientación en exigencias ambientales, criterios ESG y gestión de riesgos socioambientales.

7. Agendar una reunión
Coordinar una reunión con el equipo de Drimin Services para conversar sobre tu proyecto.

8. No sé qué servicio necesito
Cuéntanos brevemente tu situación y te ayudaremos a identificar el área adecuada.`;

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

async function getAvailableSlots(targetDate) {
  const db = readDb();
  const appointments = db.appointments || [];

  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1;
  const day = targetDate.getDate();

  const padMonth = String(month).padStart(2, '0');
  const padDay = String(day).padStart(2, '0');
  const dateIsoPrefix = `${year}-${padMonth}-${padDay}`;

  const bookedSlotIds = new Set();

  // 1. Ocupados en base de datos local
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

  // 2. Ocupados en Google Calendar conectado si existe
  try {
    const calendarBusy = await fetchGoogleCalendarBusySlots(targetDate);
    if (Array.isArray(calendarBusy)) {
      calendarBusy.forEach(id => bookedSlotIds.add(id));
    }
  } catch (cErr) {}

  return MEETING_SLOTS.filter(slot => !bookedSlotIds.has(slot.id));
}

// Extracción inteligente de entidades
function extractEntities(text) {
  const result = {};

  // Email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/);
  if (emailMatch) {
    result.email = emailMatch[0].trim();
  }

  // Nombre
  const namePatterns = [
    /(?:mi nombre es|me llamo|soy|atentamente|habla)\s+([A-Za-zÁéíóúñÁÉÍÓÚÑ]{2,}(?:\s+[A-Za-zÁéíóúñÁÉÍÓÚÑ]{2,})+)/i,
    /(?:nombre:)\s*([A-Za-zÁéíóúñÁÉÍÓÚÑ]{2,}(?:\s+[A-Za-zÁéíóúñÁÉÍÓÚÑ]{2,})+)/i
  ];
  for (const pat of namePatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      let cand = m[1].trim().split(/\s+(?:de\s+la|de|empresa|minera|y|para|en|asunto)\b/i)[0].trim();
      const lower = cand.toLowerCase();
      if (!lower.includes('hola') && !lower.includes('buenas') && !lower.includes('drimin') && !lower.includes('asesor')) {
        result.name = cand;
        break;
      }
    }
  }

  // Empresa
  const companyPatterns = [
    /(?:empresa|minera|compañía|compania|faena|de la empresa)\s*[:=]?\s*([A-Za-z0-9ÁéíóúñÁÉÍÓÚÑ\s.-]+?)(?=\s+y\s|\s+para|\s+en\s|\s+con\s|\s+asunto|$|,|\.)/i,
    /(?:de\s+)(Minera\s+[A-Za-z0-9ÁéíóúñÁÉÍÓÚÑ]+)/i
  ];
  for (const pat of companyPatterns) {
    const m = text.match(pat);
    if (m && m[1] && m[1].trim().length > 2) {
      result.company = m[1].trim();
      break;
    }
  }

  // Ubicación (Antofagasta / otra zona)
  if (/antofagasta|calama|mejillones|tocopilla|san pedro/i.test(text)) {
    result.location = "Región de Antofagasta";
  } else if (/tarapacá|tarapaca|iquique|atacama|copiapó|copiapo|coquimbo|la serena|santiago|otra zona/i.test(text)) {
    const locMatch = text.match(/(?:en\s+|de\s+)([A-Za-zÁéíóúñÁÉÍÓÚÑ\s]+)/i);
    result.location = locMatch ? locMatch[1].trim() : "Otra zona del país";
  }

  // Urgencia
  if (/urgente|urgencia|inmediato|cuanto antes|fiscalización|fiscalizacion|multa|plazo/i.test(text)) {
    result.urgency = "Urgente";
  } else if (/planificando|planificación|planificacion|mediano plazo|futuro|evaluando/i.test(text)) {
    result.urgency = "Planificación";
  }

  return result;
}

async function processMessage({ message, history = [], senderPhone = null, pushName = null }) {
  const textRaw = (message || '').trim();
  const textLower = textRaw.toLowerCase();
  const phone = senderPhone || '+56988776655';

  // 1. MANEJO DE OPT-OUT (Baja de mensajes WhatsApp)
  const isOptOut = /^(?:no me escriban|stop|baja|cancelar suscripcion|cancelar suscripción|no enviar mas mensajes|no quiero recibir mensajes)$/i.test(textLower);
  if (isOptOut) {
    saveConversationState(phone, { optOut: true, lastBotMessageAt: new Date().toISOString() });
    return {
      reply: `Entendido. Hemos registrado tu preferencia y no te enviaremos recordatorios ni mensajes automáticos por este canal. Si en el futuro necesitas asesoría de Drimin Services, siempre serás bienvenido. ¡Que tengas un excelente día! 👋`,
      toolExecuted: null,
      voucher: null,
      industry: 'drimin',
      greeting: DRIMIN_CONFIG.greeting
    };
  }

  // 2. RECUPERAR ESTADO PREVIO DE LA CONVERSACIÓN
  let state = getConversationState(phone) || {
    step: null,
    clientName: null,
    company: null,
    reason: null,
    urgency: null,
    location: null,
    clientEmail: null,
    followUpSent: false,
    optOut: false
  };

  // Extraer entidades que el usuario pueda haber enviado en este mensaje
  const extracted = extractEntities(textRaw);
  if (extracted.name && !state.clientName) state.clientName = extracted.name;
  if (extracted.company && !state.company) state.company = extracted.company;
  if (extracted.email && !state.clientEmail) state.clientEmail = extracted.email;
  if (extracted.location && !state.location) state.location = extracted.location;
  if (extracted.urgency && !state.urgency) state.urgency = extracted.urgency;

  if (!state.clientName && pushName && typeof pushName === 'string') {
    const pClean = pushName.trim();
    if (pClean && !pClean.toLowerCase().includes('user') && !pClean.toLowerCase().includes('whatsapp') && pClean.length >= 3) {
      state.clientName = pClean;
    }
  }

  // 3. DETECTAR CANCELACIÓN DE REUNIÓN
  const isCancelRequest = textLower.includes('cancelar') && (textLower.includes('cita') || textLower.includes('reunión') || textLower.includes('reunion') || textLower.includes('hora'));
  if (isCancelRequest) {
    const db = readDb();
    const appointments = db.appointments || [];
    const activeIndex = appointments.findIndex(a => 
      (a.clientPhone === phone || a.clientPhone === `+${phone}` || (state.clientName && a.clientName?.toLowerCase().includes(state.clientName.toLowerCase()))) &&
      a.status !== 'Cancelada' && a.status !== 'Cancelada (Reprogramada)'
    );

    if (activeIndex !== -1) {
      const apt = appointments[activeIndex];
      apt.status = 'Cancelada';
      apt.paymentStatus = 'Cancelada por el cliente';
      writeDb(db);

      dispatchDriminEvent({
        event: 'MEETING_CANCELED',
        clientName: apt.clientName,
        appointmentId: apt.id,
        adminEmail: DRIMIN_CONFIG.companyEmail
      });

      state.step = null;
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });

      return {
        reply: `🚫 Tu reunión agendada para el **${apt.dateTime}** ha sido cancelada exitosamente y el bloque de horario ha quedado liberado.\n\nSi necesitas coordinar un nuevo espacio en el futuro, no dudes en escribirnos. ¡Que tengas un excelente día! 👋`,
        toolExecuted: { name: 'cancelar_cita', result: { canceledId: apt.id } },
        voucher: null,
        industry: 'drimin',
        greeting: DRIMIN_CONFIG.greeting
      };
    } else {
      return {
        reply: `No encontré una reunión activa registrada a tu nombre para cancelar. Si deseas coordinar una nueva cita con nuestro equipo, con gusto te ayudo a agendarla. 😊`,
        toolExecuted: null,
        voucher: null,
        industry: 'drimin',
        greeting: DRIMIN_CONFIG.greeting
      };
    }
  }

  // 4. DETECTAR REPROGRAMACIÓN
  const isRescheduleRequest = textLower.includes('reprogramar') || textLower.includes('cambiar fecha') || textLower.includes('cambiar hora') || textLower.includes('modificar cita');
  if (isRescheduleRequest) {
    const db = readDb();
    const appointments = db.appointments || [];
    const active = appointments.find(a => 
      (a.clientPhone === phone || a.clientPhone === `+${phone}`) &&
      a.status !== 'Cancelada' && a.status !== 'Cancelada (Reprogramada)'
    );
    if (active) {
      active.status = 'Cancelada (Reprogramada)';
      writeDb(db);
    }
    state.step = 'offering_meeting';
  }

  // 5. DETECCIÓN DE DATOS BANCARIOS OFICIALES
  if (textLower.includes('datos bancarios') || textLower.includes('cuenta corriente') || textLower.includes('transferencia')) {
    const bankInfo = getCompanyPaymentDetails('drimin');
    const replyText = `🏦 **Datos Bancarios Oficiales - Drimin Services SpA**\n\n` +
      `• Titular: *${bankInfo.holderName}*\n` +
      `• RUT: *${bankInfo.rut}*\n` +
      `• Banco: *${bankInfo.bankName}*\n` +
      `• Tipo de Cuenta: *${bankInfo.accountType}*\n` +
      `• N° de Cuenta: *${bankInfo.accountNumber}*\n` +
      `• Correo de Comprobantes: \`${bankInfo.emailNotification}\`\n\n` +
      `📌 *${bankInfo.instructions}*`;

    saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
    return { reply: replyText, toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting };
  }

  // 6. DETECCIÓN DE MENSAJE INICIAL / SALUDO PURAMENTE INICIAL
  const isGreeting = /^(?:hola|buenos dias|buenos días|buenas tardes|buenas noches|buenas|hola drimin|hola asesor|iniciar|comenzar|menu|menú)$/i.test(textLower);
  const isFirstMessage = !history || history.length === 0 || (!state.step && isGreeting);

  if (isFirstMessage && isGreeting) {
    state.step = 'identifying_client';
    saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
    return {
      reply: DRIMIN_CONFIG.greeting,
      toolExecuted: null,
      voucher: null,
      industry: 'drimin',
      greeting: DRIMIN_CONFIG.greeting
    };
  }

  // 7. SI EL CLIENTE NO SABE QUÉ NECESITA O PIDE CONOCER SERVICIOS
  const isUnsureOrWantsServices = 
    textLower.includes('no estoy seguro') ||
    textLower.includes('no estoy segura') ||
    textLower.includes('quiero conocer sus servicios') ||
    textLower.includes('necesito asesoría, pero no sé por dónde empezar') ||
    textLower.includes('necesito asesoria, pero no se por donde empezar') ||
    textLower.includes('no sé por dónde empezar') ||
    textLower.includes('no se por donde empezar') ||
    textLower.includes('conocer sus servicios') ||
    textLower.includes('cuales son sus servicios') ||
    textLower.includes('cuáles son sus servicios') ||
    textLower.includes('que servicios ofrecen') ||
    textLower.includes('qué servicios ofrecen') ||
    textLower.includes('qué hacen') ||
    textLower.includes('que hacen') ||
    textLower.includes('ver servicios') ||
    textLower.includes('mostrar servicios') ||
    textLower.includes('no tengo claro') ||
    (state.step === 'initial' && (textLower === 'no sé' || textLower === 'no se' || textLower.includes('dudas')));

  if (isUnsureOrWantsServices) {
    state.step = 'menu_presented';
    saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
    return {
      reply: SERVICES_MENU,
      toolExecuted: null,
      voucher: null,
      industry: 'drimin',
      greeting: DRIMIN_CONFIG.greeting
    };
  }

  // 8. SI EL CLIENTE YA ESTÁ EN UN PASO ACTIVO DE CAPTACIÓN / AGENDAMIENTO, PROCESARLO PRIMERO
  if (state.step && state.step !== 'initial' && state.step !== 'completed') {
    // Paso 1: Identificar al cliente (Nombre y Empresa)
    if (state.step === 'identifying_client') {
      if (!state.clientName && extracted.name) state.clientName = extracted.name;
      if (!state.company && extracted.company) state.company = extracted.company;

      if (!state.clientName) {
        let cand = textRaw.split(/\s+(?:de|empresa|minera)\b/i)[0].trim();
        const candWords = cand.split(/\s+/);
        if (candWords.length <= 4 && cand.length >= 3) {
          state.clientName = cand;
        } else {
          state.clientName = textRaw;
        }
      }

      if (!state.reason) {
        state.step = 'asking_reason';
        saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
        const displayName = state.clientName || 'amigo/a';
        return {
          reply: `Gracias, ${displayName}. ¿Podrías contarme brevemente sobre tu proyecto o la situación en la que necesitas apoyo?`,
          toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
        };
      } else {
        state.step = 'asking_urgency_location';
        saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
        return {
          reply: `Gracias, ${state.clientName}. ¿Tu proyecto se encuentra en la Región de Antofagasta o en otra zona del país? ¿Se trata de una consulta urgente o de algo que estás planificando?`,
          toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
        };
      }
    }

    // Paso 2: Conocer el motivo de la consulta
    if (state.step === 'asking_reason') {
      state.reason = textRaw;
      state.step = 'asking_urgency_location';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `¿Tu proyecto se encuentra en la Región de Antofagasta o en otra zona del país? ¿Se trata de una consulta urgente o de algo que estás planificando?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    }

    // Paso 3: Identificar urgencia y ubicación
    if (state.step === 'asking_urgency_location') {
      if (!state.location) state.location = extracted.location || textRaw;
      if (!state.urgency) state.urgency = extracted.urgency || "Planificación";

      state.step = 'offering_meeting';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `Creo que lo más conveniente es que podamos conversar con mayor detalle. ¿Te gustaría coordinar una reunión con nuestro equipo?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    }

    // Paso 4: Ofrecer una reunión (Confirmación de interés)
    const isAffirmative = /^(?:si|sí|claro|por supuesto|me gustaria|me gustaría|perfecto|ok|dale|coordinemos|agendemos|bueno|de acuerdo|yes)$/i.test(textLower) ||
      textLower.includes('me gustaría') || textLower.includes('me gustaria') || textLower.includes('quiero coordinar') || textLower.includes('coordinar');

    if (state.step === 'offering_meeting' || (isAffirmative && (state.step === 'asking_urgency_location' || state.step === 'menu_presented'))) {
      const businessDays = getNextBusinessDays(3);
      const dayOptions = [];

      for (const bDay of businessDays) {
        const slots = await getAvailableSlots(bDay);
        if (slots.length > 0) {
          const slotsStr = slots.map(s => `${s.timeStr} hrs`).join(', ');
          dayOptions.push(`• 📆 **${formatBusinessDate(bDay)}**: ${slotsStr}`);
        }
      }

      state.step = 'selecting_slot_email';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });

      const scheduleList = dayOptions.length > 0 
        ? dayOptions.join('\n') 
        : '• Bloques habituales: Lunes a viernes de 15:00 a 18:00 hrs';

      return {
        reply: `¡Excelente! Las reuniones disponibles para agendar son todos los días de la semana, de **lunes a viernes de 15:00 a 18:00 horas** (cada bloque de 1 hora).\n\n` +
          `Para los próximos días hábiles contamos con las siguientes alternativas:\n` +
          `${scheduleList}\n\n` +
          `¿Qué día y horario te acomoda mejor? Y por favor, indícame tu **correo electrónico** para enviarte la invitación.`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    }
  }

  // 9. MANEJO DE SELECCIÓN DEL MENÚ (POR NÚMERO 1..8 O POR NOMBRE DE SERVICIO)
  const menuMatch = textRaw.match(/^([1-8])(?:\.|\b|$)/);
  let selectedOption = menuMatch ? parseInt(menuMatch[1], 10) : null;

  if (!selectedOption) {
    if (textLower.includes('agendar') || textLower.includes('reunion') || textLower.includes('reunión') || textLower.includes('coordinar cita')) {
      selectedOption = 7;
    } else if (textLower.includes('derecho minero') || textLower.includes('concesion') || textLower.includes('concesión')) {
      selectedOption = 1;
    } else if (textLower.includes('compliance') || textLower.includes('delitos corporativos')) {
      selectedOption = 2;
    } else if (textLower.includes('eléctric') || textLower.includes('sec')) {
      selectedOption = 3;
    } else if (textLower.includes('prevención de riesgos') || textLower.includes('prevencion de riesgos') || textLower.includes('salud ocupacional')) {
      selectedOption = 4;
    } else if (textLower.includes('geología') || textLower.includes('geologia') || textLower.includes('proyectos mineros')) {
      selectedOption = 5;
    } else if (textLower.includes('gestión ambiental') || textLower.includes('gestion ambiental') || textLower.includes('sostenibilidad') || textLower.includes('esg')) {
      selectedOption = 6;
    } else if (textLower.includes('no sé qué servicio') || textLower.includes('no se que servicio')) {
      selectedOption = 8;
    }
  }

  if (selectedOption) {
    if (selectedOption === 1) {
      state.reason = "Derecho minero (concesiones, permisos o contratos)";
      state.step = 'identifying_client';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `En Drimin Services contamos con sólida trayectoria en **Derecho minero**: concesiones mineras, permisos, contratos y asesoría legal estratégica para proyectos de exploración y explotación en el norte de Chile.\n\n` +
          `¡Encantado! ¿Me podrías indicar tu nombre y el nombre de tu empresa, si corresponde?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    } else if (selectedOption === 2) {
      state.reason = "Compliance y cumplimiento normativo minero";
      state.step = 'identifying_client';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `En **Compliance y cumplimiento normativo** apoyamos a empresas en prevención de delitos corporativos (Ley 20.393/21.595), gestión de riesgos legales y diseño de programas de cumplimiento normativo.\n\n` +
          `¡Encantado! ¿Me podrías indicar tu nombre y el nombre de tu empresa, si corresponde?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    } else if (selectedOption === 3) {
      state.reason = "Ingeniería y asesoría eléctrica SEC";
      state.step = 'identifying_client';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `En **Ingeniería y asesoría eléctrica SEC** entregamos apoyo técnico especializado en instalaciones eléctricas mineras, seguridad de infraestructura y cumplimiento de exigencias regulatorias ante la SEC.\n\n` +
          `¡Encantado! ¿Me podrías indicar tu nombre y el nombre de tu empresa, si corresponde?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    } else if (selectedOption === 4) {
      state.reason = "Prevención de riesgos y seguridad laboral";
      state.step = 'identifying_client';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `En **Prevención de riesgos** acompañamos a faenas en seguridad y salud ocupacional, asesoría preventiva, auditorías y cumplimiento de exigencias del Sernageomin y normativa laboral.\n\n` +
          `¡Encantado! ¿Me podrías indicar tu nombre y el nombre de tu empresa, si corresponde?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    } else if (selectedOption === 5) {
      state.reason = "Geología y proyectos mineros";
      state.step = 'identifying_client';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `En **Geología y proyectos mineros** brindamos apoyo geológico especializado y orientación técnica multidisciplinaria durante las distintas etapas de exploración y desarrollo de faenas.\n\n` +
          `¡Encantado! ¿Me podrías indicar tu nombre y el nombre de tu empresa, si corresponde?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    } else if (selectedOption === 6) {
      state.reason = "Gestión ambiental y sostenibilidad";
      state.step = 'identifying_client';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `En **Gestión ambiental y sostenibilidad** orientamos en exigencias ambientales del SEIA y SMA, criterios ESG y gestión de riesgos socioambientales en el norte del país.\n\n` +
          `¡Encantado! ¿Me podrías indicar tu nombre y el nombre de tu empresa, si corresponde?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    } else if (selectedOption === 7) {
      state.step = 'identifying_client';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `¡Por supuesto! Será un gusto coordinar una reunión con nuestro equipo profesional para conversar sobre tu proyecto.\n\n` +
          `¡Encantado! ¿Me podrías indicar tu nombre y el nombre de tu empresa, si corresponde?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    } else if (selectedOption === 8) {
      state.step = 'asking_reason';
      saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
      return {
        reply: `No te preocupes, estamos aquí para orientarte. 😊\n\nCuéntanos brevemente tu situación o qué desafío estás enfrentando, y te ayudaremos a identificar el área adecuada.`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    }
  }



  // Paso 5: Confirmar disponibilidad y registrar reunión
  if (state.step === 'selecting_slot_email') {
    const businessDays = getNextBusinessDays(5);
    let chosenDate = businessDays[0];
    let matchedDay = false;

    // Detectar día elegido
    for (const bDay of businessDays) {
      const dayNames = ["domingo", "lunes", "martes", "miércoles", "miercoles", "jueves", "viernes", "sábado"];
      const bDayName = dayNames[bDay.getDay()];
      if (textLower.includes(bDayName) || (bDayName === 'miércoles' && textLower.includes('miercoles'))) {
        chosenDate = bDay;
        matchedDay = true;
        break;
      }
      const dayNumStr = String(bDay.getDate());
      const regexDayNum = new RegExp(`(?:el|día|dia|de|para)?\\s*\\b${dayNumStr}\\b`);
      if (regexDayNum.test(textLower)) {
        chosenDate = bDay;
        matchedDay = true;
        break;
      }
    }

    // Detectar bloque elegido (15:00 a 16:00, 16:00 a 17:00, 17:00 a 18:00)
    let chosenSlot = null;
    if (textLower.includes('15:00') || textLower.includes('15 a 16') || textLower.includes('a las 15') || textLower.includes('3 pm') || textLower.includes('3 a 4') || textLower.includes('bloque 1')) {
      chosenSlot = MEETING_SLOTS[0];
    } else if (textLower.includes('16:00') || textLower.includes('16 a 17') || textLower.includes('a las 16') || textLower.includes('4 pm') || textLower.includes('4 a 5') || textLower.includes('bloque 2')) {
      chosenSlot = MEETING_SLOTS[1];
    } else if (textLower.includes('17:00') || textLower.includes('17 a 18') || textLower.includes('a las 17') || textLower.includes('5 pm') || textLower.includes('5 a 6') || textLower.includes('bloque 3')) {
      chosenSlot = MEETING_SLOTS[2];
    }

    // Correo electrónico
    if (extracted.email) {
      state.clientEmail = extracted.email;
    }

    // Si aún no indica el correo
    if (!state.clientEmail) {
      return {
        reply: `Muchas gracias. Para coordinar la reunión y enviarte el enlace de conexión, por favor indícame tu **correo electrónico**.`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    }

    // Si aún no indica el bloque
    if (!chosenSlot) {
      const avail = await getAvailableSlots(chosenDate);
      const availList = avail.map(s => `• **${s.label}**`).join('\n');
      return {
        reply: `Por favor confírmame cuál de los bloques disponibles prefieres para el **${formatBusinessDate(chosenDate)}**:\n\n${availList}`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    }

    // Validar disponibilidad real del bloque
    const availableSlots = await getAvailableSlots(chosenDate);
    const isSlotAvailable = availableSlots.some(s => s.id === chosenSlot.id);

    if (!isSlotAvailable) {
      const otherSlots = availableSlots.map(s => `• **${s.label}**`).join('\n');
      return {
        reply: `El bloque de **${chosenSlot.label}** para el **${formatBusinessDate(chosenDate)}** acaba de ser reservado.\n\nContamos con estos otros horarios disponibles para ese día:\n${otherSlots}\n\n¿Cuál de ellos te acomodaría?`,
        toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
      };
    }

    // CREACIÓN Y CONFIRMACIÓN DE LA REUNIÓN
    const finalClientName = state.clientName || 'Cliente';
    const finalCompany = state.company || 'Empresa no especificada';
    const finalReason = state.reason || 'Consulta Jurídica / Técnica Especializada';
    const targetFormatted = formatBusinessDate(chosenDate);

    const year = chosenDate.getFullYear();
    const month = String(chosenDate.getMonth() + 1).padStart(2, '0');
    const day = String(chosenDate.getDate()).padStart(2, '0');
    const hStr = String(chosenSlot.hour).padStart(2, '0');
    const mStr = String(chosenSlot.minute).padStart(2, '0');
    const startIso = `${year}-${month}-${day}T${hStr}:${mStr}:00-03:00`;

    const endHour = chosenSlot.hour + 1;
    const endHStr = String(endHour).padStart(2, '0');
    const endIso = `${year}-${month}-${day}T${endHStr}:${mStr}:00-03:00`;

    const db = readDb();
    const newAppointment = {
      id: `apt-${Date.now()}`,
      clientName: finalClientName,
      clientPhone: phone,
      clientEmail: state.clientEmail,
      unitNumber: finalCompany,
      asunto: finalReason,
      summary: `Consulta Drimin: ${finalClientName} (${finalCompany})`,
      serviceType: finalReason,
      propertyAddress: "Drimin Services SpA - Modalidad Virtual",
      dateTime: `${targetFormatted} (${chosenSlot.label})`,
      slotId: chosenSlot.id,
      startIso,
      endIso,
      status: 'Confirmada',
      createdAt: new Date().toISOString()
    };
    db.appointments.unshift(newAppointment);
    writeDb(db);

    // Voucher y QR
    const voucher = await createVoucher({
      clientName: `${finalClientName} (${finalCompany})`,
      clientPhone: phone,
      industry: 'drimin',
      voucherType: `Pase de Reunión Drimin Services`,
      discountOrAmount: `${finalReason} | ${targetFormatted} ${chosenSlot.label}`,
      propertyAddress: "Drimin Services - Modalidad Virtual"
    });

    // Despacho de Correo y Calendario (.ics)
    dispatchDriminEvent({
      event: 'MEETING_BOOKED',
      clientName: finalClientName,
      unitNumber: finalCompany,
      meetingReason: finalReason,
      dateTime: `${targetFormatted} (${chosenSlot.label})`,
      startIso,
      endIso,
      summary: `Reunión Drimin: ${finalClientName}`,
      adminEmail: DRIMIN_CONFIG.companyEmail,
      clientEmail: state.clientEmail,
      voucherCode: voucher.code,
      qrCodeUrl: voucher.qrCodeDataUrl
    });

    // Actualizar estado a completado
    state.step = 'completed';
    saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });

    const confirmationReply = `¡Excelente, ${finalClientName}! Tu reunión ha sido confirmada con éxito. 📅\n\n` +
      `• **Fecha y hora**: ${targetFormatted}, ${chosenSlot.label}\n` +
      `• **Modalidad**: Virtual (videollamada)\n` +
      `• **Correo registrado**: \`${state.clientEmail}\`\n` +
      `• **Motivo**: *${finalReason}*\n` +
      `• **Pase Digital**: \`${voucher.code}\`\n` +
      `• **Contacto del equipo**: Drimin Services (+56 9 8877 6655 / ${DRIMIN_CONFIG.companyEmail})\n\n` +
      `🎟️ *A continuación te envío tu Pase Digital Oficial con Código QR.* También hemos enviado los detalles y la invitación con calendario (.ics) a tu correo electrónico. ¿Hay algo más en lo que te podamos orientar hoy?`;

    return {
      reply: confirmationReply,
      toolExecuted: { name: 'agendar_cita', result: newAppointment },
      voucher,
      industry: 'drimin',
      greeting: DRIMIN_CONFIG.greeting
    };
  }

  // 11. LIMITES DE ASESORÍA / OPINIONES JURÍDICAS DEFINITIVAS
  const isSeekingLegalVerdict = textLower.includes('garantizan') || textLower.includes('aseguran') || textLower.includes('puedo hacerlo ya') || textLower.includes('es 100% seguro');
  if (isSeekingLegalVerdict) {
    return {
      reply: `En Drimin Services no emitimos opiniones jurídicas definitivas ni garantizamos resultados regulatorios o de concesiones sin un análisis exhaustivo previo. Cada proyecto minero presenta particularidades normativas y técnicas únicas.\n\n` +
        `Por ello, lo más recomendable es revisar los antecedentes directamente con nuestros abogados y especialistas en una reunión formal. ¿Te gustaría que coordinemos una reunión con nuestro equipo?`,
      toolExecuted: null, voucher: null, industry: 'drimin', greeting: DRIMIN_CONFIG.greeting
    };
  }

  // 12. RESPUESTA INTELIGENTE CON GEMINI (SI ESTÁ HABILITADO)
  const businessDays = getNextBusinessDays(3);
  const slotsForGemini = await getAvailableSlots(businessDays[0]);

  const geminiReply = await generateGeminiReply({
    message: textRaw,
    history,
    senderPhone: phone,
    pushName: state.clientName || pushName,
    availableSlots: slotsForGemini
  });

  if (geminiReply) {
    saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
    return {
      reply: geminiReply,
      toolExecuted: null,
      voucher: null,
      industry: 'drimin',
      greeting: DRIMIN_CONFIG.greeting
    };
  }

  // 13. FALLBACK INTELIGENTE
  saveConversationState(phone, { ...state, lastBotMessageAt: new Date().toISOString() });
  return {
    reply: `¡Por supuesto! En Drimin Services contamos con respaldo jurídico y técnico multidisciplinario para acompañar tus proyectos en la Región de Antofagasta y el norte del país.\n\n` +
      `¿Te gustaría que te presente nuestros principales servicios o prefieres que coordinemos una reunión con nuestro equipo profesional?`,
    toolExecuted: null,
    voucher: null,
    industry: 'drimin',
    greeting: DRIMIN_CONFIG.greeting
  };
}

module.exports = {
  processMessage,
  DRIMIN_CONFIG,
  SERVICES_MENU,
  MEETING_SLOTS
};
