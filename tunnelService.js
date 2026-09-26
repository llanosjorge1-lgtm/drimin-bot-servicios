/**
 * DRIMIN SERVICES SpA - Túnel Permanente para el Dashboard de Felipe
 * Mantiene la URL fija https://drimin-panel-felipe.loca.lt siempre conectada con auto-reconexión.
 */

const localtunnel = require('localtunnel');

const PORT = process.env.PORT || 3000;
const SUBDOMAIN = 'drimin-panel-felipe';

let activeTunnel = null;
let isReconnecting = false;

async function startPersistentTunnel() {
  if (isReconnecting) return;
  isReconnecting = true;

  try {
    if (activeTunnel) {
      try { activeTunnel.close(); } catch (e) {}
    }

    console.log(`🔌 Conectando túnel público para Felipe en puerto ${PORT}...`);
    activeTunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN });

    console.log('\n======================================================');
    console.log('🌐 PANEL DE FELIPE EN LÍNEA:');
    console.log(`👉 ${activeTunnel.url}`);
    console.log('======================================================\n');

    isReconnecting = false;

    activeTunnel.on('close', () => {
      console.log('⚠️ Túnel desconectado. Reconectando en 5 segundos...');
      activeTunnel = null;
      setTimeout(startPersistentTunnel, 5000);
    });

    activeTunnel.on('error', (err) => {
      console.error('❌ Error en túnel:', err.message);
      activeTunnel = null;
      setTimeout(startPersistentTunnel, 5000);
    });

  } catch (err) {
    console.error('❌ Error iniciando túnel:', err.message);
    isReconnecting = false;
    setTimeout(startPersistentTunnel, 10000);
  }
}

startPersistentTunnel();

// Heartbeat cada 30 segundos para mantener el event loop activo y auto-recuperar
setInterval(() => {
  if (!activeTunnel && !isReconnecting) {
    console.log('🔄 Heartbeat: verificando túnel...');
    startPersistentTunnel();
  }
}, 30000);

// Mantener el proceso vivo
process.on('SIGINT', () => {
  if (activeTunnel) activeTunnel.close();
  process.exit();
});
