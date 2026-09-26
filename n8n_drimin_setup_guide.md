# 🏛️ Guía de Configuración n8n - Drimin Services (Workflow Completo Autónomo)

## Workflow Expandido: 21 Nodos / 4 Ramas de Eventos

Este documento guía la importación y configuración del workflow completo
`n8n_workflow_drimin_completo.json` que reemplaza al workflow básico de 3 nodos.

---

## 1. Importación del Workflow

1. Abre tu instancia de n8n (Cloud o Self-Hosted).
2. Ve a **Workflows** → **Import from File**.
3. Selecciona el archivo `n8n_workflow_drimin_completo.json`.
4. El workflow se cargará con **21 nodos** organizados en 4 ramas.

---

## 2. Configurar la Variable de Entorno del Bot

En el archivo `.env` de tu servidor Node.js, actualiza:

```env
N8N_WEBHOOK_URL=https://TU-INSTANCIA-N8N.com/webhook/drimin-consulta-event
```

> **Nota:** El path del webhook es `drimin-consulta-event` y el método es `POST`.

---

## 3. Credenciales Requeridas en n8n

### 3.1 Google Calendar OAuth2
- **Nombre:** `Google Calendar Drimin Services`
- **ID en el workflow:** `google-calendar-cred-drimin`
- **Tipo:** Google Calendar OAuth2 API
- **Scope:** `https://www.googleapis.com/auth/calendar`
- **Cuenta:** `felipe.herrera@driminservices.cl`
- **Instrucciones:**
  1. Crea un proyecto en Google Cloud Console.
  2. Habilita la API de Google Calendar.
  3. Crea credenciales OAuth2 (Web Application).
  4. Agrega la URL de callback de n8n como redirect URI.
  5. En n8n, crea la credencial y autoriza con la cuenta de Google.

### 3.2 SMTP / Gmail
- **Nombre:** `SMTP / Gmail Drimin Services`
- **ID en el workflow:** `smtp-cred-drimin`
- **Servidor:** `smtp.gmail.com`
- **Puerto:** `465` (SSL) o `587` (TLS)
- **Cuenta:** `felipe.herrera@driminservices.cl`
- **Contraseña:** App Password de Google (no la contraseña normal)
- **Instrucciones:**
  1. En la cuenta de Google, habilita la verificación en 2 pasos.
  2. Genera una "Contraseña de aplicación" para "Correo".
  3. Usa esa contraseña en n8n como password del SMTP.

### 3.3 Google Sheets OAuth2 (Opcional)
- **Nombre:** `Google Sheets Drimin Services`
- **ID en el workflow:** `google-sheets-cred-drimin`
- **Tipo:** Google Sheets OAuth2 API
- **Cuenta:** `felipe.herrera@driminservices.cl`
- **Instrucciones:**
  1. Habilita la API de Google Sheets en Google Cloud Console.
  2. Usa las mismas credenciales OAuth2 de Calendar.
  3. Crea dos hojas de cálculo:
     - **Incidencias Drimin**: Columnas: Fecha, Ticket ID, Cliente, Empresa, Descripción, Prioridad, Estado
     - **Registro Contable Drimin**: Columnas: Fecha, Cliente, Empresa, N° Operación, Monto, Código Recibo, Voucher QR, Estado
  4. Configura los nodos 13 y 20 con los IDs de las hojas creadas.

---

## 4. Arquitectura del Workflow

### 4.1 Nodo Raíz
| # | Nodo | Descripción |
|:-:|:-----|:------------|
| 1 | Webhook Trigger | Recibe POST en `/drimin-consulta-event` |
| 2 | Switch Router | Enruta por `event` a 4 ramas |
| 21 | Log de Auditoría | Registra cada evento procesado |

### 4.2 Rama MEETING_BOOKED (Cita Agendada)
| # | Nodo | Descripción |
|:-:|:-----|:------------|
| 3 | Google Calendar | Crea evento con asistentes y Google Meet |
| 4 | Email Admin | Notificación con tabla HTML de datos |
| 5 | Email Cliente | Confirmación con QR y detalles |
| 6 | Wait 2h | Espera hasta 2 horas antes de la cita |
| 7 | Email Recordatorio | "Su consulta es en 2 horas" |

### 4.3 Rama MEETING_CANCELED (Cita Cancelada)
| # | Nodo | Descripción |
|:-:|:-----|:------------|
| 8 | Email Admin | Aviso de cancelación |
| 9 | Email Cliente | Confirmación de cancelación |

