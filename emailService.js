/**
 * DRIMIN SERVICES SpA - Servicio Nativo de Correos y Calendario Outlook (.ics)
 * Conexión SMTP directa con Ferozo / Outlook sin intermediarios ni costos de n8n.
 */

const nodemailer = require('nodemailer');

// Configuración SMTP desde variables de entorno con fallback a Ferozo Drimin
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'c2732057.ferozo.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: true, // Port 465 usa SSL directo
  auth: {
    user: process.env.SMTP_USER || 'felipe.herrera@driminservices.cl',
    pass: process.env.SMTP_PASS || 'Abogadodrimin2026@'
  },
  tls: {
    rejectUnauthorized: false
  }
};

const transporter = nodemailer.createTransport(SMTP_CONFIG);

/**
 * Genera el contenido de un archivo .ics estándar (RFC 5545) compatible con Outlook
 */
function createIcsContent({
  uid,
  summary,
  description,
  startIso,
  endIso,
  location = 'Oficinas Drimin Services / Reunión Virtual',
  organizerEmail = 'felipe.herrera@driminservices.cl',
  clientEmail,
  isCancel = false
}) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  // Convertir ISO local (ej: 2026-09-15T10:00:00-03:00) a formato ICS TZID
  function toIcsDate(isoStr) {
    if (!isoStr) return now;
    const clean = isoStr.split('-03:00')[0].split('+')[0];
    return clean.replace(/[-:]/g, '');
  }

  const dtStart = toIcsDate(startIso);
  const dtEnd = toIcsDate(endIso);
  const eventUid = uid || `drimin-${Date.now()}@driminservices.cl`;
  const method = isCancel ? 'CANCEL' : 'REQUEST';
  const status = isCancel ? 'CANCELLED' : 'CONFIRMED';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Drimin Services SpA//Sistema Juridico 24-7//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VTIMEZONE',
    'TZID:America/Santiago',
    'X-LIC-LOCATION:America/Santiago',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0300',
    'TZOFFSETTO:-0300',
    'TZNAME:-03',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${eventUid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=America/Santiago:${dtStart}`,
    `DTEND;TZID=America/Santiago:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${location}`,
    `STATUS:${status}`,
    `ORGANIZER;CN="Abg. Felipe Herrera - Drimin Services":mailto:${organizerEmail}`,
    clientEmail ? `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="Cliente":mailto:${clientEmail}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio consulta Drimin Services (2 horas antes)',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio consulta Drimin Services (30 minutos antes)',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
}

/**
 * Notificación de Cita Agendada (MEETING_BOOKED)
 */
