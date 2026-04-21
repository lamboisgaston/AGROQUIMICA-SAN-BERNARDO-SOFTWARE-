import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /presupuestos - Listar todos
router.get(
  "/",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const presupuestos = await prisma.presupuesto.findMany({
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

      res.json(presupuestos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /presupuestos/:id - Obtener presupuesto
router.get(
  "/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const presupuesto = await prisma.presupuesto.findUnique({
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

      if (!presupuesto) {
        return res.status(404).json({ error: "Presupuesto no encontrado" });
      }

      res.json(presupuesto);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /presupuestos - Crear presupuesto
router.post(
  "/",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { clienteId, items } = req.body;

      if (!clienteId || !items || items.length === 0) {
        return res.status(400).json({
          error: "Falta clienteId o items vacío",
        });
      }

      // Obtener cliente
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
      });

      if (!cliente) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }

      // REGLA OBLIGATORIA: Cliente debe tener teléfono
      if (!cliente.telefono) {
        return res.status(400).json({
          error: "El cliente debe tener teléfono registrado",
        });
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

      // Crear presupuesto
      const presupuesto = await prisma.presupuesto.create({
        data: {
          clienteId,
          usuarioId: req.user!.id,
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

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "CREATE_PRESUPUESTO",
          tabla: "presupuesto",
          registroId: presupuesto.id,
          detalles: `Creó presupuesto para ${cliente.nombre} por $${total}`,
        },
      });

      res.status(201).json({
        mensaje: "Presupuesto creado exitosamente",
        presupuesto,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// PATCH /presupuestos/:id - Actualizar estado
router.patch(
  "/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { estado } = req.body;

      const estadosValidos = ["PENDIENTE", "ACEPTADO", "RECHAZADO", "CONVERTIDO"];
      if (!estado || !estadosValidos.includes(estado)) {
        return res.status(400).json({
          error: `Estado inválido. Valores válidos: ${estadosValidos.join(", ")}`,
        });
      }

      const presupuesto = await prisma.presupuesto.update({
        where: { id: req.params.id },
        data: { estado: estado as any },
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

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "UPDATE_PRESUPUESTO",
          tabla: "presupuesto",
          registroId: req.params.id,
          detalles: `Cambió estado a ${estado}`,
        },
      });

      res.json({
        mensaje: "Presupuesto actualizado",
        presupuesto,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