### 4.4 Rama INCIDENT_REPORTED (Incidencia Legal)
| # | Nodo | Descripción |
|:-:|:-----|:------------|
| 10 | IF Prioridad Alta | Evalúa si es fiscalización/urgencia |
| 11 | Email URGENTE | Header rojo, acción requerida en 4h |
| 12 | Email Normal | Notificación estándar de ticket |
| 13 | Google Sheets | Log de todas las incidencias |
| 14 | Wait 24h | Espera para seguimiento automático |
| 15 | HTTP Request | Consulta `/api/incidents` del bot |
| 16 | IF No Resuelto | Verifica si el ticket fue atendido |
| 17 | Email Escalamiento | Alerta de ticket sin resolver a 24h |

### 4.5 Rama PAYMENT_RECEIPT_SUBMITTED (Pago)
| # | Nodo | Descripción |
|:-:|:-----|:------------|
| 18 | Email Admin | Comprobante recibido + datos bancarios |
| 19 | Email Cliente | Confirmación de pago verificado |
| 20 | Google Sheets | Registro contable financiero |

---

## 5. Eventos Soportados

| Evento | Origen | Rama |
|:-------|:-------|:-----|
| `MEETING_BOOKED` | agentEngine.js | Cita Agendada |
| `MEETING_CANCELED` | agentEngine.js | Cita Cancelada |
| `INCIDENT_REPORTED` | incidentEngine.js | Incidencia Legal |
| `PAYMENT_RECEIPT_SUBMITTED` | ocrService.js | Pago Recibido |

---

## 6. Configuración Post-Importación

### 6.1 Nodos de Google Sheets (13 y 20)
Después de importar, debes configurar manualmente:
1. Abre cada nodo de Google Sheets.
2. Selecciona el `documentId` (la hoja de cálculo creada).
3. Selecciona el `sheetName` (la pestaña dentro del documento).
4. Verifica que las columnas coincidan con los campos configurados.

### 6.2 Nodo HTTP Request (15)
- Si tu bot NO corre en el mismo servidor que n8n, cambia la URL:
  - De: `http://localhost:3000/api/incidents`
  - A: `https://TU-SERVIDOR-BOT.com/api/incidents`

### 6.3 Nodo Wait (6 - Recordatorio 2h)
- Este nodo espera 2 horas después de crear el evento de Calendar.
- Para que el recordatorio llegue 2h antes de la CITA (no 2h después del webhook):
  - Puedes ajustar la lógica usando una expresión con `startIso` para calcular el delay exacto.

---

## 7. Verificación End-to-End

### Test 1: Cita (MEETING_BOOKED)
1. Envía por WhatsApp: "Hola, quiero agendar una consulta de derecho minero"
2. Sigue el flujo del bot hasta confirmar una cita.
3. Verifica:
   - ✅ Evento creado en Google Calendar
   - ✅ Email recibido por el admin
   - ✅ Email de confirmación al cliente

### Test 2: Cancelación (MEETING_CANCELED)
1. Envía: "Quiero cancelar mi cita"
2. Verifica:
   - ✅ Email de aviso al admin
   - ✅ Email de confirmación al cliente

### Test 3: Incidencia (INCIDENT_REPORTED)
1. Envía: "Necesito reportar una fiscalización urgente"
2. Sigue el flujo del bot.
3. Verifica:
   - ✅ Email URGENTE con header rojo (prioridad Alta)
   - ✅ Registro en Google Sheets
   - ✅ Después de 24h: email de escalamiento si no fue resuelto

### Test 4: Pago (PAYMENT_RECEIPT_SUBMITTED)
1. Envía un comprobante de pago por WhatsApp.
2. Verifica:
   - ✅ Email al admin con datos del pago
   - ✅ Email de confirmación al cliente
   - ✅ Registro en Google Sheets contable

---

## 8. Troubleshooting

| Problema | Solución |
|:---------|:---------|
| Webhook no recibe datos | Verifica que `N8N_WEBHOOK_URL` en `.env` apunta a la URL correcta |
| Calendar no crea eventos | Revisa las credenciales OAuth2 y el scope de Calendar |
| Emails no se envían | Verifica la App Password de Gmail y los puertos SMTP |
| Google Sheets da error | Configura el `documentId` y `sheetName` en los nodos 13 y 20 |
| Escalamiento no funciona | Verifica que la URL del nodo 15 apunta al servidor del bot |
