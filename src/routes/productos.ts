import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { precioService } from "../services/precioService";

const router = Router();
const prisma = new PrismaClient();

// GET /productos - Listar productos
router.get(
  "/",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const productos = await prisma.producto.findMany({
        where: { activo: true },
        include: {
          tiposProducto: true,
        },
        orderBy: { nombre: "asc" },
      });

      res.json(productos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /productos/:id - Obtener producto
router.get(
  "/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const producto = await prisma.producto.findUnique({
        where: { id: req.params.id },
        include: {
          tiposProducto: true,
          historioPrecio: {
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              usuario: {
                select: { id: true, nombre: true, email: true },
              },
            },
          },
        },
      });

      if (!producto) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      res.json(producto);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /productos - Crear producto con cálculo automático
router.post(
  "/",
  authenticateToken,
  requireRole("DUENO", "GERENTE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        nombre,
        sku,
        costoBase,
        monedaCosto,
        flete,
        iva,
        margenGanancia,
        stock,
      } = req.body;

      if (!nombre || costoBase === undefined) {
        return res.status(400).json({
          error: "Falta nombre o costoBase",
        });
      }

      // Obtener tipo de cambio si es USD
      let tipoCambio = 1;
      if (monedaCosto === "USD") {
        tipoCambio = await precioService.obtenerTipoCambio();
      }

      // Calcular precio
      const resultado = precioService.calcularPrecio({
        costoBase,
        moneda: monedaCosto || "ARS",
        flete: flete || 0,
        iva: iva || 21,
        margenGanancia: margenGanancia || 30,
        tipoCambio,
      });

      // Crear producto
      const producto = await prisma.producto.create({
        data: {
          nombre,
          sku,
          costoBase,
          monedaCosto: monedaCosto || "ARS",
          flete: flete || 0,
          iva: iva || 21,
          margenGanancia: margenGanancia || 30,
          precioVenta: resultado.precioVenta,
          stock: stock || 0,
        },
        include: {
          tiposProducto: true,
        },
      });

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "CREATE_PRODUCTO",
          tabla: "producto",
          registroId: producto.id,
          detalles: `Creó producto ${producto.nombre} - Precio: $${resultado.precioVenta}`,
        },
      });

      res.status(201).json({
        mensaje: "Producto creado",
        producto,
        calculo: resultado,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// PATCH /productos/:id - Actualizar producto y recalcular precio
router.patch(
  "/:id",
  authenticateToken,
  requireRole("DUENO", "GERENTE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        nombre,
        costoBase,
        monedaCosto,
        flete,
        iva,
        margenGanancia,
        stock,
        razonCambio,
      } = req.body;

      // Obtener producto anterior
      const productoAnterior = await prisma.producto.findUnique({
        where: { id: req.params.id },
      });

      if (!productoAnterior) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      // Usar valores nuevos o los anteriores
      const config = {
        costoBase: costoBase ?? productoAnterior.costoBase,
        moneda: (monedaCosto || productoAnterior.monedaCosto) as "ARS" | "USD",
        flete: flete ?? productoAnterior.flete,
        iva: iva ?? productoAnterior.iva,
        margenGanancia: margenGanancia ?? productoAnterior.margenGanancia,
      };

      // Obtener tipo de cambio si es USD
      let tipoCambio = 1;
      if (config.moneda === "USD") {
        tipoCambio = await precioService.obtenerTipoCambio();
      }

      // Calcular nuevo precio
      const resultado = precioService.calcularPrecio({
        ...config,
        tipoCambio,
      });

      // Actualizar producto
      const productoActualizado = await prisma.producto.update({
        where: { id: req.params.id },
        data: {
          nombre: nombre || undefined,
          costoBase: config.costoBase,
          monedaCosto: config.moneda,
          flete: config.flete,
          iva: config.iva,
          margenGanancia: config.margenGanancia,
          precioVenta: resultado.precioVenta,
          stock: stock ?? undefined,
        },
        include: {
          tiposProducto: true,
        },
      });

      // Registrar cambio de precio en historial
      if (resultado.precioVenta !== productoAnterior.precioVenta) {
        await prisma.historialprecio.create({
          data: {
            productoId: req.params.id,
            usuarioId: req.user!.id,
            precioAnterior: productoAnterior.precioVenta,
            precioNuevo: resultado.precioVenta,
            costoBaseAnterior: productoAnterior.costoBase,
            costoBaseNuevo: config.costoBase,
            margenAnterior: productoAnterior.margenGanancia,
            margenNuevo: config.margenGanancia,
            razon: razonCambio || "Actualización manual",
          },
        });
      }

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "UPDATE_PRODUCTO",
          tabla: "producto",
          registroId: req.params.id,
          detalles: `Actualizó ${productoAnterior.nombre} - Precio anterior: $${productoAnterior.precioVenta}, Nuevo: $${resultado.precioVenta}`,
        },
      });

      res.json({
        mensaje: "Producto actualizado",
        producto: productoActualizado,
        calculo: resultado,
        precioAnterior: productoAnterior.precioVenta,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// POST /productos/importar - Importar productos desde JSON
router.post(
  "/importar/json",
  authenticateToken,
  requireRole("DUENO", "GERENTE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { productos } = req.body;

      if (!Array.isArray(productos)) {
        return res.status(400).json({
          error: "Debe enviar un array de productos",
        });
      }

      // Obtener tipo de cambio
      let tipoCambio = 1;
      try {
        tipoCambio = await precioService.obtenerTipoCambio();
      } catch (e) {
        // Si no hay tipo de cambio, usamos 1
        console.log("Usando tipo de cambio por defecto 1");
      }

      const productosCreados = [];
      const errores = [];

      for (let i = 0; i < productos.length; i++) {
        try {
          const p = productos[i];

          if (!p.nombre || p.costoBase === undefined) {
            errores.push({
              indice: i,
              error: "Falta nombre o costoBase",
              producto: p.nombre,
            });
            continue;
          }

          // Calcular precio
          const resultado = precioService.calcularPrecio({
            costoBase: p.costoBase,
            moneda: p.monedaCosto || "ARS",
            flete: p.flete || 0,
            iva: p.iva || 21,
            margenGanancia: p.margenGanancia || 30,
            tipoCambio,
          });

          // Crear producto
          const producto = await prisma.producto.create({
            data: {
              nombre: p.nombre,
              sku: p.sku,
              costoBase: p.costoBase,
              monedaCosto: p.monedaCosto || "ARS",
              flete: p.flete || 0,
              iva: p.iva || 21,
              margenGanancia: p.margenGanancia || 30,
              precioVenta: resultado.precioVenta,
              stock: p.stock || 0,
            },
          });

          productosCreados.push({
            id: producto.id,
            nombre: producto.nombre,
            precioVenta: producto.precioVenta,
          });

          // Registrar en auditoría
          await prisma.auditoria.create({
            data: {
              usuarioId: req.user!.id,
              accion: "IMPORT_PRODUCTO",
              tabla: "producto",
              registroId: producto.id,
              detalles: `Importó ${producto.nombre}`,
            },
          });
        } catch (error: any) {
          errores.push({
            indice: i,
            error: error.message,
            producto: productos[i].nombre,
          });
        }
      }

      res.status(201).json({
        mensaje: `Se importaron ${productosCreados.length} productos`,
        productosCreados,
        errores: errores.length > 0 ? errores : undefined,
        resumen: {
          total: productos.length,
          exitosos: productosCreados.length,
          fallos: errores.length,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// PUT /productos/:id/precio-manual - Establecer precio manualmente
router.put(
  "/:id/precio-manual",
  authenticateToken,
  requireRole("DUENO"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { precioVenta, razon } = req.body;

      if (precioVenta === undefined || precioVenta <= 0) {
        return res.status(400).json({
          error: "Precio debe ser mayor a 0",
        });
      }

      const producto = await prisma.producto.findUnique({
        where: { id: req.params.id },
      });

      if (!producto) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      const actualizado = await prisma.producto.update({
        where: { id: req.params.id },
        data: { precioVenta },
      });

      // Registrar cambio
      await prisma.historialprecio.create({
        data: {
          productoId: req.params.id,
          usuarioId: req.user!.id,
          precioAnterior: producto.precioVenta,
          precioNuevo: precioVenta,
          costoBaseAnterior: producto.costoBase,
          costoBaseNuevo: producto.costoBase,
          margenAnterior: producto.margenGanancia,
          margenNuevo: producto.margenGanancia,
          razon: razon || "Fijación manual de precio",
        },
      });

      res.json({
        mensaje: "Precio actualizado manualmente",
        producto: actualizado,
        precioAnterior: producto.precioVenta,
        precioNuevo: precioVenta,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
