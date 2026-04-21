import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import bcrypt from "bcryptjs";

const router = Router();
const prisma = new PrismaClient();

// GET /usuarios - Listar todos (solo DUENO y GERENTE)
router.get(
  "/",
  authenticateToken,
  requireRole("DUENO", "GERENTE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const usuarios = await prisma.usuario.findMany({
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
          createdAt: true,
        },
      });

      res.json(usuarios);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /usuarios/:id - Obtener usuario
router.get(
  "/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      // Los usuarios normales solo ven su propio perfil
      if (
        req.user?.rol !== "DUENO" &&
        req.user?.rol !== "GERENTE" &&
        req.user?.id !== req.params.id
      ) {
        return res.status(403).json({
          error: "No tienes permiso para ver este usuario",
        });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
          createdAt: true,
        },
      });

      if (!usuario) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      res.json(usuario);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /usuarios - Crear usuario (solo DUENO)
router.post(
  "/",
  authenticateToken,
  requireRole("DUENO"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { nombre, email, password, rol } = req.body;

      if (!nombre || !email || !password || !rol) {
        return res.status(400).json({
          error: "Falta nombre, email, password o rol",
        });
      }

      const rolesValidos = ["DUENO", "GERENTE", "CAJA", "MOSTRADOR"];
      if (!rolesValidos.includes(rol)) {
        return res.status(400).json({
          error: `Rol inválido. Valores válidos: ${rolesValidos.join(", ")}`,
        });
      }

      const usuarioExistente = await prisma.usuario.findUnique({
        where: { email },
      });

      if (usuarioExistente) {
        return res.status(400).json({
          error: "El email ya está registrado",
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const usuario = await prisma.usuario.create({
        data: {
          nombre,
          email,
          password: passwordHash,
          rol: rol as any,
        },
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
        },
      });

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "CREATE_USUARIO",
          tabla: "usuario",
          registroId: usuario.id,
          detalles: `Creó usuario ${usuario.email} con rol ${usuario.rol}`,
        },
      });

      res.status(201).json({
        mensaje: "Usuario creado exitosamente",
        usuario,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// PATCH /usuarios/:id - Actualizar usuario (solo DUENO o el mismo usuario)
router.patch(
  "/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      // Solo DUENO puede cambiar rol, o el usuario puede cambiar sus datos
      if (
        req.user?.id !== req.params.id &&
        req.user?.rol !== "DUENO"
      ) {
        return res.status(403).json({
          error: "No tienes permiso para modificar este usuario",
        });
      }

      // Verificar que no se intente cambiar el rol sin ser DUENO
      if (req.body.rol && req.user?.rol !== "DUENO") {
        return res.status(403).json({
          error: "Solo DUENO puede cambiar roles",
        });
      }

      const { nombre, password } = req.body;
      const updateData: any = {};

      if (nombre) updateData.nombre = nombre;
      if (password) updateData.password = await bcrypt.hash(password, 10);

      const usuarioActualizado = await prisma.usuario.update({
        where: { id: req.params.id },
        data: updateData,
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
        },
      });

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "UPDATE_USUARIO",
          tabla: "usuario",
          registroId: req.params.id,
          detalles: `Actualizó usuario ${usuarioActualizado.email}`,
        },
      });

      res.json({
        mensaje: "Usuario actualizado",
        usuario: usuarioActualizado,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// DELETE /usuarios/:id - Desactivar usuario (solo DUENO)
router.delete(
  "/:id",
  authenticateToken,
  requireRole("DUENO"),
  async (req: AuthRequest, res: Response) => {
    try {
      // No permitir desactivarse a sí mismo
      if (req.user?.id === req.params.id) {
        return res.status(400).json({
          error: "No puedes desactivarte a ti mismo",
        });
      }

      const usuario = await prisma.usuario.update({
        where: { id: req.params.id },
        data: { activo: false },
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
        },
      });

      // Registrar en auditoría
      await prisma.auditoria.create({
        data: {
          usuarioId: req.user!.id,
          accion: "DELETE_USUARIO",
          tabla: "usuario",
          registroId: req.params.id,
          detalles: `Desactivó usuario ${usuario.email}`,
        },
      });

      res.json({
        mensaje: "Usuario desactivado",
        usuario,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
