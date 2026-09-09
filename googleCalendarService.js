/**
 * Servicio de Sincronización con Google Calendar API / iCal Feed para Drimin Services SpA
 */
const GOOGLE_CALENDAR_ICAL_URL = process.env.GOOGLE_CALENDAR_ICAL_URL || null;

/**
 * Obtiene los eventos/bloques ocupados desde Google Calendar
 */
async function fetchGoogleCalendarBusySlots(targetDate) {
  const busySlotIds = [];
  if (!GOOGLE_CALENDAR_ICAL_URL) {
    return busySlotIds;
  }

  try {
    const res = await fetch(GOOGLE_CALENDAR_ICAL_URL);
    if (!res.ok) return busySlotIds;
    
    const icalData = await res.text();
    const dateStr = targetDate.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const eventBlocks = icalData.split('BEGIN:VEVENT');
    for (const block of eventBlocks) {
      if (block.includes(dateStr)) {
        const dtMatch = block.match(/DTSTART(?:;[^:]+)?:(\d{8}T\d{6})/);
        if (dtMatch && dtMatch[1]) {
          const timeStr = dtMatch[1].split('T')[1];
          const hour = parseInt(timeStr.slice(0, 2), 10);
          const minute = parseInt(timeStr.slice(2, 4), 10);

          if (hour === 9 && minute === 0) busySlotIds.push(1);
          else if (hour === 9 && minute === 30) busySlotIds.push(2);
          else if (hour === 10 && minute === 0) busySlotIds.push(3);
          else if (hour === 10 && minute === 30) busySlotIds.push(4);
          else if (hour === 11 && minute === 30) busySlotIds.push(5);
          else if (hour === 12 && minute === 0) busySlotIds.push(6);
          else if (hour === 12 && minute === 30) busySlotIds.push(7);
          else if (hour === 15 && minute === 0) busySlotIds.push(8);
          else if (hour === 15 && minute === 30) busySlotIds.push(9);
          else if (hour === 16 && minute === 0) busySlotIds.push(10);
          else if (hour === 16 && minute === 30) busySlotIds.push(11);
        }
      }
    }
  } catch (err) {
    console.error("Error sincronizando Google Calendar:", err.message);
  }

  return busySlotIds;
}

module.exports = {
  fetchGoogleCalendarBusySlots
};
