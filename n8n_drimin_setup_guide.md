# ⚖️ Guía de Configuración e Integración n8n - Drimin Services SpA

Esta guía detalla el procedimiento para importar y conectar el flujo de automatización de **Drimin Services SpA** en n8n, permitiendo la sincronización en tiempo real con **Google Calendar** y el envío automático de notificaciones por correo electrónico a `felipe.herrera@driminservices.cl`.

---

## 1. Archivo de Flujo n8n
El archivo listo para importar se encuentra en el directorio raíz del repositorio:
📌 `n8n_workflow_drimin.json`

---

## 2. Pasos para la Importación en n8n

1. Accede a tu instancia de **n8n** (Cloud o Self-Hosted).
2. Haz clic en **Workflows** -> **Import from File**.
3. Selecciona el archivo `n8n_workflow_drimin.json`.
4. El workflow cargará los siguientes 3 nodos:
   - **1. Webhook Evento Drimin** (Escucha los eventos enviadas por el Bot Node.js).
   - **2. Crear Evento en Google Calendar (Drimin)** (Agenda automáticamente la cita).
   - **3. Enviar Correo a felipe.herrera@driminservices.cl** (Notifica al Abogado Felipe Herrera).

---

## 3. Configuración del Webhook URL en la Aplicación

1. En el nodo **1. Webhook Evento Drimin**, copia la **Production URL** generada (ejemplo: `https://tu-n8n.com/webhook/drimin-consulta-event`).
2. Configura la variable de entorno `.env` en tu servidor Drimin:
   ```env
   N8N_WEBHOOK_URL=https://tu-n8n.com/webhook/drimin-consulta-event
   ```
3. Reinicia la aplicación Node.js:
   ```bash
   npm start
   ```

---

## 4. Credenciales Requeridas en n8n

### A. Google Calendar API (OAuth2)
- Nombre de la credencial: `Google Calendar Drimin Services`
- Ámbitos (Scopes): `https://www.googleapis.com/auth/calendar`
- Cuenta asociada: `felipe.herrera@driminservices.cl` (o la cuenta administrativa asignada).

### B. Servicio de Correo SMTP / Gmail
- Nombre de la credencial: `SMTP / Gmail Drimin Services`
- Servidor: `smtp.gmail.com`
- Puerto: `465` (SSL) o `587` (TLS)
- Usuario: `felipe.herrera@driminservices.cl`
- Contraseña de Aplicación: *(Generada desde la cuenta de Google)*.

---

## 5. Eventos Soportados y Formato de Titular

| Evento | Descripción | Formato de Asunto Email / Evento Calendar |
| :--- | :--- | :--- |
| `MEETING_BOOKED` | Consulta jurídica coordinada | `coordinación de reunión - Consulta Minera: [Nombre] - Empresa: [Empresa] - Asunto: [Asunto]` |
| `MEETING_CANCELED` | Cancelación de cita | `cancelación de reunión - [Nombre]` |
| `MEETING_RESCHEDULED` | Reprogramación | `reprogramación de reunión - [Nombre]` |
| `INCIDENT_REPORTED` | Requerimiento / Falla urgente | `reporte de incidencia técnica / HSEC - Drimin Services` |
| `PAYMENT_RECEIPT_SUBMITTED` | Comprobante de pago enviado | `comprobante de pago` |

---

## 6. Verificación de Funcionamiento

1. Envía un mensaje por WhatsApp al número de **Drimin Services**:
   > *"Hola, me llamo Carlos Mendoza de Minera San José y quiero coordinar reunión por Derecho Minero para el lunes a las 10:00"*
2. Verifica en n8n la ejecución del workflow.
3. Confirma que el evento aparezca en Google Calendar con el título:
   `Consulta Minera: Carlos Mendoza - Empresa: Minera San José - Asunto: Derecho Minero`
4. Confirma la llegada del correo de notificación a `felipe.herrera@driminservices.cl`.
