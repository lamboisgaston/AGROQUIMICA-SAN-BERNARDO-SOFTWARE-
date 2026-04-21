import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { precioService } from "../services/precioService";

const router = Router();
const prisma = new PrismaClient();

// GET /tipo-cambio - Obtener tipo de cambio actual
router.get(
  "/",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const tipoCambio = await precioService.obtenerTipoCambio();

      res.json({
        monedaDe: "USD",
        monedaA: "ARS",
        tasa: tipoCambio,
        mensaje: `1 USD = ${tipoCambio} ARS`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /tipo-cambio/historial - Ver historial de tipos de cambio
router.get(
  "/historial",
  authenticateToken,
  requireRole("DUENO", "GERENTE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const historial = await prisma.tipoCambio.findMany({
        where: {
          monedaDe: "USD",
          monedaA: "ARS",
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });

      res.json(historial);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /tipo-cambio - Actualizar tipo de cambio y recalcular precios
router.post(
  "/",
  authenticateToken,
  requireRole("DUENO", "GERENTE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { tasa, recalcularProductos } = req.body;

      if (!tasa || tasa <= 0) {
        return res.status(400).json({
          error: "Tasa debe ser mayor a 0",
        });
      }

      // Actualizar tipo de cambio
      const nuevoTipoCambio = await precioService.actualizarTipoCambio(
        tasa,
        req.user!.id
      );

      let productosActualizados = 0;

      // Si se solicita, recalcular todos los productos en USD
      if (recalcularProductos) {
        productosActualizados = await precioService.recalcularTodosProductos(
          req.user!.id
        );
      }

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "UPDATE_TIPO_CAMBIO",
          tabla: "tipo_cambio",
          registroId: nuevoTipoCambio.id,
          detalles: `Cambió tipo USD/ARS a ${tasa}. Productos recalculados: ${productosActualizados}`,
        },
      });

      res.json({
        mensaje: "Tipo de cambio actualizado",
        tipoCambio: nuevoTipoCambio,
        productosRecalculados: productosActualizados,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// POST /tipo-cambio/simular - Simular cambio de tipo sin aplicar
router.post(
  "/simular",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { nuevaTasa } = req.body;

      if (!nuevaTasa || nuevaTasa <= 0) {
        return res.status(400).json({
          error: "Nueva tasa debe ser mayor a 0",
        });
      }

      const tipoActual = await precioService.obtenerTipoCambio();
      const productos = await prisma.producto.findMany({
        where: { 
          activo: true,
          monedaCosto: "USD"
        },
      });

      const simulacion = productos.map((p) => {
        const resultadoActual = require("../services/precioService").precioService.calcularPrecio({
          costoBase: p.costoBase,
          moneda: "USD",
          flete: p.flete,
          iva: p.iva,
          margenGanancia: p.margenGanancia,
          tipoCambio: tipoActual,
        });

        const resultadoNuevo = require("../services/precioService").precioService.calcularPrecio({
          costoBase: p.costoBase,
          moneda: "USD",
          flete: p.flete,
          iva: p.iva,
          margenGanancia: p.margenGanancia,
          tipoCambio: nuevaTasa,
        });

        return {
          productoId: p.id,
          nombre: p.nombre,
          precioActual: resultadoActual.precioVenta,
          precioNuevo: resultadoNuevo.precioVenta,
          diferencia: resultadoNuevo.precioVenta - resultadoActual.precioVenta,
          porcentajeCambio: (
            ((resultadoNuevo.precioVenta - resultadoActual.precioVenta) /
              resultadoActual.precioVenta) *
            100
          ).toFixed(2),
        };
      });

      const totalDiferencia = simulacion.reduce((sum, p) => sum + p.diferencia, 0);

      res.json({
        tipoActual,
        nuevoTipo: nuevaTasa,
        diferenciaTipo: nuevaTasa - tipoActual,
        productosAjustados: productos.length,
        simulacion,
        resumen: {
          productosConAumento: simulacion.filter((p) => p.diferencia > 0).length,
          productosConDisminucion: simulacion.filter((p) => p.diferencia < 0).length,
          totalDiferencia: totalDiferencia.toFixed(2),
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

export default router;
