import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding base de datos...");

  // Limpiar datos existentes
  await prisma.usuario.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.producto.deleteMany();
  await prisma.tipoCambio.deleteMany();

  // Crear tipo de cambio USD/ARS
  const tipoCambio = await prisma.tipoCambio.create({
    data: {
      monedaDe: "USD",
      monedaA: "ARS",
      tasa: 1000, // 1 USD = 1000 ARS (ejemplo)
    },
  });

  console.log(`✅ Tipo de cambio: 1 USD = ${tipoCambio.tasa} ARS`);

  // Crear usuarios
  const dueno = await prisma.usuario.create({
    data: {
      nombre: "Admin Dueño",
      email: "dueno@agroquimica.com",
      password: await bcrypt.hash("password123", 10),
      rol: "DUENO",
    },
  });

  const gerente = await prisma.usuario.create({
    data: {
      nombre: "Gerente General",
      email: "gerente@agroquimica.com",
      password: await bcrypt.hash("password123", 10),
      rol: "GERENTE",
    },
  });

  const cajeraA = await prisma.usuario.create({
    data: {
      nombre: "Cajera Ana",
      email: "ana@agroquimica.com",
      password: await bcrypt.hash("password123", 10),
      rol: "CAJA",
    },
  });

  const mostrador = await prisma.usuario.create({
    data: {
      nombre: "Vendedor Carlos",
      email: "carlos@agroquimica.com",
      password: await bcrypt.hash("password123", 10),
      rol: "MOSTRADOR",
    },
  });

  console.log("\n✅ Usuarios creados");

  // Crear clientes
  const cliente1 = await prisma.cliente.create({
    data: {
      nombre: "Agricultor Juan",
      telefono: "2612223344",
      email: "juan@farmer.com",
    },
  });

  const cliente2 = await prisma.cliente.create({
    data: {
      nombre: "Finca Los Álamos",
      telefono: "2619876543",
    },
  });

  console.log("✅ Clientes creados");

  // Crear productos con precios en ARS y USD
  const productos = [
    {
      nombre: "Semilla Maíz Premium",
      sku: "SEM-MAZ-001",
      costoBase: 250,
      monedaCosto: "ARS",
      flete: 50,
      iva: 21,
      margenGanancia: 30,
      stock: 100,
    },
    {
      nombre: "Fertilizante NPK 20-20-20",
      sku: "FERT-NPK-001",
      costoBase: 15, // en USD
      monedaCosto: "USD",
      flete: 100, // convertido a ARS aproximadamente
      iva: 21,
      margenGanancia: 50,
      stock: 50,
    },
    {
      nombre: "Fungicida Bioprotect",
      sku: "FUNG-BIO-001",
      costoBase: 20, // en USD
      monedaCosto: "USD",
      flete: 150,
      iva: 21,
      margenGanancia: 40,
      stock: 20,
    },
    {
      nombre: "Herbicida Selectivo",
      sku: "HERB-SEL-001",
      costoBase: 8, // en USD
      monedaCosto: "USD",
      flete: 80,
      iva: 21,
      margenGanancia: 60,
      stock: 75,
    },
    {
      nombre: "Insecticida Piretroide",
      sku: "INSEC-PIR-001",
      costoBase: 12, // en USD
      monedaCosto: "USD",
      flete: 120,
      iva: 21,
      margenGanancia: 45,
      stock: 40,
    },
  ];

  const productosCreados = [];
  const { precioService } = await import("../src/services/precioService");

  for (const p of productos) {
    const config = {
      costoBase: p.costoBase,
      moneda: p.monedaCosto as "ARS" | "USD",
      flete: p.flete,
      iva: p.iva,
      margenGanancia: p.margenGanancia,
      tipoCambio: tipoCambio.tasa,
    };

    const resultado = precioService.calcularPrecio(config);

    const producto = await prisma.producto.create({
      data: {
        nombre: p.nombre,
        sku: p.sku,
        costoBase: p.costoBase,
        monedaCosto: p.monedaCosto as any,
        flete: p.flete,
        iva: p.iva,
        margenGanancia: p.margenGanancia,
        precioVenta: resultado.precioVenta,
        stock: p.stock,
      },
    });

    productosCreados.push({
      nombre: producto.nombre,
      moneda: producto.monedaCosto,
      precioVenta: producto.precioVenta,
    });
  }

  console.log("\n✅ Productos creados:");
  productosCreados.forEach((p) => {
    console.log(`   - ${p.nombre}: $${p.precioVenta} ARS (costo en ${p.moneda})`);
  });

  console.log("\n🎉 Base de datos seeded correctamente!");
  console.log("\n📝 Datos de prueba:");
  console.log("   Usuarios para login (password: password123):");
  console.log("   - dueno@agroquimica.com (DUENO)");
  console.log("   - gerente@agroquimica.com (GERENTE)");
  console.log("   - ana@agroquimica.com (CAJA)");
  console.log("   - carlos@agroquimica.com (MOSTRADOR)");
  console.log(`\n💱 Tipo de cambio: 1 USD = ${tipoCambio.tasa} ARS`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

