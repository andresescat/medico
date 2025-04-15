document.addEventListener('DOMContentLoaded', async () => {
  const medico = new URLSearchParams(window.location.search).get('medico');
  
  // Configura FullCalendar
  const calendarEl = document.getElementById('calendar');
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'timeGridWeek,timeGridDay'
    },
    slotMinTime: '08:00',
    slotMaxTime: '20:00',
    events: async (fetchInfo, successCallback) => {
      const res = await fetch(`/api/turnos?medico=${encodeURIComponent(medico)}`);
      const turnos = await res.json();
      successCallback(turnos);
    },
    eventClick: (info) => {
      document.getElementById('reserva-form').style.display = 'block';
      document.getElementById('turno-id').value = info.event.id;
    }
  });
  calendar.render();

  // Formulario de reserva
  document.getElementById('reservar-btn').addEventListener('click', async () => {
    const turnoId = document.getElementById('turno-id').value;
    const nombre = document.getElementById('nombre').value;
    const telefono = document.getElementById('telefono').value;

    const response = await fetch('/api/reservar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnoId, nombre, telefono })
    });

    if (response.ok) {
      alert('Turno reservado con éxito');
      calendar.refetchEvents();
    }
  });
});