require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const twilio = require('twilio');

const app = express();

// Configuración de Firebase
const serviceAccount = require('./firebase-key.json'); // Ruta actualizada;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Middlewares
app.use(cors({
  origin: process.env.WEB_URL || 'http://localhost:3000'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cliente Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Datos de ejemplo (puedes eliminarlos después de crear la base real)
const initDatabase = async () => {
  const especialidadesRef = db.collection('especialidades');
  const snapshot = await especialidadesRef.limit(1).get();
  
  if (snapshot.empty) {
    await especialidadesRef.doc('1').set({
      nombre: 'Cardiología',
      medicos: ['Dr. Pérez', 'Dra. Gómez']
    });
    
    // Crear turnos de ejemplo
    const turnosRef = db.collection('turnos');
    const medicos = ['Dr. Pérez', 'Dra. Gómez'];
    const fecha = new Date();
    
    for (let i = 0; i < 14; i++) {
      const fechaTurno = new Date(fecha);
      fechaTurno.setDate(fecha.getDate() + i);
      
      for (const medico of medicos) {
        for (let hora = 9; hora <= 17; hora++) {
          await turnosRef.add({
            medico,
            fecha: fechaTurno.toISOString().split('T')[0],
            hora: `${hora}:00`,
            estado: 'disponible',
            paciente: '',
            telefono: ''
          });
        }
      }
    }
  }
};
initDatabase();

// API Endpoints

// 1. Endpoint para WhatsApp
app.post('/whatsapp', async (req, res) => {
  try {
    const userMessage = req.body.Body.trim();
    let reply = '';

    if (userMessage === '1') {
      const especialidadesSnapshot = await db.collection('especialidades').get();
      let menu = '🏥 *Consultorio Médico*\nElija especialidad:\n\n';
      
      especialidadesSnapshot.forEach(doc => {
        menu += `${doc.id}. ${doc.data().nombre}\n`;
      });
      
      reply = menu + '\nEnvía el número de la especialidad';
    } 
    else if (/^\d+$/.test(userMessage)) {
      const especialidadRef = db.collection('especialidades').doc(userMessage);
      const especialidadDoc = await especialidadRef.get();
      
      if (especialidadDoc.exists) {
        const medicos = especialidadDoc.data().medicos;
        if (medicos.length === 1) {
          reply = `🔗 *${especialidadDoc.data().nombre}*\n\nPara agendar con ${medicos[0]}, visite:\n${process.env.WEB_URL}/calendar.html?medico=${encodeURIComponent(medicos[0])}`;
        } else {
          reply = `📋 *${especialidadDoc.data().nombre}*\n\nElija médico:\n\n${
            medicos.map((medico, index) => `${index + 1}. ${medico}`).join('\n')
          }\n\nEnvíe el número del médico`;
        }
      } else {
        reply = '❌ Especialidad no válida. Envíe *1* para ver opciones.';
      }
    }
    else {
      reply = '❌ Opción no reconocida. Envíe *1* para comenzar.';
    }

    res.type('text/xml').send(`
      <Response>
        <Message>${reply}</Message>
      </Response>
    `);
  } catch (error) {
    console.error('Error en endpoint /whatsapp:', error);
    res.type('text/xml').send(`
      <Response>
        <Message>⚠️ Error procesando su solicitud. Intente nuevamente.</Message>
      </Response>
    `);
  }
});

// 2. Endpoint para obtener turnos disponibles
app.get('/api/turnos', async (req, res) => {
  try {
    const medico = req.query.medico;
    const snapshot = await db.collection('turnos')
      .where('medico', '==', medico)
      .where('estado', '==', 'disponible')
      .get();

    const turnos = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      turnos.push({
        id: doc.id,
        title: 'Disponible',
        start: `${data.fecha}T${data.hora}`,
        extendedProps: {
          medico: data.medico
        }
      });
    });

    res.json(turnos);
  } catch (error) {
    console.error('Error en /api/turnos:', error);
    res.status(500).json({ error: 'Error al obtener turnos' });
  }
});

// 3. Endpoint para reservar turnos
app.post('/api/reservar', async (req, res) => {
  try {
    const { turnoId, nombre, telefono } = req.body;
    const turnoRef = db.collection('turnos').doc(turnoId);
    const turnoDoc = await turnoRef.get();

    if (!turnoDoc.exists || turnoDoc.data().estado !== 'disponible') {
      return res.status(400).json({ error: 'Turno no disponible' });
    }

    await turnoRef.update({
      paciente: nombre,
      telefono,
      estado: 'reservado'
    });

    // Enviar confirmación por WhatsApp
    const turnoData = turnoDoc.data();
    const mensaje = `✅ *Confirmación de Turno*\n\nDr./Dra. ${turnoData.medico}\nFecha: ${turnoData.fecha}\nHora: ${turnoData.hora}\n\nGracias por su reserva, ${nombre}.`;

    await twilioClient.messages.create({
      body: mensaje,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:${telefono}`
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error en /api/reservar:', error);
    res.status(500).json({ error: 'Error al reservar turno' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});