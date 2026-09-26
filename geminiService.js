/**
 * DRIMIN SERVICES SpA - Motor de Inteligencia Conversacional Gemini
 * Humaniza las respuestas y conversaciones legales del bot
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;
let model = null;

if (GEMINI_API_KEY && GEMINI_API_KEY !== 'tu_clave_gemini_api' && GEMINI_API_KEY.length > 10) {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('✨ [GeminiService] Motor Gemini 1.5 Flash inicializado con éxito para Drimin Services.');
  } catch (err) {
    console.error('⚠️ [GeminiService] Error al inicializar Gemini:', err.message);
  }
} else {
  console.log('ℹ️ [GeminiService] GEMINI_API_KEY pendiente de configurar en .env (usando motor base con fallback inteligente).');
}

const SYSTEM_PROMPT_DRIMIN = `
Eres el Asistente Virtual Oficial de Drimin Services SpA y del Abogado Felipe Herrera.
Drimin Services es una firma jurídica chilena especializada en:
1. Derecho Minero y Concesiones Mineras (pedimentos, manifestaciones, amparos, juicios mineros).
2. Proyectos de Energía y Regulaciones Eléctricas.
3. Terrenos Fiscales, Concesiones Marítimas y Bienes Nacionales.
4. Asesoría Corporativa a Empresas (contratos, constitución y gobierno corporativo).
5. Resolución de Controversias, Litigios y Recuperación de Activos.
6. Compliance y Modelos de Prevención de Delitos Corporativos.

CONTACTO OFICIAL:
- Abogado a cargo: Felipe Herrera
- Correo: felipe.herrera@driminservices.cl
- Teléfono oficial: +56 9 8877 6655
- Atención: Santiago y faenas mineras en todo Chile.

TU PERSONALIDAD:
- Hablas como un asistente jurídico profesional, cálido, educado y empático (estilo legal chileno de alto nivel).
- NUNCA suenes como un menú rígido de opciones mecánicas o un IVR telefónico.
- Eres comprensivo con las urgencias del cliente (fiscalizaciones, sumarios, amparos mineros, litigios).
- Si el cliente te saluda o hace una consulta, respóndele con amabilidad, identifica lo que busca y ofrécele coordinar una reunión de 30 minutos (gratuita) con el Abg. Felipe Herrera.
- Si el cliente quiere agendar, facilítale los horarios disponibles y pídele de forma natural: su Nombre, Empresa o Faena (si aplica) y un breve resumen del tema legal.
`;

/**
 * Genera una respuesta humanizada con Gemini manteniendo el contexto
 */
async function generateGeminiReply({ message, history = [], senderPhone, pushName, availableSlots = [] }) {
  if (!model) {
    return null; // Fallback al motor interno de reglas
  }

  try {
    const slotsSummary = availableSlots.length > 0 
      ? availableSlots.map(s => `- Bloque ${s.id}: ${s.label}`).join('\n')
      : 'Bloques habituales: 10:00 a 13:00 hrs y 15:00 a 18:00 hrs';

    const promptContext = `
${SYSTEM_PROMPT_DRIMIN}

CONTEXTO ACTUAL DEL CLIENTE:
- Nombre en WhatsApp: ${pushName || 'Cliente'}
- Teléfono: ${senderPhone || 'No especificado'}
- Próximos bloques disponibles para agendar:
${slotsSummary}

HISTORIAL RECIENTE:
${history.map(h => `${h.role === 'user' ? 'Cliente' : 'Asistente'}: ${h.content}`).slice(-6).join('\n')}

MENSAJE DEL CLIENTE: "${message}"

INSTRUCCIÓN:
Responde de manera natural, cercana y profesional. Si el cliente quiere una reunión, menciona los bloques disponibles y pídele los datos de forma fluida. Si tiene una duda legal general, oriéntalo con criterio jurídico profesional y sugiere agendar la sesión con el Abogado Felipe Herrera.
`;

    const result = await model.generateContent(promptContext);
    const response = await result.response;
    const text = response.text();
    return text.trim();
  } catch (err) {
    console.error('⚠️ [GeminiService] Error al invocar Gemini API:', err.message);
    return null;
  }
}

module.exports = {
  generateGeminiReply,
  isGeminiConfigured: () => Boolean(model)
};
