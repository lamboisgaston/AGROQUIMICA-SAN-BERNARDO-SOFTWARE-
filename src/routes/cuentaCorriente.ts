import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /cuenta-corriente - Listar todas las cuentas
router.get(
  "/",
  authenticateToken,
  requireRole("DUENO", "GERENTE", "CAJA"),
  async (req: AuthRequest, res: Response) => {
    try {
      const cuentas = await prisma.cuentaCorriente.findMany({
        include: {
          cliente: true,
          pagos: {
            include: {
              usuario: {
                select: { id: true, nombre: true, email: true },
              },
            },
          },
        },
      });

      res.json(cuentas);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /cuenta-corriente/:clienteId - Obtener cuenta corriente de un cliente
router.get(
  "/:clienteId",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const cuenta = await prisma.cuentaCorriente.findUnique({
        where: { clienteId: req.params.clienteId },
        include: {
          cliente: true,
          pagos: {
            include: {
              usuario: {
                select: { id: true, nombre: true, email: true },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!cuenta) {
        return res.status(404).json({
          error: "Cuenta corriente no encontrada",
        });
      }

      res.json(cuenta);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /cuenta-corriente/:clienteId/pago - Registrar pago
router.post(
  "/:clienteId/pago",
  authenticateToken,
  requireRole("CAJA", "GERENTE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { monto, metodo } = req.body;

      if (!monto || monto <= 0) {
        return res.status(400).json({
          error: "Monto debe ser mayor a 0",
        });
      }

      const metodosValidos = ["EFECTIVO", "CHEQUE", "TRANSFERENCIA"];
      if (!metodo || !metodosValidos.includes(metodo)) {
        return res.status(400).json({
          error: `Método inválido. Valores válidos: ${metodosValidos.join(", ")}`,
        });
      }

      // Obtener cliente
      const cliente = await prisma.cliente.findUnique({
        where: { id: req.params.clienteId },
      });

      if (!cliente) {
        return res.status(404).json({
          error: "Cliente no encontrado",
        });
      }

      // Obtener o crear cuenta corriente
      let cuenta = await prisma.cuentaCorriente.findUnique({
        where: { clienteId: req.params.clienteId },
      });

      if (!cuenta) {
        // Si no existe, crear con saldo 0
        cuenta = await prisma.cuentaCorriente.create({
          data: {
            clienteId: req.params.clienteId,
            saldo: 0,
          },
        });
      }

      // No permitir pagar más de lo que se debe
      if (monto > cuenta.saldo) {
        return res.status(400).json({
          error: `No puedes pagar $${monto}. Saldo actual: $${cuenta.saldo}`,
        });
      }

      // Crear pago
      const pago = await prisma.pago.create({
        data: {
          cuentaCorrienteId: cuenta.id,
          clienteId: req.params.clienteId,
          usuarioId: req.user!.id,
          monto,
          metodo: metodo as any,
        },
        include: {
          usuario: {
            select: { id: true, nombre: true, email: true },
          },
          cliente: true,
        },
      });

      // Actualizar saldo de la cuenta
      const cuentaActualizada = await prisma.cuentaCorriente.update({
        where: { id: cuenta.id },
        data: {
          saldo: {
            decrement: monto,
          },
        },
        include: {
          cliente: true,
          pagos: {
            include: {
              usuario: {
                select: { id: true, nombre: true, email: true },
              },
            },
          },
        },
      });

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "PAGO_CUENTA_CORRIENTE",
          tabla: "pago",
          registroId: pago.id,
          detalles: `Registró pago de $${monto} (${metodo}) para ${cliente.nombre}`,
        },
      });

      res.status(201).json({
        mensaje: "Pago registrado exitosamente",
        pago,
        cuentaActualizada,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /cuenta-corriente/reporte/resumen - Resumen de cuentas vencidas
router.get(
  "/reporte/resumen",
  authenticateToken,
  requireRole("DUENO", "GERENTE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const cuentas = await prisma.cuentaCorriente.findMany({
        include: {
          cliente: true,
          pagos: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      const resumen = {
        totalCuentas: cuentas.length,
        cuentasSinDeuda: cuentas.filter((c) => c.saldo === 0).length,
        cuentasConDeuda: cuentas.filter((c) => c.saldo > 0).length,
        deudaTotal: cuentas.reduce((sum, c) => sum + c.saldo, 0),
        cuentasActivas: cuentas.map((c) => ({
          cliente: c.cliente.nombre,
          saldo: c.saldo,
          ultimoPago: c.pagos[0]?.createdAt || "Nunca pagó",
        })),
      };

      res.json(resumen);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
