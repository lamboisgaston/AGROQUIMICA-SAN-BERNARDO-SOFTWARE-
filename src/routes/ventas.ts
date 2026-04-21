import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /ventas - Listar todas
router.get(
  "/",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const ventas = await prisma.venta.findMany({
        include: {
          cliente: true,
          usuario: {
            select: { id: true, nombre: true, email: true },
          },
          items: {
            include: { producto: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(ventas);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /ventas/:id - Obtener venta
router.get(
  "/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const venta = await prisma.venta.findUnique({
        where: { id: req.params.id },
        include: {
          cliente: true,
          usuario: {
            select: { id: true, nombre: true, email: true },
          },
          items: {
            include: { producto: true },
          },
        },
      });

      if (!venta) {
        return res.status(404).json({ error: "Venta no encontrada" });
      }

      res.json(venta);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /ventas - Crear venta
router.post(
  "/",
  authenticateToken,
  requireRole("CAJA", "MOSTRADOR"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { clienteId, items, tipoVenta } = req.body;

      if (!clienteId || !items || items.length === 0) {
        return res.status(400).json({
          error: "Falta clienteId o items vacío",
        });
      }

      // REGLA OBLIGATORIA: Toda venta debe ser CON_FACTURA o SIN_FACTURA
      if (!tipoVenta || !["CON_FACTURA", "SIN_FACTURA"].includes(tipoVenta)) {
        return res.status(400).json({
          error: "Tipo de venta inválido. Debe ser CON_FACTURA o SIN_FACTURA",
        });
      }

      // Obtener cliente
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
      });

      if (!cliente) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }

      // Validar y obtener productos
      let total = 0;
      const productosValidos = await Promise.all(
        items.map(async (item: any) => {
          const producto = await prisma.producto.findUnique({
            where: { id: item.productoId },
          });

          if (!producto) {
            throw new Error(`Producto ${item.productoId} no encontrado`);
          }

          if (item.cantidad <= 0) {
            throw new Error("La cantidad debe ser mayor a 0");
          }

          // Validar stock
          if (producto.stock < item.cantidad) {
            throw new Error(
              `Stock insuficiente de ${producto.nombre}. Disponible: ${producto.stock}`
            );
          }

          const subtotal = producto.precio * item.cantidad;
          total += subtotal;

          return {
            productoId: producto.id,
            cantidad: item.cantidad,
            precio: producto.precio,
            subtotal,
          };
        })
      );

      // Crear venta
      const venta = await prisma.venta.create({
        data: {
          clienteId,
          usuarioId: req.user!.id,
          tipoVenta,
          total,
          items: {
            create: productosValidos,
          },
        },
        include: {
          cliente: true,
          usuario: {
            select: { id: true, nombre: true, email: true },
          },
          items: {
            include: { producto: true },
          },
        },
      });

      // Actualizar stock de productos
      for (const item of items) {
        await prisma.producto.update({
          where: { id: item.productoId },
          data: {
            stock: {
              decrement: item.cantidad,
            },
          },
        });
      }

      // Si no es al contado, registrar en cuenta corriente
      if (tipoVenta === "SIN_FACTURA") {
        let cuentaCorriente = await prisma.cuentaCorriente.findUnique({
          where: { clienteId },
        });

        if (!cuentaCorriente) {
          cuentaCorriente = await prisma.cuentaCorriente.create({
            data: {
              clienteId,
              saldo: total,
            },
          });
        } else {
          await prisma.cuentaCorriente.update({
            where: { id: cuentaCorriente.id },
            data: {
              saldo: {
                increment: total,
              },
            },
          });
        }
      }

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "CREATE_VENTA",
          tabla: "venta",
          registroId: venta.id,
          detalles: `Venta ${tipoVenta} a ${cliente.nombre} por $${total}`,
        },
      });

      res.status(201).json({
        mensaje: "Venta registrada exitosamente",
        venta,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

export default router;
