import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

const prisma = new PrismaClient();

async function testConnection() {
  console.log("🔍 Probando conexión a base de datos...\n");

  try {
    // Intentar conectar
    await prisma.$connect();
    console.log("✅ Conexión exitosa a PostgreSQL!");

    // Verificar si hay tablas
    const result = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log("📋 Tablas encontradas:", result);

    // Verificar si hay usuarios
    const usuariosCount = await prisma.usuario.count();
    console.log(`👥 Usuarios registrados: ${usuariosCount}`);

    // Verificar tipo de cambio
    const tipoCambio = await prisma.tipoCambio.findFirst({
      where: { activo: true },
      orderBy: { creadoEn: "desc" }
    });

    if (tipoCambio) {
      console.log(`💱 Tipo de cambio actual: 1 USD = ${tipoCambio.tasa} ARS`);
    } else {
      console.log("⚠️  No hay tipo de cambio configurado");
    }

    console.log("\n🎉 Base de datos lista para usar!");

  } catch (error) {
    console.error("❌ Error de conexión:");
    console.error(error);

    console.log("\n🔧 Posibles soluciones:");
    console.log("1. Verifica que DATABASE_URL esté correcto en .env");
    console.log("2. Asegúrate de que Railway esté corriendo");
    console.log("3. Verifica las credenciales de Railway");
    console.log("4. Revisa que el firewall permita conexiones");

  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar test
testConnection();