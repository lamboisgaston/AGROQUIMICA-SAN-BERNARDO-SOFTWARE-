import express from "express";
import { Moneda, PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

type MonedaCosto = "ARS" | "USD";

function calcularPrecioVenta(data: {
  costoBase: number;
  monedaCosto: MonedaCosto;
  tipoCambio?: number;
  flete?: number;
  iva?: number;
  margenGanancia?: number;
}) {
  const costoBase = Number(data.costoBase);
  const monedaCosto = data.monedaCosto;
  const tipoCambio = Number(data.tipoCambio ?? 1);
  const flete = Number(data.flete ?? 0);
  const iva = Number(data.iva ?? 21);
  const margenGanancia = Number(data.margenGanancia ?? 30);

  if (Number.isNaN(costoBase) || costoBase < 0) {
    throw new Error("costoBase inválido");
  }

  if (Number.isNaN(tipoCambio) || tipoCambio <= 0) {
    throw new Error("tipoCambio inválido");
  }

  if (Number.isNaN(flete) || flete < 0) {
    throw new Error("flete inválido");
  }

  if (Number.isNaN(iva) || iva < 0) {
    throw new Error("iva inválido");
  }

  if (Number.isNaN(margenGanancia) || margenGanancia < 0) {
    throw new Error("margenGanancia inválido");
  }

  const costoEnPesos =
    monedaCosto === "USD" ? costoBase * tipoCambio : costoBase;

  const subtotalConFlete = costoEnPesos + flete;
  const subtotalConIva = subtotalConFlete * (1 + iva / 100);
  const precioVenta = subtotalConIva * (1 + margenGanancia / 100);

  return Number(precioVenta.toFixed(2));
}

router.get("/", async (_req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      orderBy: { createdAt: "desc" }
    });

    return res.json(productos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al listar productos" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      nombre,
      costoBase,
      monedaCosto,
      tipoCambio,
      flete,
      iva,
      margenGanancia,
      stock
    } = req.body;

    if (!nombre || typeof nombre !== "string") {
      return res.status(400).json({ error: "nombre es obligatorio" });
    }

    if (costoBase === undefined) {
      return res.status(400).json({ error: "costoBase es obligatorio" });
    }

    if (monedaCosto !== "ARS" && monedaCosto !== "USD") {
      return res.status(400).json({ error: "monedaCosto debe ser ARS o USD" });
    }

    const precioVenta = calcularPrecioVenta({
      costoBase: Number(costoBase),
      monedaCosto,
      tipoCambio: Number(tipoCambio ?? 1),
      flete: Number(flete ?? 0),
      iva: Number(iva ?? 21),
      margenGanancia: Number(margenGanancia ?? 30)
    });

    const producto = await prisma.producto.create({
      data: {
        nombre,
        costoBase: Number(costoBase),
        monedaCosto: monedaCosto as Moneda,
        tipoCambio: Number(tipoCambio ?? 1),
        flete: Number(flete ?? 0),
        iva: Number(iva ?? 21),
        margenGanancia: Number(margenGanancia ?? 30),
        precioVenta,
        stock: Number(stock ?? 0)
      }
    });

    return res.status(201).json(producto);
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      error: error.message || "Error al crear producto"
    });
  }
});

export default router;