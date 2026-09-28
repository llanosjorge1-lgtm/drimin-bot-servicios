const cron = require('node-cron');
const { readDb, writeDb, getAllConversationStates, saveConversationState } = require('./db');
const { sendWhatsAppTextMessage } = require('./whatsappBaileys');

function isWithinChileBusinessHours(date = new Date()) {
  try {
    // Convertir a hora de Chile (America/Santiago)
    const options = { timeZone: 'America/Santiago', hour12: false, weekday: 'short', hour: 'numeric', minute: 'numeric' };
    const parts = new Intl.DateTimeFormat('es-CL', options).formatToParts(date);
    const partMap = {};
    parts.forEach(p => { partMap[p.type] = p.value; });

    const weekday = (partMap.weekday || '').toLowerCase(); // lun, mar, mié, jue, vie, sáb, dom
    const hour = parseInt(partMap.hour, 10);

    // Lunes a viernes (excluyendo sábado y domingo)
    const isWeekend = weekday.startsWith('s') || weekday.startsWith('d');
    if (isWeekend) return false;

    // Horario comercial de 09:00 a 18:30
    if (hour >= 9 && hour < 19) {
      return true;
    }
    return false;
  } catch (err) {
    const day = date.getDay();
    const h = date.getHours();
    return day >= 1 && day <= 5 && h >= 9 && h <= 18;
  }
}

function startReminderCron() {
  console.log('⏰ Sistema de Recordatorios y Seguimiento Drimin Services iniciado...');

  // Cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    try {
      const db = readDb();
      const now = new Date();

      // 1. RECORDATORIO DE CITAS CONFIRMADAS (2 HORAS ANTES)
      const appointments = db.appointments || [];
      for (const apt of appointments) {
        if (apt.status === 'Confirmada' && apt.startIso && !apt.reminderSent) {
          const aptDate = new Date(apt.startIso);
          const diffMs = aptDate - now;
          const diffHours = diffMs / (1000 * 60 * 60);

          if (diffHours > 0 && diffHours <= 2) {
            apt.reminderSent = true;
            console.log(`🔔 Recordatorio de cita emitido para ${apt.clientName} (Consulta: ${apt.asunto})`);
            
            if (apt.clientPhone) {
              const reminderMsg = `¡Hola **${apt.clientName}**! 👋 Te recordamos que hoy a las **${apt.dateTime || 'horario convenido'}** se llevará a cabo tu reunión con el equipo de **Drimin Services**.\n\n` +
                `Modalidad: Virtual.\n` +
                `Estaremos puntualmente esperando tu conexión. ¡Que tengas un excelente día! ⚖️⛏️`;
              await sendWhatsAppTextMessage(apt.clientPhone, reminderMsg);
            }
          }
        }
      }
      writeDb(db);

      // 2. SEGUIMIENTO AUTOMATIZADO A LAS 24 HORAS (DENTRO DE HORARIO COMERCIAL)
      const conversationStates = getAllConversationStates();
      const isBusinessHour = isWithinChileBusinessHours(now);

      if (isBusinessHour) {
        for (const phone of Object.keys(conversationStates)) {
          const state = conversationStates[phone];
          if (!state) continue;

          if (state.optOut) continue;
          if (state.followUpSent) continue;

          const hasActiveApt = appointments.some(a => 
            (a.clientPhone === phone || a.clientPhone === `+${phone}`) && 
            a.status !== 'Cancelada' && a.status !== 'Cancelada (Reprogramada)'
          );
          if (hasActiveApt) continue;

          if (state.lastBotMessageAt) {
            const lastBotTime = new Date(state.lastBotMessageAt);
            const elapsedHours = (now - lastBotTime) / (1000 * 60 * 60);

            if (elapsedHours >= 24 && elapsedHours <= 72) {
              console.log(`📩 Enviando seguimiento de 24h a [${phone}] (Transcurridas ${Math.round(elapsedHours)} hrs)...`);
              
              const followUpText = `¡Hola! 👋 Te saluda nuevamente el asesor virtual de Drimin Services. Quería saber si lograste revisar nuestros servicios o si te gustaría que te ayudara a coordinar una reunión. Quedamos atentos a lo que necesites. ¡Que tengas un excelente día!`;
              
              const sent = await sendWhatsAppTextMessage(phone, followUpText);
              if (sent) {
                saveConversationState(phone, {
                  followUpSent: true,
                  followUpSentAt: now.toISOString()
                });
              }
            }
          }
        }
      }
    } catch (cronErr) {
      console.error('❌ Error controlado en reminderCron:', cronErr.message);
    }
  });
}

module.exports = {
  startReminderCron
};