async function notifyMeetingBooked(data) {
  const {
    clientName = 'Cliente',
    unitNumber = 'Empresa/Particular',
    meetingReason = 'Consulta General',
    dateTime,
    startIso,
    endIso,
    summary = 'Consulta Jurídica Minera',
    adminEmail = 'felipe.herrera@driminservices.cl',
    voucherCode = 'N/A',
    clientEmail = null,
    qrCodeUrl = null
  } = data;

  const recipients = [adminEmail];
  if (clientEmail && clientEmail.includes('@')) {
    recipients.push(clientEmail);
  }

  const icsData = createIcsContent({
    uid: `cita-${voucherCode}-${Date.now()}@driminservices.cl`,
    summary: `[Drimin Services] ${summary} - ${clientName}`,
    description: `Consulta Jurídica / Técnica Especializada.\nCliente: ${clientName} (${unitNumber})\nAsunto: ${meetingReason}\nPase Digital: ${voucherCode}\nContacto: Drimin Services (+56 9 8877 6655)`,
    startIso,
    endIso,
    organizerEmail: adminEmail,
    clientEmail: clientEmail
  });

  const qrBlockHtml = qrCodeUrl ? `
    <div style="text-align: center; margin: 25px 0; background: #ffffff; padding: 20px; border-radius: 8px; border: 1px dashed #0b2545;">
      <h3 style="margin: 0 0 10px; color: #0b2545;">🎟️ Pase Digital Oficial con Código QR</h3>
      <img src="cid:voucherqr" alt="Código QR Pase de Reunión" style="width: 220px; height: 220px; border-radius: 8px; display: block; margin: auto;" />
      <p style="margin: 10px 0 0; font-family: monospace; font-size: 16px; font-weight: bold; color: #134074;">${voucherCode}</p>
      <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Conserva este código QR para el ingreso y validación de tu atención.</p>
    </div>
  ` : '';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #dcdcdc; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #0b2545; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0;">📅 Confirmación de Reunión</h2>
        <p style="margin: 5px 0 0; color: #8da9c4;">Drimin Services SpA - Soluciones Jurídicas y Técnicas</p>
      </div>
      <div style="padding: 24px; color: #333; line-height: 1.6;">
        <p>Estimado/a <strong>${clientName}</strong>,</p>
        <p>Se ha coordinado y confirmado tu reunión con el equipo profesional de <strong>Drimin Services</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8f9fa; border-radius: 6px;">
          <tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">👤 Cliente:</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${clientName}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">🏢 Empresa:</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${unitNumber}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">📆 Fecha y Hora:</td><td style="padding: 10px; border-bottom: 1px solid #eee; color: #0b2545; font-weight: bold;">${dateTime}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">📋 Motivo / Asunto:</td><td style="padding: 10px; border-bottom: 1px solid #eee;">${meetingReason}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">💻 Modalidad:</td><td style="padding: 10px; border-bottom: 1px solid #eee;">Virtual (Videollamada)</td></tr>
          <tr><td style="padding: 10px; font-weight: bold;">🎟️ Código de Pase:</td><td style="padding: 10px;"><code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${voucherCode}</code></td></tr>
        </table>

        ${qrBlockHtml}

        <div style="background-color: #eef4f8; border-left: 4px solid #134074; padding: 12px; margin: 15px 0;">
          📌 <strong>Sincronización con Calendario:</strong> Se adjunta la invitación <code>cita_drimin.ics</code> compatible con Outlook, Google Calendar y Apple Calendar.
        </div>
      </div>
      <div style="background-color: #f1f1f1; padding: 12px; text-align: center; font-size: 12px; color: #777;">
        Drimin Services SpA • Región de Antofagasta • Fono: +56 9 8877 6655
      </div>
    </div>
  `;

  const mailAttachments = [
    {
      filename: 'cita_drimin.ics',
      content: icsData,
      contentType: 'text/calendar; charset=utf-8; method=REQUEST'
    }
  ];

  if (qrCodeUrl) {
    try {
      const base64Data = qrCodeUrl.replace(/^data:image\/png;base64,/, '');
      mailAttachments.push({
        filename: `pase_qr_${voucherCode}.png`,
        content: Buffer.from(base64Data, 'base64'),
        cid: 'voucherqr'
      });
    } catch (e) {
      console.error('Error adjuntando imagen QR a email:', e.message);
    }
  }

  return transporter.sendMail({
    from: `"Drimin Services" <${SMTP_CONFIG.auth.user}>`,
    to: recipients.join(', '),
    subject: `📅 Confirmación de Reunión: ${clientName} - ${dateTime} | Drimin Services`,
    html: htmlBody,
    icalEvent: {
      filename: 'cita_drimin.ics',
      method: 'REQUEST',
      content: icsData
    },
    attachments: mailAttachments
  });
}

/**
 * Notificación de Cancelación de Cita (MEETING_CANCELED)
 */
async function notifyMeetingCanceled(data) {
  const {
    clientName = 'Cliente',
    appointmentId = 'N/A',
    adminEmail = 'felipe.herrera@driminservices.cl'
  } = data;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #dcdcdc; border-radius: 8px;">
      <div style="background-color: #c9184a; color: white; padding: 18px; text-align: center;">
        <h2 style="margin: 0;">🚫 Consulta Cancelada por el Cliente</h2>
      </div>
      <div style="padding: 24px; color: #333; line-height: 1.6;">
        <p>Estimado <strong>Abogado Felipe Herrera</strong>,</p>
        <p>El cliente <strong>${clientName}</strong> ha cancelado su cita programada (ID: <code>${appointmentId}</code>).</p>
        <p>El bloque de horario ha quedado <strong>liberado</strong> automáticamente en el sistema del bot para nuevos clientes.</p>
      </div>
    </div>
  `;

  return transporter.sendMail({
    from: `"Drimin Bot Asistente" <${SMTP_CONFIG.auth.user}>`,
    to: adminEmail,
    subject: `🚫 Consulta Cancelada: ${clientName} | Drimin Services`,
    html: htmlBody
  });
}

/**
 * Notificación de Incidencia / Requerimiento Legal (INCIDENT_REPORTED)
 */
