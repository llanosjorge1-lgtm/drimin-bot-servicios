const cron = require('node-cron');
const { readDb, writeDb } = require('./db');

function startReminderCron() {
  console.log('⏰ Sistema de Recordatorios de Consultas Drimin iniciado...');

  cron.schedule('0 * * * *', async () => {
    console.log('🔍 Ejecutando verificación horaria de recordatorios de citas...');
    const db = readDb();
    const appointments = db.appointments || [];
    const now = new Date();

    appointments.forEach(apt => {
      if (apt.status === 'Confirmada' && apt.startIso && !apt.reminderSent) {
        const aptDate = new Date(apt.startIso);
        const diffMs = aptDate - now;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours > 0 && diffHours <= 2) {
          apt.reminderSent = true;
          console.log(`🔔 Recordatorio emitido para ${apt.clientName} (Consulta: ${apt.asunto})`);
        }
      }
    });

    writeDb(db);
  });
}

module.exports = {
  startReminderCron
};
