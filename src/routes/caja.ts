import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /caja/apertura-activa - Obtener apertura activa del usuario
router.get(
  "/apertura-activa",
  authenticateToken,
  requireRole("CAJA"),
  async (req: AuthRequest, res: Response) => {
    try {
      // Buscar la apertura más reciente sin cierre
      const aperturaActiva = await prisma.aperturaCaja.findFirst({
        where: { usuarioId: req.user!.id },
        orderBy: { createdAt: "desc" },
      });

      if (!aperturaActiva) {
        return res.status(404).json({
          error: "No hay caja abierta. Debes abrir caja primero",
        });
      }

      // Verificar si tiene cierre
      const tieneCierre = await prisma.cierreCaja.findFirst({
        where: { aperturaId: aperturaActiva.id },
      });

      if (tieneCierre) {
        return res.status(404).json({
          error: "No hay caja abierta. Debes abrir caja primero",
        });
      }

      res.json({
        aperturaActiva,
        estaAbierta: true,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /caja/abrir - Abrir caja
router.post(
  "/abrir",
  authenticateToken,
  requireRole("CAJA"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { montoInicial } = req.body;

      if (montoInicial === undefined || montoInicial < 0) {
        return res.status(400).json({
          error: "Monto inicial inválido (debe ser >= 0)",
        });
      }

      // Verificar si hay caja abierta sin cierre
      const aperturaActiva = await prisma.aperturaCaja.findFirst({
        where: { usuarioId: req.user!.id },
        orderBy: { createdAt: "desc" },
      });

      if (aperturaActiva) {
        const tieneCierre = await prisma.cierreCaja.findFirst({
          where: { aperturaId: aperturaActiva.id },
        });

        if (!tieneCierre) {
          return res.status(400).json({
            error: "Ya tienes una caja abierta. Debes cerrarla primero",
          });
        }
      }

      const apertura = await prisma.aperturaCaja.create({
        data: {
          usuarioId: req.user!.id,
          montoInicial,
        },
      });

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "APERTURA_CAJA",
          tabla: "caja",
          registroId: apertura.id,
          detalles: `Abrió caja con monto inicial $${montoInicial}`,
        },
      });

      res.status(201).json({
        mensaje: "Caja abierta exitosamente",
        apertura,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /caja/cerrar - Cerrar caja
router.post(
  "/cerrar",
  authenticateToken,
  requireRole("CAJA"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { montoFinal } = req.body;

      if (montoFinal === undefined || montoFinal < 0) {
        return res.status(400).json({
          error: "Monto final inválido (debe ser >= 0)",
        });
      }

      // Obtener apertura activa
      const aperturaActiva = await prisma.aperturaCaja.findFirst({
        where: { usuarioId: req.user!.id },
        orderBy: { createdAt: "desc" },
      });

      if (!aperturaActiva) {
        return res.status(404).json({
          error: "No hay caja abierta",
        });
      }

      // Verificar que no tenga cierre
      const yaHaycierre = await prisma.cierreCaja.findFirst({
        where: { aperturaId: aperturaActiva.id },
      });

      if (yaHaycierre) {
        return res.status(400).json({
          error: "Esta caja ya fue cerrada",
        });
      }

      const diferencia = montoFinal - aperturaActiva.montoInicial;

      const cierre = await prisma.cierreCaja.create({
        data: {
          usuarioId: req.user!.id,
          aperturaId: aperturaActiva.id,
          montoFinal,
          diferencia,
        },
      });

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "CIERRE_CAJA",
          tabla: "caja",
          registroId: cierre.id,
          detalles: `Cerró caja. Inicial: $${aperturaActiva.montoInicial}, Final: $${montoFinal}, Diferencia: $${diferencia}`,
        },
      });

      res.json({
        mensaje: "Caja cerrada exitosamente",
        cierre: {
          ...cierre,
          montoInicial: aperturaActiva.montoInicial,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /caja/movimientos - Ver movimientos de caja
router.get(
  "/movimientos",
  authenticateToken,
  requireRole("CAJA", "GERENTE", "DUENO"),
  async (req: AuthRequest, res: Response) => {
    try {
      const aperturasYCierres = await prisma.aperturaCaja.findMany({
        include: {
          usuario: {
            select: { id: true, nombre: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const cierres = await prisma.cierreCaja.findMany({
        orderBy: { createdAt: "desc" },
      });

      const movimientos = aperturasYCierres.map((apertura) => {
        const cierre = cierres.find((c) => c.aperturaId === apertura.id);

        return {
          aperturaId: apertura.id,
          usuario: apertura.usuario,
          montoInicial: apertura.montoInicial,
          montoFinal: cierre?.montoFinal || null,
          diferencia: cierre?.diferencia || null,
          abiertaEn: apertura.createdAt,
          cerradaEn: cierre?.createdAt || null,
          estado: cierre ? "CERRADA" : "ABIERTA",
        };
      });

      res.json(movimientos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
