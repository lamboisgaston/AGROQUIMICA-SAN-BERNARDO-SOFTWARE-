import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface ConfiguracionPrecio {
  costoBase: number;
  moneda: "ARS" | "USD";
  flete?: number;
  iva?: number;
  margenGanancia?: number;
  tipoCambio?: number; // Para convertir USD a ARS
}

export interface ResultadoPrecio {
  costoBase: number;
  monedaCosto: string;
  costoEnARS: number;
  flete: number;
  subtotalConFlete: number;
  ivaPorc: number;
  montoIVA: number;
  subtotalConIVA: number;
  margenPorc: number;
  margenMoneda: number;
  precioVenta: number;
  detalles: string;
}

/**
 * CÁLCULO TOP-DOWN (de arriba para abajo):
 * 
 * 1. Costo base en ARS (si es USD, convertir usando tipo de cambio)
 * 2. + Flete
 * 3. + IVA (porcentaje sobre subtotal)
 * 4. + Margen de ganancia (porcentaje sobre total acumulado)
 * = PRECIO DE VENTA
 */
export const precioService = {
  /**
   * Obtener tipo de cambio USD/ARS actual
   */
  async obtenerTipoCambio(): Promise<number> {
    const tipoCambio = await prisma.tipoCambio.findFirst({
      where: {
        monedaDe: "USD",
        monedaA: "ARS",
        activo: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!tipoCambio) {
      throw new Error("No hay tipo de cambio configurado para USD/ARS");
    }

    return tipoCambio.tasa;
  },

  /**
   * Calcular precio final con fórmula top-down
   */
  calcularPrecio(config: ConfiguracionPrecio): ResultadoPrecio {
    const {
      costoBase,
      moneda,
      flete = 0,
      iva = 21,
      margenGanancia = 30,
      tipoCambio = 1,
    } = config;

    // Paso 1: Convertir costo a ARS si es USD
    const costoEnARS = moneda === "USD" ? costoBase * tipoCambio : costoBase;

    // Paso 2: Agregar flete
    const subtotalConFlete = costoEnARS + flete;

    // Paso 3: Calcular IVA
    const montoIVA = subtotalConFlete * (iva / 100);
    const subtotalConIVA = subtotalConFlete + montoIVA;

    // Paso 4: Calcular margen de ganancia
    const margenMoneda = subtotalConIVA * (margenGanancia / 100);
    const precioVenta = subtotalConIVA + margenMoneda;

    return {
      costoBase,
      monedaCosto: moneda,
      costoEnARS,
      flete,
      subtotalConFlete,
      ivaPorc: iva,
      montoIVA,
      subtotalConIVA,
      margenPorc: margenGanancia,
      margenMoneda,
      precioVenta: Math.round(precioVenta * 100) / 100, // Redondear a 2 decimales
      detalles: `
Costo base: $${costoBase.toFixed(2)} ${moneda}
↓ Convertir a ARS ${moneda === "USD" ? `(${tipoCambio})` : "(ya está en ARS)"}: $${costoEnARS.toFixed(2)}
+ Flete: $${flete.toFixed(2)}
= Subtotal: $${subtotalConFlete.toFixed(2)}
+ IVA (${iva}%): $${montoIVA.toFixed(2)}
= Subtotal con IVA: $${subtotalConIVA.toFixed(2)}
+ Margen (${margenGanancia}%): $${margenMoneda.toFixed(2)}
= PRECIO VENTA: $${precioVenta.toFixed(2)}
      `.trim(),
    };
  },

  /**
   * Actualizar tipo de cambio
   */
  async actualizarTipoCambio(tasa: number, usuario: string) {
    // Desactivar anterior
    await prisma.tipoCambio.updateMany({
      where: {
        monedaDe: "USD",
        monedaA: "ARS",
        activo: true,
      },
      data: { activo: false },
    });

    // Crear nuevo
    const nuevoTipo = await prisma.tipoCambio.create({
      data: {
        monedaDe: "USD",
        monedaA: "ARS",
        tasa,
      },
    });

    return nuevoTipo;
  },

  /**
   * Recalcular todos los productos (útil si cambia el tipo de cambio)
   */
  async recalcularTodosProductos(usuarioId: string) {
    const tipoCambio = await this.obtenerTipoCambio();
    const productos = await prisma.producto.findMany({
      where: { activo: true },
    });

    let productosActualizados = 0;

    for (const producto of productos) {
      const resultado = this.calcularPrecio({
        costoBase: producto.costoBase,
        moneda: producto.monedaCosto,
        flete: producto.flete,
        iva: producto.iva,
        margenGanancia: producto.margenGanancia,
        tipoCambio,
      });

      // Solo actualizar si cambió el precio
      if (resultado.precioVenta !== producto.precioVenta) {
        await prisma.producto.update({
          where: { id: producto.id },
          data: { precioVenta: resultado.precioVenta },
        });

        // Registrar en historial
        await prisma.historialprecio.create({
          data: {
            productoId: producto.id,
            usuarioId,
            precioAnterior: producto.precioVenta,
            precioNuevo: resultado.precioVenta,
            costoBaseAnterior: producto.costoBase,
            costoBaseNuevo: producto.costoBase,
            margenAnterior: producto.margenGanancia,
            margenNuevo: producto.margenGanancia,
            razon: "Recálculo por cambio de tipo de cambio",
          },
        });

        productosActualizados++;
      }
    }

    return productosActualizados;
  },
};