async function notifyIncidentReported(data) {
  const {
    ticketId,
    condoName = 'Faena / Empresa',
    clientName = 'Cliente',
    unitNumber = 'N/A',
    description = '',
    priority = 'Normal',
    adminEmail = 'felipe.herrera@driminservices.cl'
  } = data;

  const isUrgent = priority.toLowerCase() === 'alta' || priority.toLowerCase() === 'urgente';
  const headerColor = isUrgent ? '#d90429' : '#134074';
  const badgeEmoji = isUrgent ? '🚨 URGENTE' : '📋 Ticket Legal';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #dcdcdc; border-radius: 8px;">
      <div style="background-color: ${headerColor}; color: white; padding: 18px; text-align: center;">
        <h2 style="margin: 0;">${badgeEmoji} — ${ticketId}</h2>
        <p style="margin: 5px 0 0; color: #fdf0d5;">Prioridad: <strong>${priority.toUpperCase()}</strong></p>
      </div>
      <div style="padding: 24px; color: #333; line-height: 1.6;">
        <p>Estimado <strong>Abogado Felipe Herrera</strong>,</p>
        <p>Se ha recibido un nuevo requerimiento que requiere atención profesional:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0; background: #f8f9fa;">
          <tr><td style="padding: 8px; font-weight: bold;">Ticket:</td><td style="padding: 8px;">${ticketId}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Cliente:</td><td style="padding: 8px;">${clientName} (${unitNumber})</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Faena / Asunto:</td><td style="padding: 8px;">${condoName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Prioridad:</td><td style="padding: 8px; color: ${headerColor}; font-weight: bold;">${priority}</td></tr>
        </table>

        <div style="background: #f1f5f9; padding: 14px; border-left: 4px solid ${headerColor}; margin-top: 15px;">
          <strong>Detalle del Requerimiento:</strong><br>
          ${description}
        </div>
      </div>
    </div>
  `;

  return transporter.sendMail({
    from: `"Drimin Bot Legal" <${SMTP_CONFIG.auth.user}>`,
    to: adminEmail,
    subject: `${badgeEmoji}: ${ticketId} - ${clientName} (${condoName})`,
    priority: isUrgent ? 'high' : 'normal',
    html: htmlBody
  });
}

/**
 * Notificación de Comprobante de Pago / Honorarios (PAYMENT_RECEIPT_SUBMITTED)
 */
async function notifyPaymentReceipt(data) {
  const {
    receiptCode,
    clientName = 'Cliente',
    unitNumber = 'N/A',
    operationNumber = 'N/A',
    amountStr = '$0',
    voucherCode = 'N/A',
    adminEmail = 'felipe.herrera@driminservices.cl'
  } = data;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #dcdcdc; border-radius: 8px;">
      <div style="background-color: #2b9348; color: white; padding: 18px; text-align: center;">
        <h2 style="margin: 0;">🧾 Comprobante de Pago Recibido</h2>
        <p style="margin: 5px 0 0; color: #d8f3dc;">Folio: ${receiptCode}</p>
      </div>
      <div style="padding: 24px; color: #333; line-height: 1.6;">
        <p>Estimado <strong>Abogado Felipe Herrera</strong>,</p>
        <p>Un cliente ha registrado el pago de honorarios o servicios a través del bot:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0; background: #f8f9fa;">
          <tr><td style="padding: 8px; font-weight: bold;">Cliente:</td><td style="padding: 8px;">${clientName} (${unitNumber})</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Monto:</td><td style="padding: 8px; font-weight: bold; color: #2b9348;">${amountStr}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">N° Operación:</td><td style="padding: 8px;">${operationNumber}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Voucher Asociado:</td><td style="padding: 8px;">${voucherCode}</td></tr>
        </table>
      </div>
    </div>
  `;

  return transporter.sendMail({
    from: `"Drimin Pagos" <${SMTP_CONFIG.auth.user}>`,
    to: adminEmail,
    subject: `🧾 Pago Registrado: ${amountStr} - ${clientName} (Folio ${receiptCode})`,
    html: htmlBody
  });
}

/**
 * Despachador maestro de eventos Drimin
 * Procesa el evento internamente (Outlook + Email) y opcionalmente a n8n si existe URL
 */
async function dispatchDriminEvent(payload) {
  console.log(`[EmailService] Procesando evento nativo: ${payload.event}`);
  
  // 1. Envío nativo inmediato según el tipo de evento
  try {
    switch (payload.event) {
      case 'MEETING_BOOKED':
        await notifyMeetingBooked(payload);
        console.log(`✅ [EmailService] Correo con cita Outlook (.ics) enviado a ${payload.adminEmail}`);
        break;
      case 'MEETING_CANCELED':
        await notifyMeetingCanceled(payload);
        console.log(`✅ [EmailService] Notificación de cancelación enviada a ${payload.adminEmail}`);
        break;
      case 'INCIDENT_REPORTED':
        await notifyIncidentReported(payload);
        console.log(`✅ [EmailService] Incidencia ${payload.ticketId} enviada a ${payload.adminEmail}`);
        break;
      case 'PAYMENT_RECEIPT_SUBMITTED':
        await notifyPaymentReceipt(payload);
        console.log(`✅ [EmailService] Comprobante de pago ${payload.receiptCode} enviado a ${payload.adminEmail}`);
        break;
      default:
        console.warn(`[EmailService] Evento no reconocido: ${payload.event}`);
    }
  } catch (err) {
    console.error(`❌ [EmailService] Error enviando correo nativo para ${payload.event}:`, err.message);
  }

  // 2. Si hay n8n configurado, también le hace dispatch (modo híbrido)
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
  if (n8nWebhookUrl && n8nWebhookUrl.startsWith('http') && !n8nWebhookUrl.includes('tu-instancia')) {
    try {
      fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (e) {}
  }
}

module.exports = {
  transporter,
  createIcsContent,
  dispatchDriminEvent,
  notifyMeetingBooked,
  notifyMeetingCanceled,
  notifyIncidentReported,
  notifyPaymentReceipt
};
