// Importaciones requeridas (CommonJS)
const express = require('express');
const admin = require('firebase-admin');
const twilio = require('twilio');
require('dotenv').config();

// Configuración inicial
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware básico
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Configuración de Firebase (con manejo de errores robusto)
try {
  const firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') // Manejo seguro del private key
  };

  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });

  console.log('✅ Firebase inicializado correctamente');
} catch (firebaseError) {
  console.error('❌ Error crítico al inicializar Firebase:', firebaseError);
  process.exit(1); // Detiene la ejecución si Firebase no carga
}

// 2. Configuración de Twilio
const twilioClient = new twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// 3. Endpoint para WhatsApp (con validaciones)
app.post('/whatsapp', async (req, res) => {
  try {
    const userMessage = req.body?.Body?.trim() || '';
    let response = '';

    // Lógica del menú
    if (userMessage === '1') {
      const especialidades = await getEspecialidades();
      response = formatMenu(especialidades);
    } else if (/^\d+$/.test(userMessage)) {
      response = await handleSpecialtySelection(userMessage);
    } else {
      response = '❌ Opción no válida. Envíe *1* para comenzar.';
    }

    // Respuesta en formato XML para Twilio
    res.type('text/xml').send(`
      <Response>
        <Message>${response}</Message>
      </Response>
    `);

  } catch (error) {
    console.error('Error en endpoint /whatsapp:', error);
    res.type('text/xml').status(500).send(`
      <Response>
        <Message>⚠️ Error procesando su solicitud</Message>
      </Response>
    `);
  }
});

// 4. Funciones auxiliares
async function getEspecialidades() {
  const snapshot = await admin.firestore().collection('especialidades').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function formatMenu(especialidades) {
  let menu = '🏥 *Consultorio Médico*\nElija especialidad:\n\n';
  especialidades.forEach(esp => {
    menu += `${esp.id}. ${esp.nombre}\n`;
  });
  return menu + '\nEnvía el número';
}

async function handleSpecialtySelection(option) {
  const especialidad = await admin.firestore()
    .collection('especialidades')
    .doc(option)
    .get();

  if (!especialidad.exists) {
    return '❌ Especialidad no válida';
  }

  const medicos = especialidad.data().medicos;
  if (medicos.length === 1) {
    return `🔗 ${especialidad.data().nombre}\n\nPara agendar con ${medicos[0]}, visite:\n${process.env.WEB_URL}/calendar.html?medico=${encodeURIComponent(medicos[0])}`;
  } else {
    let submenu = `📋 ${especialidad.data().nombre}\n\nElija médico:\n\n`;
    medicos.forEach((medico, index) => {
      submenu += `${index + 1}. ${medico}\n`;
    });
    return submenu;
  }
}

// 5. Endpoint de prueba
app.get('/', (req, res) => {
  res.send(`
    <h1>Servidor de Turnos Médicos</h1>
    <p>Endpoints disponibles:</p>
    <ul>
      <li>POST /whatsapp - Webhook para Twilio</li>
      <li>GET / - Página de prueba</li>
    </ul>
    <p>Estado: ✅ Funcionando</p>
  `);
});

// 6. Iniciar servidor (con manejo de puerto para Render)
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('⚠️ Error no capturado:', error);
});